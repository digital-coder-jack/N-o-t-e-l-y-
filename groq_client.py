"""
=====================================================================
 AI NOTEBOOK  -  backend/groq_client.py  (compatibility shim)
=====================================================================
This module used to call a provider directly. AI calls are now routed through
the centralized AI Notebook router in `backend.providers` with
automatic fallback. These wrappers are kept so any existing import
of `groq_chat` / `groq_chat_stream` keeps working unchanged.

The API keys are read ONLY from environment variables inside
`backend.providers`.
=====================================================================
"""

from __future__ import annotations

from typing import AsyncGenerator

from backend import providers


async def groq_chat(
    messages: list[dict],
    *,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    selection: str | None = "auto",
) -> str:
    """Return a single complete assistant reply (multi-provider fallback)."""
    _provider, text = await providers.chat(
        messages,
        selection=selection,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return text


async def groq_chat_stream(
    messages: list[dict],
    *,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    selection: str | None = "auto",
) -> AsyncGenerator[str, None]:
    """Stream the assistant reply token-by-token (multi-provider fallback)."""
    async for event, value in providers.chat_stream(
        messages,
        selection=selection,
        temperature=temperature,
        max_tokens=max_tokens,
    ):
        if event in ("token", "error"):
            yield value
