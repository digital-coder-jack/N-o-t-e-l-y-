"""Neon PostgreSQL connection helpers.

Only server-side environment variables are read. Connection strings and raw
driver exceptions are deliberately never returned to API responses or logs.
"""
from __future__ import annotations

import os
from typing import Any

import psycopg


# Prefer the explicitly configured owner/runtime connection when present.
# Neon Auth's integration-scoped connection can use a restricted auth role and
# search_path=neon_auth; Notely's app tables are in public. Keep the prefixed
# Neon integration names as fallbacks for environments without DATABASE_URL.
RUNTIME_URL_NAMES = (
    "DATABASE_URL",
    "NOTELY_DATABASE_URL_POSTGRES_URL",
    "NOTELY_DATABASE_URL_POSTGRES_PRISMA_URL",
    "NOTELY_DATABASE_URL_DATABASE_URL",
)
MIGRATION_URL_NAMES = (
    "DATABASE_URL_UNPOOLED",
    "NOTELY_DATABASE_URL_POSTGRES_URL_NON_POOLING",
    "NOTELY_DATABASE_URL_DATABASE_URL_UNPOOLED",
)


def _connection_url(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return None


def connect_neon(*, for_migration: bool = False):
    """Open a Neon connection with Notely's public app schema in its search path.

    The runtime role must have privileges on the application tables in public.
    Setting search_path alone cannot grant access; connection selection above
    intentionally prefers the owner/runtime URL when it is configured.
    """
    names = MIGRATION_URL_NAMES if for_migration else RUNTIME_URL_NAMES
    url = _connection_url(*names)
    if not url:
        raise RuntimeError("neon_database_url_missing")

    conn = psycopg.connect(url, connect_timeout=5, sslmode="require")
    try:
        conn.execute("SET search_path TO public")
    except Exception:
        conn.close()
        raise
    return conn


REQUIRED_TABLES = (
    "users",
    "email_verifications",
    "trial_sessions",
    "trial_device_aliases",
    "trial_attempts",
    "auth_signin_attempts",
    "questions",
    "chats",
    "messages",
    "notes",
    "quizzes",
    "uploads",
    "user_settings",
    "topics",
    "topic_artifacts",
    "tasks",
)


def check_neon_connection() -> dict[str, Any]:
    """Run SELECT 1, verify the expected public schema, and return safe status only."""
    try:
        with connect_neon() as conn:
            row = conn.execute("SELECT 1").fetchone()
            if not row or row[0] != 1:
                return {"ok": False, "error": "database_check_failed"}
            rows = conn.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "AND table_name = ANY(%s)",
                (list(REQUIRED_TABLES),),
            ).fetchall()
            found = {table_row[0] for table_row in rows}
            if not set(REQUIRED_TABLES).issubset(found):
                return {"ok": False, "error": "database_schema_missing"}
        return {"ok": True}
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
    except psycopg.Error as exc:
        # Expose only a stable driver error class, never its message/DSN.
        return {"ok": False, "error": type(exc).__name__}
    except Exception:
        return {"ok": False, "error": "database_check_failed"}
