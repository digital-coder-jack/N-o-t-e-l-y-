"""
=====================================================================
 AI NOTEBOOK  -  backend/database.py
=====================================================================
Shared SQLite data-access layer used by BOTH the Telegram bot and the
web application. A single database file means the bot and the website
operate on the same data.

Tables
------
questions  : the bot's personal Q&A library (UNCHANGED from the original
             bot — same name, same columns, same behaviour).
users      : web-app accounts (email + hashed password).
chats      : a conversation thread for the AI chat interface.
messages   : individual messages inside a chat.
notes      : AI-generated study notes.
quizzes    : AI-generated quizzes (JSON payload stored as text).
uploads    : metadata about user-uploaded files.

The bot links to web accounts through users.telegram_id (nullable), so a
Telegram user and a web user can be the same person if they connect.

On Vercel the filesystem is read-only except for /tmp, so the database
path automatically falls back to /tmp there. Locally it lives beside the
project for easy inspection.
=====================================================================
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Database location
# ---------------------------------------------------------------------------
# Resolution order:
#   1. DB_PATH env var  -> use it verbatim (set this to a MOUNTED DISK path in
#                          production so data survives restarts/redeploys, e.g.
#                          Render disk mounted at /data -> DB_PATH=/data/ai_notebook.db
#                          Railway volume mounted at /data -> DB_PATH=/data/ai_notebook.db).
#   2. Vercel           -> /tmp (only writable location; note: EPHEMERAL).
#   3. Local/dev        -> ai_notebook.db beside the project.
#
# The parent directory is created automatically if it does not exist.
IS_VERCEL = os.environ.get("VERCEL") == "1"
_DEFAULT_LOCAL = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "ai_notebook.db",
)
DB_PATH = os.environ.get(
    "DB_PATH",
    "/tmp/ai_notebook.db" if IS_VERCEL else _DEFAULT_LOCAL,
)

# Ensure the directory holding the DB file exists (e.g. a mounted /data disk).
_db_dir = os.path.dirname(os.path.abspath(DB_PATH))
try:
    os.makedirs(_db_dir, exist_ok=True)
except OSError:
    # If we cannot create it (read-only FS), fall back to /tmp so the app
    # still boots rather than crash-looping.
    DB_PATH = "/tmp/ai_notebook.db"
    try:
        os.makedirs("/tmp", exist_ok=True)
    except OSError:
        pass


def get_connection() -> sqlite3.Connection:
    """Open a SQLite connection (auto-creates the file if missing)."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # Enforce foreign keys for relational integrity.
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL improves concurrent read/write between bot + web.
    try:
        conn.execute("PRAGMA journal_mode = WAL")
    except sqlite3.OperationalError:
        pass
    return conn


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Schema initialisation
# ---------------------------------------------------------------------------
def init_db() -> None:
    """Create every table if it does not exist yet (idempotent)."""
    with closing(get_connection()) as conn:
        # --- Bot's original table (DO NOT CHANGE its shape) ---------------

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                question    TEXT    NOT NULL,
                answer      TEXT    NOT NULL,
                created_at  TEXT    DEFAULT (datetime('now')),
                UNIQUE (user_id, question)
            )
            """
        )

        # --- Web users ----------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT    NOT NULL,
                username        TEXT    UNIQUE,
                email           TEXT    NOT NULL UNIQUE,
                password_hash   TEXT    NOT NULL,
                telegram_id     INTEGER UNIQUE,
                reset_token     TEXT,
                reset_expires   TEXT,
                created_at      TEXT    DEFAULT (datetime('now')),
                last_login      TEXT
            )
            """
        )

        # --- Chat threads -------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                title       TEXT    NOT NULL DEFAULT 'New Chat',
                created_at  TEXT    DEFAULT (datetime('now')),
                updated_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        # --- Messages -----------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id     INTEGER NOT NULL,
                role        TEXT    NOT NULL CHECK (role IN ('user','assistant','system')),
                content     TEXT    NOT NULL,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            )
            """
        )

        # --- Notes --------------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS notes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                topic       TEXT    NOT NULL,
                content     TEXT    NOT NULL,
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        # --- Quizzes ------------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS quizzes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                topic       TEXT    NOT NULL,
                payload     TEXT    NOT NULL,   -- JSON: [{question, options, answer}]
                created_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        # --- Uploads ------------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS uploads (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL,
                filename     TEXT    NOT NULL,
                content_type TEXT,
                size_bytes   INTEGER DEFAULT 0,
                extracted    TEXT,                -- extracted text (truncated)
                topic_id     INTEGER,              -- optional course notebook association
                created_at   TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        # Helpful indexes.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id)")

        # --- User Settings ------------------------------------------------
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id         INTEGER PRIMARY KEY,
                appearance      TEXT, -- JSON blob
                dashboard       TEXT, -- JSON blob
                notifications   TEXT, -- JSON blob
                ai_settings     TEXT, -- JSON blob
                updated_at      TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        # --- Topics (Learning OS workspaces) -------------------------------
        # A topic is a complete AI learning workspace. Each generated section
        # (overview, summary, notes, mindmap, roadmap, timeline, quiz,
        # flashcards, compare, practice, resources, chat) is stored as an
        # artifact row so it is cached and instantly reloadable.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS topics (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                title       TEXT    NOT NULL,
                emoji       TEXT    DEFAULT '📚',
                pinned      INTEGER DEFAULT 0,
                favorite    INTEGER DEFAULT 0,
                progress    TEXT    DEFAULT '{}',   -- JSON: roadmap checkboxes etc.
                created_at  TEXT    DEFAULT (datetime('now')),
                updated_at  TEXT    DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS topic_artifacts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                topic_id    INTEGER NOT NULL,
                kind        TEXT    NOT NULL,   -- overview|summary|notes|mindmap|...
                variant     TEXT    NOT NULL DEFAULT '',  -- e.g. quiz difficulty, compare target
                content     TEXT    NOT NULL,   -- markdown or JSON payload
                created_at  TEXT    DEFAULT (datetime('now')),
                updated_at  TEXT    DEFAULT (datetime('now')),
                UNIQUE (topic_id, kind, variant),
                FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_topics_user ON topics(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_topic ON topic_artifacts(topic_id)")

        # --- Lightweight migrations (idempotent) ----------------------------
        # Add pin/favorite flags to notes so the dashboard can offer
        # pin / favorite / duplicate actions on recent notes.
        for ddl in (
            "ALTER TABLE notes ADD COLUMN pinned INTEGER DEFAULT 0",
            "ALTER TABLE notes ADD COLUMN favorite INTEGER DEFAULT 0",
            "ALTER TABLE notes ADD COLUMN archived INTEGER DEFAULT 0",
            "ALTER TABLE notes ADD COLUMN deleted INTEGER DEFAULT 0",
            # Onboarding wizard answers (education level, goals, interests,
            # study time, learning style, experience, security preferences).
            "ALTER TABLE user_settings ADD COLUMN onboarding TEXT",
            "ALTER TABLE uploads ADD COLUMN topic_id INTEGER",
            "ALTER TABLE uploads ADD COLUMN topic_id INTEGER",
        ):
            try:
                conn.execute(ddl)
            except sqlite3.OperationalError:
                pass  # column already exists

        conn.commit()


# ===========================================================================
# QUESTIONS  (bot library — identical behaviour to the original bot)
# ===========================================================================
def db_add_question(user_id: int, question: str, answer: str) -> bool:
    """Save a Q&A pair. False if it is a duplicate for this user."""
    try:
        with closing(get_connection()) as conn:
            conn.execute(
                "INSERT INTO questions (user_id, question, answer) VALUES (?, ?, ?)",
                (user_id, question.strip().lower(), answer.strip()),
            )
            conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def db_list_questions(user_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT id, question, answer FROM questions WHERE user_id = ? ORDER BY id",
            (user_id,),
        ).fetchall()


def db_delete_question(user_id: int, question_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM questions WHERE id = ? AND user_id = ?",
            (question_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0


def db_find_answer(user_id: int, question: str) -> str | None:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT answer FROM questions WHERE user_id = ? AND question = ? LIMIT 1",
            (user_id, question.strip().lower()),
        ).fetchone()
    return row["answer"] if row else None


# ===========================================================================
# USERS
# ===========================================================================
def create_user(name: str, email: str, password_hash: str,
                username: str | None = None, telegram_id: int | None = None) -> int | None:
    """Insert a new user. Returns new id, or None on duplicate email/username."""
    try:
        with closing(get_connection()) as conn:
            cur = conn.execute(
                "INSERT INTO users (name, email, username, password_hash, telegram_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (name.strip(), email.strip().lower(), username, password_hash, telegram_id),
            )
            user_id = cur.lastrowid
            # Initialize default settings
            conn.execute(
                "INSERT INTO user_settings (user_id, appearance, dashboard, notifications, ai_settings) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    user_id,
                    json.dumps({"theme": "system", "accentColor": "#3b82f6"}),
                    json.dumps({"compactSidebar": False, "showWelcome": True, "showStreak": True, "defaultPage": "dashboard"}),
                    json.dumps({"email": True, "reminders": True, "dailyGoal": True}),
                    json.dumps({"model": "gpt-4", "length": "medium", "difficulty": "intermediate"})
                )
            )
            conn.commit()
            return user_id
    except sqlite3.IntegrityError:
        return None


def get_user_by_email(email: str) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            (email.strip().lower(),),
        ).fetchone()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = ? LIMIT 1", (user_id,)
        ).fetchone()


def touch_last_login(user_id: int) -> None:
    with closing(get_connection()) as conn:
        conn.execute(
            "UPDATE users SET last_login = ? WHERE id = ?", (_utcnow(), user_id)
        )
        conn.commit()


def update_user_profile(user_id: int, name: str) -> None:
    with closing(get_connection()) as conn:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name.strip(), user_id))
        conn.commit()


def update_user_password(user_id: int, password_hash: str) -> None:
    with closing(get_connection()) as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, "
            "reset_expires = NULL WHERE id = ?",
            (password_hash, user_id),
        )
        conn.commit()


def set_reset_token(email: str, token: str, expires: str) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?",
            (token, expires, email.strip().lower()),
        )
        conn.commit()
        return cur.rowcount > 0


def get_user_by_reset_token(token: str) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE reset_token = ? LIMIT 1", (token,)
        ).fetchone()


# ===========================================================================
# CHATS
# ===========================================================================
def create_chat(user_id: int, title: str = "New Chat") -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO chats (user_id, title) VALUES (?, ?)", (user_id, title)
        )
        conn.commit()
        return cur.lastrowid


def list_chats(user_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT id, title, created_at, updated_at FROM chats "
            "WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()


def get_chat(user_id: int, chat_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM chats WHERE id = ? AND user_id = ? LIMIT 1",
            (chat_id, user_id),
        ).fetchone()


def rename_chat(user_id: int, chat_id: int, title: str) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "UPDATE chats SET title = ? WHERE id = ? AND user_id = ?",
            (title.strip()[:120], chat_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0


def touch_chat(chat_id: int) -> None:
    with closing(get_connection()) as conn:
        conn.execute(
            "UPDATE chats SET updated_at = ? WHERE id = ?", (_utcnow(), chat_id)
        )
        conn.commit()


def delete_chat(user_id: int, chat_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM chats WHERE id = ? AND user_id = ?", (chat_id, user_id)
        )
        conn.commit()
        return cur.rowcount > 0


# ===========================================================================
# MESSAGES
# ===========================================================================
def add_message(chat_id: int, role: str, content: str) -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
            (chat_id, role, content),
        )
        conn.commit()
    touch_chat(chat_id)
    return cur.lastrowid


def list_messages(chat_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT id, role, content, created_at FROM messages "
            "WHERE chat_id = ? ORDER BY id",
            (chat_id,),
        ).fetchall()


def update_message(message_id: int, content: str) -> bool:
    """Overwrite the content of an existing message.

    Used to finalise the streaming assistant placeholder row so that state
    updates only ever touch the LATEST assistant message (the placeholder
    created when the stream began), never a stale one.
    """
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "UPDATE messages SET content = ? WHERE id = ?",
            (content, message_id),
        )
        conn.commit()
        return cur.rowcount > 0


def delete_message(message_id: int) -> bool:
    """Delete a single message (e.g. an empty placeholder after a hard error)."""
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM messages WHERE id = ?", (message_id,)
        )
        conn.commit()
        return cur.rowcount > 0


def count_messages(user_id: int) -> int:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM messages m "
            "JOIN chats c ON m.chat_id = c.id WHERE c.user_id = ?",
            (user_id,),
        ).fetchone()
    return row["c"] if row else 0


def count_ai_messages(user_id: int) -> int:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM messages m "
            "JOIN chats c ON m.chat_id = c.id "
            "WHERE c.user_id = ? AND m.role = 'assistant'",
            (user_id,),
        ).fetchone()
    return row["c"] if row else 0


def daily_activity(user_id: int, days: int = 7) -> list[dict]:
    """Return message counts per day for the last `days` days (ascending)."""
    with closing(get_connection()) as conn:
        rows = conn.execute(
            """
            SELECT date(m.created_at) AS day, COUNT(*) AS cnt
            FROM messages m JOIN chats c ON m.chat_id = c.id
            WHERE c.user_id = ?
              AND m.created_at >= datetime('now', ?)
            GROUP BY day ORDER BY day
            """,
            (user_id, f"-{days} days"),
        ).fetchall()
    return [{"day": r["day"], "count": r["cnt"]} for r in rows]


# ===========================================================================
# NOTES
# ===========================================================================
def add_note(user_id: int, topic: str, content: str) -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO notes (user_id, topic, content) VALUES (?, ?, ?)",
            (user_id, topic.strip(), content),
        )
        conn.commit()
        return cur.lastrowid


def list_notes(user_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT id, topic, content, created_at, pinned, favorite, archived, deleted FROM notes "
            "WHERE user_id = ? ORDER BY id DESC",
            (user_id,),
        ).fetchall()


def update_note(user_id: int, note_id: int, topic: str, content: str) -> bool:
    """Update a user's note title/topic and content without exposing other users' rows."""
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "UPDATE notes SET topic = ?, content = ? WHERE id = ? AND user_id = ?",
            (topic.strip(), content, note_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0


def delete_note(user_id: int, note_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user_id)
        )
        conn.commit()
        return cur.rowcount > 0


def count_notes(user_id: int) -> int:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM notes WHERE user_id = ?", (user_id,)
        ).fetchone()
    return row["c"] if row else 0


# ===========================================================================
# QUIZZES
# ===========================================================================
def add_quiz(user_id: int, topic: str, payload: list | dict) -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO quizzes (user_id, topic, payload) VALUES (?, ?, ?)",
            (user_id, topic.strip(), json.dumps(payload)),
        )
        conn.commit()
        return cur.lastrowid


def list_quizzes(user_id: int) -> list[dict]:
    with closing(get_connection()) as conn:
        rows = conn.execute(
            "SELECT id, topic, payload, created_at FROM quizzes "
            "WHERE user_id = ? ORDER BY id DESC",
            (user_id,),
        ).fetchall()
    out = []
    for r in rows:
        try:
            payload = json.loads(r["payload"])
        except (json.JSONDecodeError, TypeError):
            payload = []
        out.append({
            "id": r["id"], "topic": r["topic"],
            "payload": payload, "created_at": r["created_at"],
        })
    return out


def delete_quiz(user_id: int, quiz_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM quizzes WHERE id = ? AND user_id = ?", (quiz_id, user_id)
        )
        conn.commit()
        return cur.rowcount > 0


def count_quizzes(user_id: int) -> int:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM quizzes WHERE user_id = ?", (user_id,)
        ).fetchone()
    return row["c"] if row else 0


# ===========================================================================
# UPLOADS
# ===========================================================================
def add_upload(user_id: int, filename: str, content_type: str | None,
               size_bytes: int, extracted: str | None,
               topic_id: int | None = None) -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO uploads (user_id, filename, content_type, size_bytes, extracted, topic_id) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, filename, content_type, size_bytes, extracted, topic_id),
        )
        conn.commit()
        return cur.lastrowid


def list_uploads(user_id: int, topic_id: int | None = None) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        if topic_id is None:
            return conn.execute(
                "SELECT id, filename, content_type, size_bytes, topic_id, created_at FROM uploads "
                "WHERE user_id = ? ORDER BY id DESC",
                (user_id,),
            ).fetchall()
        return conn.execute(
            "SELECT id, filename, content_type, size_bytes, topic_id, created_at FROM uploads "
            "WHERE user_id = ? AND topic_id = ? ORDER BY id DESC",
            (user_id, topic_id),
        ).fetchall()

def delete_upload(user_id: int, upload_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM uploads WHERE id = ? AND user_id = ?", (upload_id, user_id)
        )
        conn.commit()
        return cur.rowcount > 0


def get_upload(user_id: int, upload_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM uploads WHERE id = ? AND user_id = ? LIMIT 1",
            (upload_id, user_id),
        ).fetchone()

# ===========================================================================
# SETTINGS
# ===========================================================================
def get_user_settings(user_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM user_settings WHERE user_id = ?", (user_id,)
        ).fetchone()

def update_user_settings(user_id: int, category: str, data: dict) -> bool:
    """Update a specific category of settings (appearance, dashboard, etc)."""
    valid_categories = ["appearance", "dashboard", "notifications", "ai_settings", "onboarding"]
    if category not in valid_categories:
        return False
    
    with closing(get_connection()) as conn:
        cur = conn.execute(
            f"UPDATE user_settings SET {category} = ?, updated_at = ? WHERE user_id = ?",
            (json.dumps(data), _utcnow(), user_id)
        )
        conn.commit()
        return cur.rowcount > 0

def get_user_by_username(username: str) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM users WHERE username = ? LIMIT 1",
            (username.strip().lower(),),
        ).fetchone()

def delete_user_account(user_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return cur.rowcount > 0


# ===========================================================================
# TOPICS  (AI Learning OS workspaces)
# ===========================================================================
def create_topic(user_id: int, title: str, emoji: str = "📚") -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO topics (user_id, title, emoji) VALUES (?, ?, ?)",
            (user_id, title.strip()[:200], emoji),
        )
        conn.commit()
        return cur.lastrowid


def find_topic_by_title(user_id: int, title: str) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM topics WHERE user_id = ? AND lower(title) = lower(?) LIMIT 1",
            (user_id, title.strip()),
        ).fetchone()


def list_topics(user_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT id, title, emoji, pinned, favorite, created_at, updated_at "
            "FROM topics WHERE user_id = ? "
            "ORDER BY pinned DESC, updated_at DESC",
            (user_id,),
        ).fetchall()


def get_topic(user_id: int, topic_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM topics WHERE id = ? AND user_id = ? LIMIT 1",
            (topic_id, user_id),
        ).fetchone()


def touch_topic(topic_id: int) -> None:
    with closing(get_connection()) as conn:
        conn.execute(
            "UPDATE topics SET updated_at = ? WHERE id = ?", (_utcnow(), topic_id)
        )
        conn.commit()


def update_topic_flags(user_id: int, topic_id: int,
                       pinned: bool | None = None,
                       favorite: bool | None = None) -> bool:
    sets, vals = [], []
    if pinned is not None:
        sets.append("pinned = ?"); vals.append(1 if pinned else 0)
    if favorite is not None:
        sets.append("favorite = ?"); vals.append(1 if favorite else 0)
    if not sets:
        return False
    vals += [topic_id, user_id]
    with closing(get_connection()) as conn:
        cur = conn.execute(
            f"UPDATE topics SET {', '.join(sets)} WHERE id = ? AND user_id = ?", vals
        )
        conn.commit()
        return cur.rowcount > 0


def update_topic_progress(user_id: int, topic_id: int, progress: dict) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "UPDATE topics SET progress = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (json.dumps(progress), _utcnow(), topic_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0


def delete_topic(user_id: int, topic_id: int) -> bool:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            "DELETE FROM topics WHERE id = ? AND user_id = ?", (topic_id, user_id)
        )
        conn.commit()
        return cur.rowcount > 0


def count_topics(user_id: int) -> int:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM topics WHERE user_id = ?", (user_id,)
        ).fetchone()
    return row["c"] if row else 0


# ---- Topic artifacts (cached AI generations per section) -------------------
def get_artifact(topic_id: int, kind: str, variant: str = "") -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM topic_artifacts WHERE topic_id = ? AND kind = ? AND variant = ? LIMIT 1",
            (topic_id, kind, variant),
        ).fetchone()


def upsert_artifact(topic_id: int, kind: str, content: str, variant: str = "") -> int:
    with closing(get_connection()) as conn:
        cur = conn.execute(
            """
            INSERT INTO topic_artifacts (topic_id, kind, variant, content, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (topic_id, kind, variant)
            DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
            """,
            (topic_id, kind, variant, content, _utcnow()),
        )
        conn.commit()
    touch_topic(topic_id)
    return cur.lastrowid


def list_artifacts(topic_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT kind, variant, updated_at FROM topic_artifacts WHERE topic_id = ?",
            (topic_id,),
        ).fetchall()


def count_artifacts(user_id: int) -> int:
    with closing(get_connection()) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM topic_artifacts a "
            "JOIN topics t ON a.topic_id = t.id WHERE t.user_id = ?",
            (user_id,),
        ).fetchone()
    return row["c"] if row else 0


# ---- Notes pin / favorite / duplicate ---------------------------------------
def update_note_flags(user_id: int, note_id: int,
                      pinned: bool | None = None,
                      favorite: bool | None = None,
                      archived: bool | None = None,
                      deleted: bool | None = None) -> bool:
    sets, vals = [], []
    if pinned is not None:
        sets.append("pinned = ?"); vals.append(1 if pinned else 0)
    if favorite is not None:
        sets.append("favorite = ?"); vals.append(1 if favorite else 0)
    if archived is not None:
        sets.append("archived = ?"); vals.append(1 if archived else 0)
    if deleted is not None:
        sets.append("deleted = ?"); vals.append(1 if deleted else 0)
    if not sets:
        return False
    vals += [note_id, user_id]
    with closing(get_connection()) as conn:
        cur = conn.execute(
            f"UPDATE notes SET {', '.join(sets)} WHERE id = ? AND user_id = ?", vals
        )
        conn.commit()
        return cur.rowcount > 0


def get_note(user_id: int, note_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            "SELECT * FROM notes WHERE id = ? AND user_id = ? LIMIT 1",
            (note_id, user_id),
        ).fetchone()


def duplicate_note(user_id: int, note_id: int) -> int | None:
    src = get_note(user_id, note_id)
    if not src:
        return None
    return add_note(user_id, f"{src['topic']} (copy)", src["content"])


# ---- Global search -----------------------------------------------------------
def global_search(user_id: int, q: str, limit: int = 8) -> dict:
    """Search notes, topics, chats and quizzes for the command palette."""
    like = f"%{q.strip()}%"
    out: dict[str, list] = {"topics": [], "notes": [], "chats": [], "quizzes": []}
    if not q.strip():
        return out
    with closing(get_connection()) as conn:
        out["topics"] = [dict(r) for r in conn.execute(
            "SELECT id, title, emoji FROM topics WHERE user_id = ? AND title LIKE ? "
            "ORDER BY updated_at DESC LIMIT ?", (user_id, like, limit)).fetchall()]
        out["notes"] = [dict(r) for r in conn.execute(
            "SELECT id, topic AS title FROM notes WHERE user_id = ? AND (topic LIKE ? OR content LIKE ?) "
            "ORDER BY id DESC LIMIT ?", (user_id, like, like, limit)).fetchall()]
        out["chats"] = [dict(r) for r in conn.execute(
            "SELECT id, title FROM chats WHERE user_id = ? AND title LIKE ? "
            "ORDER BY updated_at DESC LIMIT ?", (user_id, like, limit)).fetchall()]
        out["quizzes"] = [dict(r) for r in conn.execute(
            "SELECT id, topic AS title FROM quizzes WHERE user_id = ? AND topic LIKE ? "
            "ORDER BY id DESC LIMIT ?", (user_id, like, limit)).fetchall()]
    return out
