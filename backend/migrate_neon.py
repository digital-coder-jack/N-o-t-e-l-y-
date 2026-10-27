"""Create the initial Notely PostgreSQL schema in Neon.

Run from the repository root:
    python -m backend.migrate_neon

This migration creates tables only; it does not copy existing SQLite records.
"""
from __future__ import annotations

import sys

import psycopg

from backend.neon_database import connect_neon


SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        telegram_id BIGINT UNIQUE,
        reset_token TEXT,
        reset_expires TEXT,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        last_login TEXT,
        trial_started_at TEXT,
        trial_ends_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS trial_sessions (
        id TEXT PRIMARY KEY,
        device_hash TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        fingerprint_hash TEXT NOT NULL,
        started_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        converted_user_id BIGINT REFERENCES users(id),
        workspace_user_id BIGINT NOT NULL REFERENCES users(id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_trial_device ON trial_sessions(device_hash)",
    "CREATE INDEX IF NOT EXISTS idx_trial_fingerprint ON trial_sessions(fingerprint_hash)",
    "CREATE INDEX IF NOT EXISTS idx_trial_ip ON trial_sessions(ip_hash)",
    """
    CREATE TABLE IF NOT EXISTS trial_device_aliases (
        device_hash TEXT PRIMARY KEY,
        trial_id TEXT NOT NULL REFERENCES trial_sessions(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_trial_alias_trial ON trial_device_aliases(trial_id)",
    """
    CREATE TABLE IF NOT EXISTS trial_attempts (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_trial_attempts_key ON trial_attempts(kind, key_hash, created_at)",
    """
    CREATE TABLE IF NOT EXISTS email_verifications (
        email TEXT PRIMARY KEY,
        delivery_email TEXT NOT NULL,
        name TEXT NOT NULL,
        username TEXT,
        password_hash TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        resend_after TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        existing_user_id BIGINT,
        password_matches INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_signin_attempts (
        key_hash TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS questions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        UNIQUE (user_id, question)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chats (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New Chat',
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id)",
    """
    CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)",
    """
    CREATE TABLE IF NOT EXISTS notes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        pinned INTEGER DEFAULT 0,
        favorite INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id)",
    """
    CREATE TABLE IF NOT EXISTS quizzes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id)",
    """
    CREATE TABLE IF NOT EXISTS uploads (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT,
        size_bytes BIGINT DEFAULT 0,
        extracted TEXT,
        topic_id BIGINT,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id)",
    """
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        appearance TEXT,
        dashboard TEXT,
        notifications TEXT,
        ai_settings TEXT,
        updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        onboarding TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS topics (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        emoji TEXT DEFAULT '📚',
        pinned INTEGER DEFAULT 0,
        favorite INTEGER DEFAULT 0,
        progress TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_topics_user ON topics(user_id)",
    """
    CREATE TABLE IF NOT EXISTS topic_artifacts (
        id BIGSERIAL PRIMARY KEY,
        topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        UNIQUE (topic_id, kind, variant)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_artifacts_topic ON topic_artifacts(topic_id)",
    """
    CREATE TABLE IF NOT EXISTS tasks (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic_id BIGINT REFERENCES topics(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        details TEXT DEFAULT '',
        due_date TEXT,
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_topic ON tasks(topic_id)",
)


def main() -> int:
    try:
        with connect_neon(for_migration=True) as conn:
            for statement in SCHEMA:
                conn.execute(statement)
        print(f"Neon schema migration completed: {len(SCHEMA)} statements applied.")
        print("Tables are ready. Existing SQLite data was not copied.")
        return 0
    except RuntimeError as exc:
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1
    except psycopg.Error as exc:
        print(f"Migration failed: database error ({type(exc).__name__}). Check Vercel/Neon connection settings.", file=sys.stderr)
        return 1
    except Exception:
        print("Migration failed: unexpected error. No connection details were printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
