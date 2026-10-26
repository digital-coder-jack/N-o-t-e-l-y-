"""Centralized, defensive AI routing for Notely's three product tiers.

Product labels stay provider-agnostic. Health probes, retries, error classes,
and fallback live here so chat and every study tool share the same behavior.
Cooldowns and probe cache are intentionally per serverless instance.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import AsyncGenerator

import httpx

logger = logging.getLogger("ai-notebook.providers")

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
TIER_CONFIG: dict[str, dict[str, str]] = {
    "default": {
        "display_name": "AI Notebook",
        "provider": "gemini",
        "env": "GEMINI_API_KEY",
        "model_env": "GEMINI_MODEL",
        "model": os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
    },
    "pro": {
        "display_name": "AI Notebook Pro",
        "provider": "openrouter",
        "env": "OPENROUTER_API_KEY",
        "model_env": "OPENROUTER_MODEL",
        "model": os.environ.get("OPENROUTER_MODEL", "openrouter/free"),
    },
    "pro_max": {
        "display_name": "AI Notebook Pro Max",
        "provider": "groq",
        "env": "GROQ_API_KEY",
        "model_env": "GROQ_MODEL",
        "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b"),
    },
}
VALID_SELECTIONS = ["auto", "default", "pro", "pro_max"]
_LEGACY_SELECTIONS = {"ai_notebook": "default", "ai_notebook_light": "default"}
_FRIENDLY_ERRORS = {
    "invalid_key": "AI service authentication failed. Please contact Notely support.",
    "quota_or_rate_limit": "AI is busy or its current usage limit has been reached. Please try again shortly.",
    "model_not_found": "This AI model is temporarily unavailable. Try another model.",
    "bad_request": "The AI service could not process this request. Please shorten it and try again.",
    "timeout": "The AI response took too long. Please retry.",
    "network": "Could not reach the AI service. Please retry.",
    "provider_5xx": "The AI service is temporarily unavailable. Please retry.",
    "parse_error": "The AI service returned an unreadable response. Please retry.",
    "not_configured": "This AI tier is not configured yet.",
    "unavailable": "AI is temporarily unavailable. Please try again.",
}
_RETRY_STATUSES = {429, 500, 502, 503, 504}
_FALLBACK_CLASSES = {
    "invalid_key", "quota_or_rate_limit", "model_not_found", "timeout",
    "network", "provider_5xx", "parse_error", "unavailable",
}
_CONNECT_TIMEOUT = 5.0
_FIRST_TOKEN_TIMEOUT = 15.0
_STREAM_IDLE_TIMEOUT = float(os.environ.get("AI_STREAM_IDLE_TIMEOUT", "20"))
_STREAM_TOTAL_TIMEOUT = min(240.0, max(10.0, float(os.environ.get("AI_STREAM_TIMEOUT", "240"))))
_RETRY_MAX = 2
_COOLDOWN_SECONDS = 45.0
_COOLDOWNS: dict[str, float] = {}
_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL = int(os.environ.get("AI_CACHE_TTL", "900"))
_CACHE_MAX = 256
_PROBE_CACHE: dict[str, tuple[float, dict]] = {}
_PROBE_TTL = 60.0
_PROBE_LOCK = asyncio.Lock()


class ProviderFailure(Exception):
    def __init__(self, error_class: str, http_status: int | None = None):
        super().__init__(error_class)
        self.error_class = error_class
        self.http_status = http_status

    @property
    def friendly_message(self) -> str:
        return _FRIENDLY_ERRORS.get(self.error_class, _FRIENDLY_ERRORS["unavailable"])


def _normalize_selection(selection: str | None) -> str:
    choice = (selection or "auto").strip().lower()
    choice = _LEGACY_SELECTIONS.get(choice, choice)
    return choice if choice in TIER_CONFIG else "default"


def _tier(tier: str | None) -> dict[str, str]:
    return TIER_CONFIG[_normalize_selection(tier)]


def tier_display_name(tier: str | None) -> str:
    return _tier(tier)["display_name"]


def provider_key(tier: str | None = "default") -> str:
    return os.environ.get(_tier(tier)["env"], "").strip()


def provider_available(tier: str | None = "default") -> bool:
    return bool(provider_key(tier))


def available_tiers() -> list[str]:
    return [tier for tier in TIER_CONFIG if provider_available(tier)]


def resolve_order(selection: str | None) -> list[str]:
    """Auto/default tries default -> pro -> pro_max; explicit choices escalate."""
    choice = (selection or "auto").strip().lower()
    choice = _LEGACY_SELECTIONS.get(choice, choice)
    if choice in ("", "auto", "default"):
        return ["default", "pro", "pro_max"]
    if choice == "pro":
        return ["pro", "pro_max"]
    if choice == "pro_max":
        return ["pro_max"]
    return ["default", "pro", "pro_max"]


def _health(tier: str) -> dict:
    cached = _PROBE_CACHE.get(tier)
    if not cached:
        return {"state": "unknown", "last_probe": None, "ok": None}
    result = cached[1]
    return {
        "state": "ok" if result.get("ok") else "down",
        "last_probe": result.get("checked_at"),
        "ok": result.get("ok"),
    }


def status_snapshot() -> dict:
    tiers = []
    for tier, config in TIER_CONFIG.items():
        health = _health(tier)
        tiers.append({
            "id": tier,
            "label": config["display_name"],
            "configured": provider_available(tier),
            "health": health["state"],
            "last_probe": health["last_probe"],
            "ok": health["ok"],
        })
    configured = any(item["configured"] for item in tiers)
    known = [item for item in tiers if item["configured"] and item["health"] != "unknown"]
    healthy = [item for item in known if item["ok"]]
    if not configured or (known and not healthy):
        state = "down"
    elif healthy and len(healthy) == len([item for item in tiers if item["configured"]]):
        state = "ok"
    else:
        state = "degraded" if known or configured else "down"
    return {
        "available": bool(healthy) if known else configured,
        "health": state,
        "name": "AI Notebook",
        "providers": tiers,
        "tiers": tiers,
        "any_configured": configured,
        "fallback_order": [TIER_CONFIG[t]["display_name"] for t in ("default", "pro", "pro_max")],
        "health_scope": "last live probe on this serverless instance; unknown means not probed yet",
    }


def _cache_key(tier: str, messages: list[dict], temperature: float, max_tokens: int) -> str:
    raw = json.dumps({"tier": tier, "m": messages, "t": temperature, "k": max_tokens},
                     sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> str | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    if time.time() - hit[0] > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return hit[1]


def _cache_set(key: str, value: str) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.pop(min(_CACHE, key=lambda item: _CACHE[item][0]), None)
    _CACHE[key] = (time.time(), value)


def _timeout(total: float = 30.0) -> httpx.Timeout:
    return httpx.Timeout(connect=_CONNECT_TIMEOUT, read=total, write=10.0, pool=_CONNECT_TIMEOUT)


def _openai_headers(key: str, provider: str) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if provider == "openrouter":
        headers["HTTP-Referer"] = os.environ.get("OPENROUTER_SITE_URL", "https://notely-mwlq.vercel.app")
        headers["X-Title"] = os.environ.get("OPENROUTER_APP_NAME", "Notely")
    return headers


def _openai_payload(model: str, messages: list[dict], temperature: float,
                    max_tokens: int, stream: bool) -> dict:
    return {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }


def _gemini_contents(messages: list[dict]) -> tuple[list[dict], dict | None]:
    contents: list[dict] = []
    system_parts: list[dict] = []
    for message in messages:
        role = message.get("role", "user")
        value = str(message.get("content", ""))
        if not value:
            continue
        if role == "system":
            system_parts.append({"text": value})
        else:
            contents.append({"role": "model" if role == "assistant" else "user",
                             "parts": [{"text": value}]})
    return contents, ({"parts": system_parts} if system_parts else None)


def _gemini_payload(messages: list[dict], temperature: float, max_tokens: int) -> dict:
    contents, system = _gemini_contents(messages)
    payload = {"contents": contents, "generationConfig": {
        "temperature": temperature, "maxOutputTokens": max_tokens,
    }}
    if system:
        payload["systemInstruction"] = system
    return payload


def _classify_status(status: int) -> str:
    if status in (401, 403):
        return "invalid_key"
    if status == 429:
        return "quota_or_rate_limit"
    if status in (400, 404):
        return "model_not_found"
    if status >= 500:
        return "provider_5xx"
    return "bad_request"


def _retry_after(response: httpx.Response, attempt: int) -> float:
    raw = response.headers.get("Retry-After", "").strip()
    if raw:
        try:
            return min(8.0, max(0.0, float(raw)))
        except ValueError:
            try:
                dt = parsedate_to_datetime(raw)
                return min(8.0, max(0.0, (dt - datetime.now(timezone.utc)).total_seconds()))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(4.0, 0.5 * (2 ** attempt) + random.random() * 0.2)


def _record_failure(tier: str, error_class: str, status: int | None = None) -> None:
    if error_class in _FALLBACK_CLASSES:
        _COOLDOWNS[tier] = time.monotonic() + _COOLDOWN_SECONDS
    logger.warning("AI tier failure tier=%s class=%s status=%s", tier, error_class, status)


def _raise_for_response(response: httpx.Response) -> None:
    if response.status_code < 200 or response.status_code >= 300:
        raise ProviderFailure(_classify_status(response.status_code), response.status_code)


def _parse_openai_response(data: dict) -> str:
    try:
        value = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderFailure("parse_error") from exc
    if isinstance(value, list):
        value = "".join(str(item.get("text", "")) if isinstance(item, dict) else str(item)
                        for item in value)
    text = str(value or "").strip()
    if not text:
        raise ProviderFailure("parse_error")
    return text


def _parse_gemini_response(data: dict) -> str:
    try:
        parts = data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderFailure("parse_error") from exc
    text = "".join(str(part.get("text", "")) for part in parts if isinstance(part, dict)).strip()
    if not text:
        raise ProviderFailure("parse_error")
    return text


async def _post_with_retry(client: httpx.AsyncClient, tier: str, url: str, *,
                           json_body: dict, headers: dict, params: dict | None = None) -> httpx.Response:
    last: ProviderFailure | None = None
    for attempt in range(_RETRY_MAX + 1):
        try:
            response = await client.post(url, json=json_body, headers=headers, params=params)
        except httpx.TimeoutException as exc:
            raise ProviderFailure("timeout") from exc
        except httpx.RequestError as exc:
            raise ProviderFailure("network") from exc
        if response.status_code not in _RETRY_STATUSES or attempt >= _RETRY_MAX:
            _raise_for_response(response)
            return response
        last = ProviderFailure(_classify_status(response.status_code), response.status_code)
        await asyncio.sleep(_retry_after(response, attempt))
    raise last or ProviderFailure("unavailable")


async def _complete_tier(tier: str, messages: list[dict], temperature: float,
                         max_tokens: int, timeout: float = 30.0) -> str:
    config = _tier(tier)
    key = provider_key(tier)
    if not key:
        raise ProviderFailure("not_configured")
    async with httpx.AsyncClient(timeout=_timeout(timeout)) as client:
        if config["provider"] == "gemini":
            response = await _post_with_retry(
                client, tier,
                f"{GEMINI_BASE_URL}/models/{config['model']}:generateContent",
                json_body=_gemini_payload(messages, temperature, max_tokens),
                headers={"x-goog-api-key": key, "Content-Type": "application/json", "Accept": "application/json"},
            )
            data = response.json()
            return _parse_gemini_response(data)
        base = OPENROUTER_BASE_URL if config["provider"] == "openrouter" else GROQ_BASE_URL
        response = await _post_with_retry(
            client, tier, f"{base}/chat/completions",
            json_body=_openai_payload(config["model"], messages, temperature, max_tokens, False),
            headers=_openai_headers(key, config["provider"]),
        )
        return _parse_openai_response(response.json())


async def probe_tier(tier: str, *, force: bool = False) -> dict:
    """Run a real tiny completion; result is sanitized and cached per instance."""
    tier = _normalize_selection(tier)
    now = time.time()
    cached = _PROBE_CACHE.get(tier)
    if not force and cached and now - cached[0] < _PROBE_TTL:
        return dict(cached[1])
    async with _PROBE_LOCK:
        cached = _PROBE_CACHE.get(tier)
        now = time.time()
        if not force and cached and now - cached[0] < _PROBE_TTL:
            return dict(cached[1])
        started = time.perf_counter()
        status = None
        if not provider_available(tier):
            result = {
                "tier": tier, "ok": False, "http_status": None,
                "error_class": "not_configured", "latency_ms": 0,
                "model": TIER_CONFIG[tier]["model"], "checked_at": datetime.now(timezone.utc).isoformat(),
            }
        else:
            try:
                await _complete_tier(
                    tier, [{"role": "user", "content": "Reply with exactly: OK"}],
                    temperature=0.0, max_tokens=4, timeout=12.0,
                )
                result = {
                    "tier": tier, "ok": True, "http_status": 200, "error_class": None,
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "model": TIER_CONFIG[tier]["model"], "checked_at": datetime.now(timezone.utc).isoformat(),
                }
            except ProviderFailure as exc:
                status = exc.http_status
                result = {
                    "tier": tier, "ok": False, "http_status": status,
                    "error_class": exc.error_class,
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "model": TIER_CONFIG[tier]["model"], "checked_at": datetime.now(timezone.utc).isoformat(),
                }
                _record_failure(tier, exc.error_class, status)
            except (ValueError, TypeError):
                result = {
                    "tier": tier, "ok": False, "http_status": status, "error_class": "parse_error",
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "model": TIER_CONFIG[tier]["model"], "checked_at": datetime.now(timezone.utc).isoformat(),
                }
        _PROBE_CACHE[tier] = (time.time(), result)
        return dict(result)


async def diagnose_all(*, force: bool = False) -> list[dict]:
    return [await probe_tier(tier, force=force) for tier in TIER_CONFIG]


async def chat(messages: list[dict], *, selection: str | None = "auto", temperature: float = 0.7,
               max_tokens: int = 1024, use_cache: bool = True) -> tuple[str, str]:
    order = resolve_order(selection)
    last_error = "unavailable"
    for tier in order:
        if not provider_available(tier):
            last_error = "not_configured"
            continue
        cooldown = _COOLDOWNS.get(tier, 0)
        if cooldown > time.monotonic() and len(order) > 1:
            last_error = "unavailable"
            continue
        cache_key = _cache_key(tier, messages, temperature, max_tokens)
        if use_cache:
            cached = _cache_get(cache_key)
            if cached is not None:
                return tier, cached
        try:
            text = await _complete_tier(tier, messages, temperature, max_tokens)
            _COOLDOWNS.pop(tier, None)
            if use_cache:
                _cache_set(cache_key, text)
            return tier, text
        except ProviderFailure as exc:
            last_error = exc.error_class
            _record_failure(tier, exc.error_class, exc.http_status)
            if exc.error_class not in _FALLBACK_CLASSES:
                break
        except (ValueError, TypeError):
            last_error = "parse_error"
            _record_failure(tier, last_error)
    logger.warning("AI request exhausted fallback chain error_class=%s", last_error)
    raise ProviderFailure(last_error)


async def _stream_tier(tier: str, messages: list[dict], temperature: float, max_tokens: int,
                       cancel_event: asyncio.Event | None) -> AsyncGenerator[str, None]:
    config = _tier(tier)
    key = provider_key(tier)
    if not key:
        raise ProviderFailure("not_configured")
    timeout = httpx.Timeout(connect=_CONNECT_TIMEOUT, read=_STREAM_IDLE_TIMEOUT, write=10.0, pool=_CONNECT_TIMEOUT)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if config["provider"] == "gemini":
            url = f"{GEMINI_BASE_URL}/models/{config['model']}:streamGenerateContent"
            headers = {"x-goog-api-key": key, "Content-Type": "application/json", "Accept": "text/event-stream"}
            body = _gemini_payload(messages, temperature, max_tokens)
            params = {"alt": "sse"}
        else:
            base = OPENROUTER_BASE_URL if config["provider"] == "openrouter" else GROQ_BASE_URL
            url = f"{base}/chat/completions"
            headers = _openai_headers(key, config["provider"])
            headers["Accept"] = "text/event-stream"
            body = _openai_payload(config["model"], messages, temperature, max_tokens, True)
            params = None

        for attempt in range(_RETRY_MAX + 1):
            try:
                async with client.stream("POST", url, params=params, json=body, headers=headers) as response:
                    if response.status_code in _RETRY_STATUSES and attempt < _RETRY_MAX:
                        await response.aread()
                        await asyncio.sleep(_retry_after(response, attempt))
                        continue
                    _raise_for_response(response)
                    deadline = time.monotonic() + _STREAM_TOTAL_TIMEOUT
                    first = True
                    async for line in response.aiter_lines():
                        if cancel_event is not None and cancel_event.is_set():
                            return
                        if time.monotonic() > deadline:
                            raise ProviderFailure("timeout")
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if raw == "[DONE]":
                            return
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError as exc:
                            if config["provider"] == "gemini":
                                raise ProviderFailure("parse_error") from exc
                            continue
                        if isinstance(chunk, dict) and chunk.get("error"):
                            raise ProviderFailure("unavailable")
                        try:
                            if config["provider"] == "gemini":
                                token = "".join(str(part.get("text", "")) for part in
                                                chunk["candidates"][0]["content"]["parts"]
                                                if isinstance(part, dict))
                            else:
                                token = chunk["choices"][0]["delta"].get("content") or ""
                        except (KeyError, IndexError, TypeError):
                            continue
                        if token:
                            first = False
                            yield str(token)
                    return
            except ProviderFailure:
                raise
            except httpx.TimeoutException as exc:
                raise ProviderFailure("timeout") from exc
            except httpx.RequestError as exc:
                raise ProviderFailure("network") from exc
        raise ProviderFailure("unavailable")


async def chat_stream(messages: list[dict], *, selection: str | None = "auto",
                      temperature: float = 0.7, max_tokens: int = 1024,
                      cancel_event: asyncio.Event | None = None) -> AsyncGenerator[tuple[str, str], None]:
    order = resolve_order(selection)
    attempted: list[str] = []
    last_error = "unavailable"
    for tier in order:
        if cancel_event is not None and cancel_event.is_set():
            yield ("cancelled", "cancelled before start")
            return
        if not provider_available(tier):
            last_error = "not_configured"
            continue
        if _COOLDOWNS.get(tier, 0) > time.monotonic() and len(order) > 1:
            last_error = "unavailable"
            continue
        attempted.append(tier)
        produced = False
        try:
            # The label is emitted only once a tier actually starts producing text.
            async for token in _stream_tier(tier, messages, temperature, max_tokens, cancel_event):
                if cancel_event is not None and cancel_event.is_set():
                    yield ("cancelled", "superseded by a newer request")
                    return
                if not produced:
                    produced = True
                    _COOLDOWNS.pop(tier, None)
                    yield ("meta", TIER_CONFIG[tier]["display_name"])
                yield ("token", token)
            if cancel_event is not None and cancel_event.is_set():
                yield ("cancelled", "superseded by a newer request")
                return
            if produced:
                return
            last_error = "parse_error"
            _record_failure(tier, last_error)
        except ProviderFailure as exc:
            last_error = exc.error_class
            _record_failure(tier, exc.error_class, exc.http_status)
            if produced or exc.error_class not in _FALLBACK_CLASSES:
                break
        except (ValueError, TypeError):
            last_error = "parse_error"
            _record_failure(tier, last_error)
            if produced:
                break
    yield ("error", {
        "type": last_error,
        "message": _FRIENDLY_ERRORS.get(last_error, _FRIENDLY_ERRORS["unavailable"]),
        "attempted_tiers": attempted,
    })


# Compatibility wrappers retained for older imports.
async def groq_chat(messages: list[dict], **kwargs) -> str:
    _tier_id, text = await chat(messages, selection=kwargs.pop("selection", "auto"), **kwargs)
    return text


async def groq_chat_stream(messages: list[dict], **kwargs):
    async for event, value in chat_stream(messages, selection=kwargs.pop("selection", "auto"), **kwargs):
        yield event, value
