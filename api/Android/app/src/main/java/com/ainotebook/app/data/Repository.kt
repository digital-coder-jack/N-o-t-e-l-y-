package com.ainotebook.app.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

/**
 * Thin repository wrapping [ApiClient] + [SessionStore]. Holds the session
 * lifecycle so view models stay free of networking details.
 *
 * All network calls are suspend (main-safe via ApiClient's dispatcher);
 * [streamMessage] intentionally returns a cold [Flow] and is NOT suspend.
 */
class Repository(private val session: SessionStore) {

    val tokenFlow get() = session.tokenFlow
    val userFlow get() = session.userFlow

    suspend fun currentToken(): String? = session.token()

    suspend fun accounts() = session.accounts()

    suspend fun switchAccount(userId: Int) = session.switchAccount(userId)

    suspend fun beginAddAccount() = session.beginAddAccount()

    /* ---------- Auth ---------- */
    suspend fun login(identifier: String, password: String): User {
        val res = ApiClient.api.login(LoginRequest(identifier, password))
        session.save(res.token, res.user)
        return res.user
    }

    suspend fun signup(
        name: String, username: String, email: String,
        password: String, confirm: String
    ): User {
        val res = ApiClient.api.signup(
            SignupRequest(name, username, email, password, confirm)
        )
        session.save(res.token, res.user)
        return res.user
    }

    suspend fun me(): User {
        val res = ApiClient.api.me()
        session.saveUser(res.user)
        return res.user
    }

    suspend fun updateProfile(name: String): User {
        val res = ApiClient.api.updateProfile(ProfileRequest(name))
        session.saveUser(res.user)
        return res.user
    }

    suspend fun changePassword(current: String, new: String): String =
        ApiClient.api.changePassword(ChangePasswordRequest(current, new)).message

    /**
     * Deletes the account server-side, then ALWAYS clears the local session.
     * The session is cleared in a `finally` block so a failed/partial network
     * call can never leave a stale token or user behind.
     */
    suspend fun deleteAccount(): String {
        val userId = session.userFlow.first()?.id
        return try {
            ApiClient.api.deleteAccount().message
        } finally {
            session.clear(preserveCurrent = false)
            if (userId != null) session.removeAccount(userId)
        }
    }

    /** Clears the local session. Resilient: never propagates a clear failure. */
    suspend fun logout() {
        session.clear()
    }

    /* ---------- Chats ---------- */
    suspend fun listChats() = ApiClient.api.listChats().chats

    suspend fun newChat(title: String? = null) =
        ApiClient.api.newChat(NewChatRequest(title)).chat

    suspend fun getChat(id: Int) = ApiClient.api.getChat(id)

    suspend fun renameChat(id: Int, title: String) =
        ApiClient.api.renameChat(id, RenameChatRequest(title)).chat

    suspend fun deleteChat(id: Int) = ApiClient.api.deleteChat(id)

    /**
     * Streams an assistant reply for [chatId]. Returns a cold [Flow] so the
     * caller controls collection/cancellation. If [token] is null, the stored
     * session token is used to keep streaming consistent with REST calls.
     */
    suspend fun streamMessage(
        chatId: Int,
        content: String,
        token: String? = null,
        model: String? = null
    ): Flow<StreamEvent> {
        val authToken = token ?: session.token()
        return StreamClient.streamMessage(chatId, content, authToken, model)
    }

    /* ---------- AI model selection ---------- */
    suspend fun aiModels() = ApiClient.api.aiModels()

    suspend fun setAiModel(model: String) =
        ApiClient.api.setAiModel(SetModelRequest(model)).selected

    /* ---------- Dashboard ---------- */
    suspend fun stats() = ApiClient.api.stats()

    /* ---------- Saved notes shared with web ---------- */
    suspend fun listSavedNotes() = ApiClient.api.listSavedNotes().notes.filter { it.deleted == 0 && it.archived == 0 }

    suspend fun createSavedNote(title: String, content: String = "") =
        ApiClient.api.createSavedNote(NoteSaveRequest(title, content)).note

    suspend fun updateSavedNote(id: Int, title: String, content: String) =
        ApiClient.api.updateSavedNote(id, NoteSaveRequest(title, content)).note

    suspend fun deleteSavedNote(id: Int) = ApiClient.api.deleteSavedNote(id)

    /* ---------- Study tools ---------- */
    suspend fun generateNotes(topic: String) =
        ApiClient.api.generateNotes(TopicRequest(topic))

    suspend fun generateQuiz(topic: String, n: Int) =
        ApiClient.api.generateQuiz(QuizRequest(topic, n))

    suspend fun generateFlashcards(topic: String, n: Int) =
        ApiClient.api.generateFlashcards(FlashRequest(topic, n))

    suspend fun generatePlan(goal: String, days: Int) =
        ApiClient.api.generatePlan(PlanRequest(goal, days))

    suspend fun summarize(text: String) =
        ApiClient.api.summarize(TextRequest(text))

    suspend fun homework(question: String) =
        ApiClient.api.homework(QuestionRequest(question))
}
