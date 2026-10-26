"""
=====================================================================
 AI NOTEBOOK  -  backend/stream_manager.py
=====================================================================
Reliable, race-free streaming control plane.

This module guarantees the core safety invariants of the chat system:

  1.  NEVER allow two active streams for the same session at the same time.
  2.  ALWAYS cancel the previous streaming job before a new one starts.
  3.  Provide a safe, idempotent way to cancel a running stream
      (used both by the explicit /cancel endpoint and by a brand-new
      request that supersedes an in-flight one).

How it works
------------
Each "session key" (here: the chat owner + chat id) maps to a single
``StreamSession`` holding:

  * an ``asyncio.Event`` cancel flag — cooperative cancellation token
  * a monotonically increasing ``generation`` number — every new stream
    bumps it, so a late/zombie generator can detect it has been superseded
  * the ``message_id`` of the placeholder assistant row being written, so
    state updates only ever touch the LATEST assistant message.

A per-session ``asyncio.Lock`` serialises the acquire/cancel handshake so
two requests racing to start at the exact same instant cannot both win.

Because the app may run with multiple workers, the session key is scoped
per-process; for single-worker deployments (the default here) this is a
hard guarantee. For multi-worker deploys, pin sticky sessions or move this
registry to Redis (the interface is intentionally small to allow that).
=====================================================================
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger("ai-notebook.stream")


@dataclass
class StreamSession:
    """State for the single active stream of one session key."""

    generation: int = 0
    message_id: int | None = None
    started_at: float = field(default_factory=time.time)
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    active: bool = False


class StreamManager:
    """Process-wide registry of active streams, keyed by session."""

    def __init__(self) -> None:
        self._sessions: dict[str, StreamSession] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    # -- internal helpers ---------------------------------------------------
    async def _lock_for(self, key: str) -> asyncio.Lock:
        async with self._global_lock:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock

    @staticmethod
    def make_key(user_id: int, chat_id: int) -> str:
        return f"u{user_id}:c{chat_id}"

    # -- public API ---------------------------------------------------------
    async def begin(self, key: str) -> tuple[int, asyncio.Event]:
        """
        Start a new stream for ``key``.

        ALWAYS cancels any previously active stream for the same key first,
        then registers this one. Returns ``(generation, cancel_event)``.

        The returned generation lets the caller detect supersession; the
        cancel_event is the cooperative cancellation token to poll while
        streaming.
        """
        lock = await self._lock_for(key)
        async with lock:
            session = self._sessions.get(key)
            if session is not None and session.active:
                # Rule: always cancel the previous job before starting a new one.
                logger.info("Superseding active stream for %s (gen %s)", key, session.generation)
                session.cancel_event.set()

            generation = (session.generation + 1) if session else 1
            new_session = StreamSession(
                generation=generation,
                cancel_event=asyncio.Event(),
                active=True,
            )
            self._sessions[key] = new_session
            return generation, new_session.cancel_event

    async def attach_message(self, key: str, generation: int, message_id: int) -> bool:
        """
        Bind the placeholder assistant ``message_id`` to the active stream.

        Returns False if this generation is no longer the active one (i.e.
        it was superseded between begin() and the message row being created).
        """
        lock = await self._lock_for(key)
        async with lock:
            session = self._sessions.get(key)
            if not session or session.generation != generation or not session.active:
                return False
            session.message_id = message_id
            return True

    async def cancel(self, key: str) -> bool:
        """
        Cancel the active stream for ``key`` if any. Idempotent.

        Returns True if a stream was actually signalled to stop.
        """
        lock = await self._lock_for(key)
        async with lock:
            session = self._sessions.get(key)
            if session and session.active:
                logger.info("Cancelling stream for %s (gen %s)", key, session.generation)
                session.cancel_event.set()
                return True
            return False

    async def finish(self, key: str, generation: int) -> None:
        """
        Mark the stream for ``generation`` finished — but only if it is still
        the active generation. A superseded generation finishing must NOT
        clobber the newer one's state.
        """
        lock = await self._lock_for(key)
        async with lock:
            session = self._sessions.get(key)
            if session and session.generation == generation:
                session.active = False
                session.message_id = None

    def is_active(self, key: str) -> bool:
        session = self._sessions.get(key)
        return bool(session and session.active)

    def current_message_id(self, key: str) -> int | None:
        session = self._sessions.get(key)
        return session.message_id if session else None


# A single process-wide instance shared by all chat routes.
stream_manager = StreamManager()
