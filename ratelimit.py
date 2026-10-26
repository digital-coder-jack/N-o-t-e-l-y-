"""
=====================================================================
 AI NOTEBOOK  -  backend/ratelimit.py
=====================================================================
A lightweight in-memory rate limiter (token bucket per client IP) that
protects the /api/* endpoints from abuse.

Notes
-----
* This is per-process. On a single instance it works perfectly. On a
  serverless platform with many instances it is best-effort (each
  instance keeps its own counters), which is still useful for basic
  abuse protection without an external store.
* The Telegram webhook is exempt (Telegram may burst-deliver updates).
=====================================================================
"""

from __future__ import annotations

import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Allow N requests per WINDOW seconds per IP for /api/* (excluding webhook).
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "120"))
RATE_WINDOW = int(os.environ.get("RATE_WINDOW", "60"))

EXEMPT_PATHS = {"/api/webhook", "/api/set-webhook", "/api/health"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        # ip -> (window_start_epoch, count)
        self._buckets: dict[str, list] = {}

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or path in EXEMPT_PATHS:
            return await call_next(request)

        ip = self._client_ip(request)
        now = time.time()
        window_start, count = self._buckets.get(ip, [now, 0])

        if now - window_start >= RATE_WINDOW:
            window_start, count = now, 0

        count += 1
        self._buckets[ip] = [window_start, count]

        # Opportunistic cleanup to bound memory.
        if len(self._buckets) > 5000:
            cutoff = now - RATE_WINDOW
            self._buckets = {
                k: v for k, v in self._buckets.items() if v[0] >= cutoff
            }

        if count > RATE_LIMIT:
            retry = int(RATE_WINDOW - (now - window_start))
            return JSONResponse(
                {"detail": "Too many requests. Please slow down."},
                status_code=429,
                headers={"Retry-After": str(max(retry, 1))},
            )

        return await call_next(request)
