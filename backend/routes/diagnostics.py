"""Protected live diagnostics for configured AI tiers."""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Header, HTTPException, Query

from backend import providers

router = APIRouter(prefix="/api/ai", tags=["ai-diagnostics"])


@router.get("/diagnose")
async def diagnose_ai(
    x_diag_token: str | None = Header(default=None, alias="X-Diag-Token"),
    force: bool = Query(default=False),
):
    expected = os.environ.get("DIAG_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="AI diagnostics are not enabled.")
    if not x_diag_token or not hmac.compare_digest(x_diag_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")
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
