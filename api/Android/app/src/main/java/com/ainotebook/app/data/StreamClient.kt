package com.ainotebook.app.data

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSource
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

/**
 * Consumes the backend's Server-Sent Events stream from
 * POST /api/chats/{id}/stream and emits incremental tokens.
 *
 * Provider-agnostic: tolerates the slightly different SSE payload shapes used
 * by Groq, Gemini and Kimi (and OpenAI-compatible gateways), e.g.
 *   data: {"token":"..."}
 *   data: {"delta":"..."}
 *   data: {"content":"..."}
 *   data: {"text":"..."}
 *   data: {"choices":[{"delta":{"content":"..."}}]}     (OpenAI / Groq / Kimi)
 *   data: {"done":true,"message_id":123}
 *   data: [DONE]                                          (OpenAI-style sentinel)
 *
 * Guarantees:
 *  - Always returns a clean Flow<StreamEvent>.
 *  - Never throws into the collector; failures are emitted as StreamEvent.Error.
 *  - Always reaches exactly one terminal event (Done or Error) before closing.
 *  - Cancels the underlying HTTP call on close so no socket leaks.
 */
sealed class StreamEvent {
    data class Token(val text: String) : StreamEvent()
    data class Done(val messageId: Int?) : StreamEvent()
    data class Error(val message: String, val retryable: Boolean = false) : StreamEvent()
}

object StreamClient {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // Tuning knobs
    private const val MAX_RETRIES = 2
    private const val INITIAL_BACKOFF_MS = 600L
    private const val MAX_BACKOFF_MS = 4_000L
    private const val CALL_TIMEOUT_SECONDS = 0L          // 0 = no overall cap (streaming can be long)
    private const val READ_TIMEOUT_SECONDS = 90L         // idle read timeout between tokens
    private const val CONNECT_TIMEOUT_SECONDS = 5L

    fun streamMessage(
        chatId: Int,
        content: String,
        token: String?,
        model: String? = null
    ): Flow<StreamEvent> = callbackFlow {
        // Tracks whether we already emitted Done/Error so close() is always clean.
        var terminated = false

        fun emitTerminal(event: StreamEvent) {
            if (terminated) return
            terminated = true
            if (!isClosedForSend) trySend(event)
        }

        // ---- Build request once; reused across retries ----
        val url = ApiClient.baseUrl() + "api/chats/$chatId/stream"
        val mediaType = "application/json".toMediaType()
        // Only send an override when a concrete provider is chosen ("auto"
        // lets the backend pick via the fallback chain, matching the web app).
        val override = model?.takeIf { it.isNotBlank() && it != "auto" }
        val payload = runCatching {
            json.encodeToString(StreamRequest.serializer(), StreamRequest(content, override))
        }.getOrElse {
            emitTerminal(StreamEvent.Error("Failed to build request: ${it.message}"))
            close()
            return@callbackFlow
        }

        // Per-request OkHttp client with streaming-friendly timeouts.
        val streamingClient = ApiClient.okHttp.newBuilder()
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        fun buildCall(): Call {
            val reqBuilder = Request.Builder()
                .url(url)
                .addHeader("Accept", "text/event-stream")
                .addHeader("Cache-Control", "no-cache")
                .post(payload.toRequestBody(mediaType))
            if (!token.isNullOrBlank()) {
                reqBuilder.addHeader("Authorization", "Bearer $token")
            }
            return streamingClient.newCall(reqBuilder.build())
        }

        // FIX 1: Removed the illegal nested `object StreamClient { ... }` block.
        // `activeCall` is simply a local variable captured by the awaitClose lambda.
        var activeCall: Call? = null

        // ---- Retry loop ----
        var attempt = 0
        var backoff = INITIAL_BACKOFF_MS

        while (attempt <= MAX_RETRIES && !terminated && currentCoroutineContext().isActive) {

            // Result of a single attempt: DONE = finished (terminal emitted or success),
            // RETRY = retryable transient failure.
            val attemptOutcome: AttemptResult = try {

                // FIX 2: Removed the duplicate `val call = buildCall()` declaration.
                val call = buildCall()
                activeCall = call

                call.execute().use { response ->
                    when {
                        response.code == 401 || response.code == 403 -> {
                            emitTerminal(StreamEvent.Error(httpErrorMessage(response.code, response.body?.string().orEmpty()), retryable = false))
                            AttemptResult.DONE
                        }
                        response.code == 429 || response.code in 500..599 -> {
                            // Server-side transient — worth retrying.
                            AttemptResult.RETRY("Notely is temporarily busy")
                        }
                        !response.isSuccessful -> {
                            // FastAPI returns useful validation details for 400/422 responses.
                            // Preserve those details instead of hiding every failure as a generic 400.
                            emitTerminal(StreamEvent.Error(httpErrorMessage(response.code, response.body?.string().orEmpty()), retryable = false))
                            AttemptResult.DONE
                        }
                        else -> {
                            val source = response.body?.source()
                            if (source == null) {
                                emitTerminal(StreamEvent.Error("Notely isn't responding right now. Please try again in a moment.", retryable = false))
                                AttemptResult.DONE
                            } else {
                                consumeStream(source, ::emitTerminal) { ev -> if (!isClosedForSend) trySend(ev) }
                            }
                        }
                    }
                }
            } catch (e: CancellationException) {
                // Flow collector cancelled — do not emit, just stop.
                throw e
            } catch (e: SocketTimeoutException) {
                AttemptResult.RETRY("Network timeout")
            } catch (e: InterruptedIOException) {
                AttemptResult.RETRY("Connection interrupted")
            } catch (e: IOException) {
                AttemptResult.RETRY(e.message ?: "Network error")
            } catch (e: Exception) {
                // Unexpected — never crash silently.
                emitTerminal(StreamEvent.Error("Notely isn't responding right now. Please try again in a moment.", retryable = false))
                AttemptResult.DONE
            }

            when (attemptOutcome) {
                is AttemptResult.DONE -> break
                is AttemptResult.RETRY -> {
                    attempt++
                    if (attempt > MAX_RETRIES || !isActive) {
                        emitTerminal(StreamEvent.Error(attemptOutcome.reason, retryable = true))
                        break
                    }
                    // Backoff before retrying; abort early if collector cancelled.
                    val waited = runCatching { delay(backoff) }.isSuccess
                    if (!waited || !isActive) break
                    backoff = (backoff * 2).coerceAtMost(MAX_BACKOFF_MS)
                }
            }
        }

        // Safety net: if loop exited without any terminal event, emit Done so the
        // collector is never left hanging (prevents perpetual "Streaming…" state).
        if (!terminated) {
            emitTerminal(StreamEvent.Done(null))
        }

        close()

        awaitClose {
            runCatching { activeCall?.cancel() }
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Reads and parses the SSE body line-by-line. Emits Token/Done via [emit] and
     * routes the single terminal event through [emitTerminal].
     * Returns DONE on a clean end, or RETRY if the stream ends abruptly without
     * a terminal marker (so the caller can retry).
     */
    private fun consumeStream(
        source: BufferedSource,
        emitTerminal: (StreamEvent) -> Unit,
        emit: (StreamEvent) -> Unit
    ): AttemptResult {
        var sawDone = false
        var sawAnyToken = false
        // Buffer for multi-line SSE `data:` accumulation (Gemini can split frames).
        val dataBuffer = StringBuilder()

        try {
            while (true) {
                val line = source.readUtf8Line() ?: break

                // Blank line == end of one SSE event; flush buffered data.
                if (line.isBlank()) {
                    if (dataBuffer.isNotEmpty()) {
                        val handled = handleData(dataBuffer.toString().trim(), emitTerminal, emit)
                        if (handled.token) sawAnyToken = true
                        if (handled.done) { sawDone = true; break }
                        dataBuffer.setLength(0)
                    }
                    continue
                }

                // Ignore SSE comments / event/id fields we don't use.
                if (line.startsWith(":")) continue
                if (!line.startsWith("data:")) continue

                val chunk = line.removePrefix("data:").trim()
                if (chunk.isEmpty()) continue

                // OpenAI-style termination sentinel.
                if (chunk == "[DONE]") { sawDone = true; break }

                // Accumulate; flushed on blank line, but also try eager parse
                // for single-line JSON frames (Groq/Kimi/most providers).
                if (dataBuffer.isEmpty()) {
                    val handled = handleData(chunk, emitTerminal, emit)
                    if (handled.token) sawAnyToken = true
                    if (handled.done) { sawDone = true; break }
                    // If it wasn't valid JSON on its own, buffer for multi-line join.
                    if (!handled.parsed) dataBuffer.append(chunk)
                } else {
                    dataBuffer.append(chunk)
                }
            }
        } catch (e: SocketTimeoutException) {
            return AttemptResult.RETRY("Network timeout")
        } catch (e: IOException) {
            // Abrupt end: retry only if we never got a clean terminal.
            return if (sawDone) AttemptResult.DONE else AttemptResult.RETRY(e.message ?: "Connection lost")
        }

        if (sawDone) {
            emitTerminal(StreamEvent.Done(null))
            return AttemptResult.DONE
        }
        // Stream ended without explicit [DONE]/done flag.
        return if (sawAnyToken) {
            // We received content but no terminal marker — treat as complete.
            emitTerminal(StreamEvent.Done(null))
            AttemptResult.DONE
        } else {
            // Nothing at all — let caller retry.
            AttemptResult.RETRY("Stream ended unexpectedly")
        }
    }

    private data class DataResult(
        val parsed: Boolean,
        val token: Boolean,
        val done: Boolean
    )

    /**
     * Parses one SSE data payload across provider formats and emits the
     * appropriate event. Returns whether it parsed and what it contained.
     */
    private fun handleData(
        data: String,
        emitTerminal: (StreamEvent) -> Unit,
        emit: (StreamEvent) -> Unit
    ): DataResult {
        if (data.isEmpty()) return DataResult(parsed = false, token = false, done = false)
        if (data == "[DONE]") {
            emitTerminal(StreamEvent.Done(null))
            return DataResult(parsed = true, token = false, done = true)
        }

        val obj = runCatching { json.parseToJsonElement(data).jsonObject }.getOrNull()
            ?: return DataResult(parsed = false, token = false, done = false)

        // Explicit completion flag (backend / Gemini finishReason).
        val doneFlag = obj["done"]?.jsonPrimitive?.booleanOrNull == true
        val finishReason = obj["finish_reason"]?.jsonPrimitive?.contentOrNull
            ?: obj["finishReason"]?.jsonPrimitive?.contentOrNull
            ?: extractChoiceFinishReason(obj)

        // Provider error frame inside the stream.
        extractError(obj)?.let { errMsg ->
            emitTerminal(StreamEvent.Error(errMsg, retryable = false))
            return DataResult(parsed = true, token = false, done = true)
        }

        // Extract token text across known shapes.
        val text = extractToken(obj)
        if (!text.isNullOrEmpty()) {
            emit(StreamEvent.Token(text))
        }

        if (doneFlag || finishReason != null && finishReason != "null") {
            val mid = obj["message_id"]?.jsonPrimitive?.intOrNull
                ?: obj["messageId"]?.jsonPrimitive?.intOrNull
            emitTerminal(StreamEvent.Done(mid))
            return DataResult(parsed = true, token = !text.isNullOrEmpty(), done = true)
        }

        return DataResult(parsed = true, token = !text.isNullOrEmpty(), done = false)
    }

    private fun httpErrorMessage(code: Int, body: String): String {
        val detail = runCatching {
            val value = json.parseToJsonElement(body).jsonObject["detail"]
            value?.jsonPrimitive?.contentOrNull
        }.getOrNull()?.takeIf { it.isNotBlank() }
        if (detail != null) return detail
        return when (code) {
            401, 403 -> "Your session has expired. Please sign in again."
            400, 422 -> "The server rejected this request ($code). Check the message and try again."
            else -> "The request failed ($code). Please try again."
        }
    }

    /** Pulls incremental text from any supported provider payload shape. */
    private fun extractToken(obj: JsonObject): String? {
        // 1. Backend/simple shapes.
        obj["token"]?.jsonPrimitive?.contentOrNull?.let { return it }
        obj["delta"]?.let { el ->
            // delta may be a string (simple) or an object (OpenAI).
            el.jsonPrimitive.contentOrNull?.let { return it }
        }
        obj["content"]?.jsonPrimitive?.contentOrNull?.let { return it }
        obj["text"]?.jsonPrimitive?.contentOrNull?.let { return it }

        // 2. OpenAI / Groq / Kimi: choices[].delta.content (or .text).
        (obj["choices"] as? JsonArray)?.let { choices ->
            val sb = StringBuilder()
            for (choice in choices) {
                val c = choice as? JsonObject ?: continue
                val delta = c["delta"] as? JsonObject
                val piece = delta?.get("content")?.jsonPrimitive?.contentOrNull
                    ?: c["text"]?.jsonPrimitive?.contentOrNull
                    ?: (c["message"] as? JsonObject)?.get("content")?.jsonPrimitive?.contentOrNull
                if (!piece.isNullOrEmpty()) sb.append(piece)
            }
            if (sb.isNotEmpty()) return sb.toString()
        }

        // 3. Gemini: candidates[].content.parts[].text
        (obj["candidates"] as? JsonArray)?.let { candidates ->
            val sb = StringBuilder()
            for (cand in candidates) {
                val c = cand as? JsonObject ?: continue
                val parts = (c["content"] as? JsonObject)?.get("parts") as? JsonArray ?: continue
                for (part in parts) {
                    (part as? JsonObject)?.get("text")?.jsonPrimitive?.contentOrNull?.let { sb.append(it) }
                }
            }
            if (sb.isNotEmpty()) return sb.toString()
        }

        return null
    }

    /** Detects an error object embedded in a streamed frame. */
    private fun extractError(obj: JsonObject): String? {
        (obj["error"])?.let { el ->
            (el as? JsonObject)?.let { eo ->
                val message = eo["message"]?.jsonPrimitive?.contentOrNull
                return message?.takeIf { it.isNotBlank() }
                    ?: "Notely is temporarily unavailable. Please try again."
            }
            el.jsonPrimitive.contentOrNull?.let { return "Notely is temporarily unavailable. Please try again." }
        }
        return null
    }

    private fun extractChoiceFinishReason(obj: JsonObject): String? {
        val choices = obj["choices"] as? JsonArray ?: return null
        for (choice in choices) {
            (choice as? JsonObject)?.get("finish_reason")?.jsonPrimitive?.contentOrNull?.let {
                if (it != "null") return it
            }
        }
        return null
    }

    /** Internal result type for the retry loop / stream consumer. */
    private sealed class AttemptResult {
        data object DONE : AttemptResult()
        data class RETRY(val reason: String) : AttemptResult()
    }
}
