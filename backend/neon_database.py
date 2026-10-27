"""Neon PostgreSQL connection helpers.

Only server-side environment variables are read. Connection strings and raw
driver exceptions are deliberately never returned to API responses or logs.
"""
from __future__ import annotations

import os
from typing import Any

import psycopg


# Vercel's Neon integration prefixes the standard Neon variable names.
# Prefer the pooled URL for serverless requests; direct URLs are migration-only.
RUNTIME_URL_NAMES = (
    "NOTELY_DATABASE_URL_POSTGRES_URL",
    "NOTELY_DATABASE_URL_POSTGRES_PRISMA_URL",
    "NOTELY_DATABASE_URL_DATABASE_URL",
)
MIGRATION_URL_NAMES = (
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
    """Open a Neon connection without printing or exposing its credentials."""
    names = MIGRATION_URL_NAMES if for_migration else RUNTIME_URL_NAMES
    url = _connection_url(*names)
    if not url:
        raise RuntimeError("neon_database_url_missing")
    return psycopg.connect(url, connect_timeout=5, sslmode="require")


def check_neon_connection() -> dict[str, Any]:
    """Run SELECT 1 and return only a safe status/error identifier."""
    try:
        with connect_neon() as conn:
            row = conn.execute("SELECT 1").fetchone()
            if not row or row[0] != 1:
                return {"ok": False, "error": "database_check_failed"}
        return {"ok": True}
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
    except psycopg.Error as exc:
        # Expose only a stable driver error class, never its message/DSN.
        return {"ok": False, "error": type(exc).__name__}
    except Exception:
        return {"ok": False, "error": "database_check_failed"}
