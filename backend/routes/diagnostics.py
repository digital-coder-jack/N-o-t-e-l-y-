"""Protected live diagnostics for configured AI tiers."""
from __future__ import annotations

import hmac
import os
import time

from fastapi import APIRouter, Header, HTTPException, Query, Request

from backend import providers

router = APIRouter(prefix="/api/ai", tags=["ai-diagnostics"])
_DIAG_LIMIT = 3
_DIAG_WINDOW_SECONDS = 60.0
_DIAG_BUCKETS: dict[str, tuple[float, int]] = {}


@router.get("/diagnose")
async def diagnose_ai(
    request: Request,
    x_diag_token: str | None = Header(default=None, alias="X-Diag-Token"),
    force: bool = Query(default=False),
):
    expected = os.environ.get("DIAG_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="AI diagnostics are not enabled.")
    if not x_diag_token or not hmac.compare_digest(x_diag_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    now = time.monotonic()
    window_start, count = _DIAG_BUCKETS.get(client_ip, (now, 0))
    if now - window_start >= _DIAG_WINDOW_SECONDS:
        window_start, count = now, 0
    count += 1
    _DIAG_BUCKETS[client_ip] = (window_start, count)
    if count > _DIAG_LIMIT:
        retry_after = max(1, int(_DIAG_WINDOW_SECONDS - (now - window_start)))
        raise HTTPException(
            status_code=429,
            detail="AI diagnostics are rate limited. Try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )
    results = await providers.diagnose_all(force=force)
    return {
        "health": providers.status_snapshot()["health"],
        "cache_seconds": 60,
        "scope": "This cache and tier cooldown are per serverless instance.",
        "results": [
            {key: value for key, value in item.items() if key != "checked_at"}
            | {"checked_at": item.get("checked_at")}
            for item in results
        ],
    }
