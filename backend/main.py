"""
=====================================================================
 AI NOTEBOOK  -  backend/main.py
=====================================================================
The single FastAPI application that powers BOTH:

  1. The Telegram bot  (webhook endpoints — unchanged behaviour)
  2. The web application  (auth, chat, study tools, file uploads)
  3. The static frontend  (served from /frontend)

Everything shares backend.database (Neon PostgreSQL) and backend.ai
(one Notely model router), so the bot and the website operate on the same data.

Run locally:
    uvicorn backend.main:app --reload --port 3000
On Vercel: api/index.py imports this `app`.
=====================================================================
"""

from __future__ import annotations

import logging
import os

from datetime import datetime
from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import database as db, providers
from backend.routes import chat as chat_routes
from backend.routes import files as files_routes
from backend.routes import topics as topics_routes
from backend.routes import tasks as tasks_routes
from backend.routes import diagnostics as diagnostics_routes
from backend.routes import users as users_routes
from backend.routes import trials as trial_routes
from backend.analytics_web import web_analytics_db
from backend.auth import current_user

# Rate limiting (simple in-memory token bucket per IP).
from backend.ratelimit import RateLimitMiddleware

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("ai-notebook")

# Resolve the frontend directory (works locally and on Vercel).
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")


# ---------------------------------------------------------------------------
# Environment variable validation
# ---------------------------------------------------------------------------
# The backend will still boot if optional vars are missing (so health checks
# pass on a fresh deploy), but it logs loud warnings so misconfiguration is
# obvious in the platform logs. Set FAIL_FAST=1 to abort startup instead.
def _validate_environment() -> None:
    """Validate and report on the environment configuration at boot."""
    # AI uses three independent product tiers. The default tier is required
    # for AI features; Pro and Pro Max are optional upgrades.
    ai_providers = {
        "GEMINI_API_KEY": "Notely default tier",
        "OPENROUTER_API_KEY": "Notely Pro tier",
        "GROQ_API_KEY": "Notely Pro Max tier",
    }
    recommended = {
        "JWT_SECRET": "stable session signing secret (logins break on restart without it)",
        "ALLOWED_ORIGINS": "comma-separated list of frontend origins allowed by CORS",
    }
    optional = {
        "GEMINI_MODEL": "default tier model override",
        "OPENROUTER_MODEL": "Pro tier model override",
        "GROQ_MODEL": "Pro Max tier model override",
        "TELEGRAM_BOT_TOKEN": "Telegram bot integration",
        "WEBHOOK_SECRET": "verify Telegram webhook calls",
        "TELEGRAM_ADMIN_ID": "admin id allowed to read analytics dashboard stats",
        "DIAG_TOKEN": "protect live AI provider diagnostics",
        "OPENROUTER_SITE_URL": "optional OpenRouter attribution URL",
        "OPENROUTER_APP_NAME": "optional OpenRouter attribution title",
        "AI_STREAM_TIMEOUT": "maximum AI stream duration in seconds",
        "AI_STREAM_IDLE_TIMEOUT": "maximum idle read time for AI streams",
        "AI_CACHE_TTL": "in-memory completion cache lifetime in seconds",
    }

    configured_ai = [k for k in ai_providers if os.environ.get(k)]
    # "Missing required" only if NO AI provider at all is configured.
    missing_required = list(ai_providers) if not configured_ai else []
    missing_recommended = [k for k in recommended if not os.environ.get(k)]

    logger.info("=" * 60)
    logger.info("Notely — environment check")
    for key, why in ai_providers.items():
        status = "OK" if os.environ.get(key) else "not set"
        logger.info("  [%s] %-18s — %s", status, key, why)
    for key, why in recommended.items():
        status = "OK" if os.environ.get(key) else "not set"
        logger.info("  [%s] %-18s — %s", status, key, why)
    for key, why in optional.items():
        if os.environ.get(key):
            logger.info("  [OK] %-18s — %s", key, why)
    logger.info("=" * 60)

    if missing_required:
        logger.warning(
            "No AI provider configured. Set at least one of %s — AI features "
            "will return a configuration message until one is set.",
            ", ".join(missing_required),
        )
    if missing_recommended:
        logger.warning(
            "Missing recommended env var(s): %s — strongly advised in production.",
            ", ".join(missing_recommended),
        )

    if os.environ.get("FAIL_FAST") == "1" and missing_required:
        raise RuntimeError(
            "FAIL_FAST=1 and required env vars are missing: "
            + ", ".join(missing_required)
        )


_validate_environment()

app = FastAPI(title="Notely", docs_url=None, redoc_url=None)

@app.exception_handler(providers.ProviderFailure)
async def ai_provider_error_handler(request: Request, exc: providers.ProviderFailure):
    """Keep upstream failures friendly and free of provider response bodies."""
    return JSONResponse(
        status_code=503,
        content={"detail": exc.friendly_message, "error_class": exc.error_class},
        headers={"Cache-Control": "no-store"},
    )


# ---------------------------------------------------------------------------
# CORS — the frontend now lives on a DIFFERENT origin (Vercel) than this API
# (Render / Railway), so CORS must explicitly allow that origin.
#
# Configure with the ALLOWED_ORIGINS env var, e.g.:
#   ALLOWED_ORIGINS=https://your-app.vercel.app,https://www.yourdomain.com
#
# Comma-separated. If unset, use a narrow Notely production + local-wrapper
# default. Configure preview origins explicitly in ALLOWED_ORIGINS when needed.
# ---------------------------------------------------------------------------
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
_DEFAULT_ORIGINS = [
    "https://notely-mwlq.vercel.app",
    "https://notely-frontend.vercel.app",
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
ALLOWED_ORIGINS = (
    [origin.strip() for origin in _raw_origins.split(",") if origin.strip()]
    if _raw_origins else _DEFAULT_ORIGINS
)
# Only local development and Capacitor origins are pattern-matched; production
# web origins must be explicitly listed in ALLOWED_ORIGINS.
_ALLOW_ORIGIN_REGEX = (
    r"^(https?://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?|"
    r"https://localhost|capacitor://localhost)$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Diag-Token", "X-Requested-With", "X-Notely-Device"],
    expose_headers=["X-Notely-Trial-Expired", "Retry-After"],
)

logger.info("CORS allowed origins: %s", ALLOWED_ORIGINS)

# Rate limiting for API routes.
app.add_middleware(RateLimitMiddleware)

# Database checks run through /api/health so a missing DB does not prevent the
# application from starting and reporting a safe readiness error.

# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------
app.include_router(users_routes.router)
app.include_router(trial_routes.router)
app.include_router(chat_routes.router)
app.include_router(files_routes.router)
app.include_router(topics_routes.router)
app.include_router(tasks_routes.router)
app.include_router(diagnostics_routes.router)

# ---------------------------------------------------------------------------
# Web Analytics API Routes
#
# These accept JSON request BODIES to match exactly what
# frontend/js/analytics-tracker.js sends. (The previous version declared the
# fields as query parameters, which made every analytics call fail with 422.)
# Analytics are process-local and best-effort, so they never block the page.
# ---------------------------------------------------------------------------
class TrackVisitIn(BaseModel):
    guest_id: str
    page_url: str = "/"


class TrackActivityIn(BaseModel):
    guest_id: str
    current_page: str = "/"
    time_spent_on_page: float = 0.0


class TrackSessionEndIn(BaseModel):
    guest_id: str
    session_start: datetime
    session_end: datetime


class TrackFeatureIn(BaseModel):
    guest_id: str
    feature: str


@app.post("/api/analytics/track-visit")
async def track_visit_endpoint(body: TrackVisitIn, request: Request):
    try:
        user_agent = request.headers.get("User-Agent", "Unknown")
        ip_address = request.client.host if request.client else "unknown"
        web_analytics_db.track_visit(body.guest_id, user_agent, ip_address, body.page_url)
    except Exception:
        logger.exception("track_visit failed")
    return {"status": "ok"}


@app.post("/api/analytics/track-activity")
async def track_activity_endpoint(body: TrackActivityIn):
    try:
        web_analytics_db.update_activity(
            body.guest_id, body.current_page, body.time_spent_on_page
        )
    except Exception:
        logger.exception("track_activity failed")
    return {"status": "ok"}


@app.post("/api/analytics/track-session-end")
async def track_session_end_endpoint(request: Request):
    # navigator.sendBeacon() sends the body as text/plain, so FastAPI's
    # automatic JSON model parsing returns 422. Parse the raw body
    # defensively so beacons (and normal JSON posts) both succeed.
    try:
        import json as _json

        raw = await request.body()
        data = _json.loads(raw.decode("utf-8") or "{}")
        web_analytics_db.track_session_end(
            data.get("guest_id"),
            data.get("session_start"),
            data.get("session_end"),
        )
    except Exception:
        logger.exception("track_session_end failed")
    return {"status": "ok"}


@app.post("/api/analytics/track-feature")
async def track_feature_endpoint(body: TrackFeatureIn):
    try:
        web_analytics_db.track_feature_usage(body.guest_id, body.feature)
    except Exception:
        logger.exception("track_feature failed")
    return {"status": "ok"}

# Admin Dashboard API Route
@app.get("/api/analytics/dashboard-stats")
async def get_dashboard_stats_endpoint(current_user: dict = Depends(current_user)):
    # Basic admin check: assuming an admin user has a specific ID or role
    # For now, let's assume TELEGRAM_ADMIN_ID is also the web admin ID for simplicity
    admin_id = os.environ.get("TELEGRAM_ADMIN_ID") # Reusing for web admin check
    if not admin_id or str(current_user.get("id")) != admin_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    stats = web_analytics_db.get_dashboard_stats()
    return stats


# ---------------------------------------------------------------------------
# Health / API status
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health() -> JSONResponse:
    """Safe Neon connectivity check; never returns a connection string or raw DB error."""
    from backend.neon_database import check_neon_connection

    result = check_neon_connection()
    if result["ok"]:
        return JSONResponse(
            {
                "status": "ok",
                "database": "ok",
                "database_engine": "neon_postgres",
                "application_storage": "neon_postgres",
            },
            status_code=200,
        )
    return JSONResponse(
        {
            "status": "error",
            "database": "unavailable",
            "error": result["error"],
        },
        status_code=503,
    )


@app.get("/api")
async def api_root_status() -> dict:
    """Friendly JSON status at the API base."""
    return {
        "status": "ok",
        "service": "Notely — backend API",
        "health": "/api/health",
    }


# ===========================================================================
# TELEGRAM BOT WEBHOOK  (behaviour identical to the original bot)
# ===========================================================================
@app.post("/api/webhook")
async def telegram_webhook(request: Request) -> Response:
    """Telegram posts every update here; we hand it to python-telegram-bot."""
    from telegram import Update
    from telegram_bot.bot import get_ptb_app

    secret = os.environ.get("WEBHOOK_SECRET")
    if secret:
        header = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if header != secret:
            logger.warning("Rejected webhook call with invalid secret token")
            return Response(status_code=403)

    try:
        application = await get_ptb_app()
        data = await request.json()

        if not data:
            return Response(status_code=400)

        update = Update.de_json(data, application.bot)
        await application.process_update(update)

    except Exception:
        logger.exception("Failed to process webhook update")

    return Response(status_code=200)


# ===========================================================================
# STATIC FRONTEND
# ===========================================================================
# Mount CSS / JS / assets under their folders so links like /css/style.css work.
if os.path.isdir(FRONTEND_DIR):
    for sub in ("css", "js", "assets"):
        path = os.path.join(FRONTEND_DIR, sub)
        if os.path.isdir(path):
            app.mount(f"/{sub}", StaticFiles(directory=path), name=sub)


def _page(name: str) -> FileResponse | JSONResponse:
    # Normalise: allow callers to pass either "chat" or "chat.html".
    if not name.endswith(".html"):
        name = f"{name}.html"
    file_path = os.path.join(FRONTEND_DIR, name)

    if os.path.isfile(file_path):
        return FileResponse(file_path)

    return JSONResponse({"detail": "Page not found"}, status_code=404)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    fav_path = os.path.join(FRONTEND_DIR, "assets", "logo.png")
    if os.path.isfile(fav_path):
        return FileResponse(fav_path)
    return Response(status_code=204)


@app.get("/assets/logo.png", include_in_schema=False)
async def logo_png():
    fav_path = os.path.join(FRONTEND_DIR, "assets", "logo.png")
    if os.path.isfile(fav_path):
        return FileResponse(fav_path)
    return Response(status_code=404)


# ---------------------------------------------------------------------------
# PWA root files (must be served from the site root, not /assets).
# ---------------------------------------------------------------------------
@app.get("/manifest.json", include_in_schema=False)
async def manifest():
    return _file_or_404("manifest.json", "application/manifest+json")


@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    # Service worker must be served from root scope with JS mime type.
    resp = _file_or_404("sw.js", "application/javascript")
    if isinstance(resp, FileResponse):
        resp.headers["Service-Worker-Allowed"] = "/"
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/offline.html", include_in_schema=False)
async def offline_page():
    return _page("offline.html")


def _file_or_404(name: str, media_type: str | None = None):
    path = os.path.join(FRONTEND_DIR, name)
    if os.path.isfile(path):
        return FileResponse(path, media_type=media_type)
    return JSONResponse({"detail": "Not found"}, status_code=404)


@app.get("/")
async def index():
    # If the frontend is bundled with this backend (single-origin deploy),
    # serve it. Otherwise (API-only deploy, frontend on Vercel) return a
    # friendly JSON status so hitting the API root never shows a raw 404.
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return JSONResponse(
        {
            "status": "ok",
            "service": "Notely — backend API",
            "health": "/api/health",
            "note": "Frontend is hosted separately (e.g. Vercel).",
        }
    )


# ---------------------------------------------------------------------------
# PAGE ROUTING
# ---------------------------------------------------------------------------
# The frontend uses extensionless URLs and explicit .html URLs. Both forms
# are served from an allow-list of known pages plus generic fallbacks.
# The former dedicated /chat page has been removed; assistant conversations
# now live in the persistent floating workspace widget on /dashboard.
# Map each known route slug to the HTML file that backs it. Most map to a
# same-named file; "settings" is an alias for the profile page (which hosts
# the settings UI) so the /settings nav link never 404s.
PAGE_ALIASES = {
    "index": "index",
    "login": "login",
    "signup": "signup",
    "forgot": "forgot",
    "dashboard": "dashboard",
    "tools": "tools",
    "notes": "tools",        # tools page hosts notes/quiz/flashcards
    "quiz": "tools",
    "flashcards": "tools",
    "settings": "dashboard", # keep Settings inside the current Notely workspace; dashboard.html reads /settings as the Settings view
    "profile": "profile",
    "analytics": "analytics",
    "telegram": "telegram",  # Telegram bot info / integration page
    "topic": "topic",        # AI Learning OS topic workspace
    "topics": "dashboard",   # topic list lives on the dashboard
    # Modern AI-workspace sidebar destinations. These map onto the existing
    # pages so every nav item resolves instead of 404-ing.
    "history": "dashboard",  # recent chat history lives on the dashboard
    "projects": "tools",     # planner/projects workspace
    "prompts": "tools",      # saved prompts (flashcards workspace)
    "files": "tools",        # file uploads / summarizer workspace
}


def _register_page(slug: str, target: str) -> None:
    async def _handler(target: str = target):
        return _page(target)

    # Extensionless route for this workspace page.
    app.get(f"/{slug}", include_in_schema=False)(_handler)
    # Explicit .html route for the current page.
    app.get(f"/{slug}.html", include_in_schema=False)(_handler)


for _slug, _target in PAGE_ALIASES.items():
    if _slug != "index":  # "/" is already handled by index()
        _register_page(_slug, _target)


# Generic fallback for any other top-level .html file.
@app.get("/{page}.html", include_in_schema=False)
async def any_page(page: str):
    return _page(f"{page}.html")


# ---------------------------------------------------------------------------
# Local development entry point (ignored by Vercel).
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=3000, reload=True)