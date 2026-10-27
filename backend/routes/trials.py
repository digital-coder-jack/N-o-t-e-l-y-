"""Server-owned anonymous seven-day trial identity and expiry enforcement.

Trial identity is a signed opaque device token in an HttpOnly cookie, with
optional browser-side copies used only to rehydrate that cookie. Fingerprint
material is received transiently and HMAC-hashed on the server; raw material
is never written to the database.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend import auth, database as db

router = APIRouter(prefix="/api/trial", tags=["trial"])
COOKIE_NAME = "notely_trial_device"
DEVICE_TOKEN_TTL = 60 * 60 * 24 * 400
TRIAL_DAYS = 7


def _secret() -> bytes:
    # Configure TRIAL_HASH_SECRET in Vercel. JWT_SECRET is a compatibility
    # fallback for local development only.
    value = os.environ.get("TRIAL_HASH_SECRET") or os.environ.get("JWT_SECRET") or auth.JWT_SECRET
    return value.encode("utf-8")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _new_device_token() -> tuple[str, str]:
    device_id = secrets.token_urlsafe(32)
    payload = {"id": device_id, "exp": int(datetime.now(timezone.utc).timestamp()) + DEVICE_TOKEN_TTL}
    encoded = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64(hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest())
    return encoded + "." + signature, device_id


def _decode_device_token(token: str | None) -> str | None:
    if not token or len(token) > 2048:
        return None
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(signature)):
            return None
        payload = json.loads(_unb64(encoded))
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        device_id = payload.get("id")
        return device_id if isinstance(device_id, str) and 20 <= len(device_id) <= 256 else None
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def _hash(value: str) -> str:
    return hmac.new(_secret(), value.encode("utf-8"), hashlib.sha256).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _token_from_request(request: Request, supplied: str | None = None) -> str | None:
    return supplied or request.cookies.get(COOKIE_NAME) or request.headers.get("x-notely-device")


def _identity_hash(token: str | None) -> tuple[str | None, str | None]:
    device_id = _decode_device_token(token)
    return (_hash(device_id), device_id) if device_id else (None, None)


def _client_ip(request: Request) -> str:
    # The Vercel edge is the trusted proxy in this deployment.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:100] or "unknown"
    return request.client.host if request.client else "unknown"


def _ip_hash(request: Request) -> str:
    ua = request.headers.get("user-agent", "")[:500]
    return _hash(_client_ip(request) + "|" + ua)


def _fingerprint_hash(fingerprint: str) -> str:
    # Raw canvas/audio/font/screen/timezone/hardware values are not persisted.
    return _hash(fingerprint[:4000]) if fingerprint.strip() else ""


def _automation_check(request: Request, fingerprint: str) -> None:
    ua = request.headers.get("user-agent", "").lower()
    if any(marker in ua for marker in ("headlesschrome", "phantomjs", "puppeteer", "playwright", "selenium")):
        raise HTTPException(status_code=403, detail="Trial start is unavailable in automated browsers.")
    if re.search(r"(?:^|[|;,])webdriver(?:=|:)(?:1|true)(?:$|[|;,])", fingerprint.lower()):
        raise HTTPException(status_code=403, detail="Trial start is unavailable in automated browsers.")


def _set_cookie(response: Response, token: str) -> None:
    secure = os.environ.get("VERCEL") == "1" or os.environ.get("COOKIE_SECURE", "1") == "1"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=DEVICE_TOKEN_TTL,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def _find_trial(conn: sqlite3.Connection, device_hash: str | None, fingerprint_hash: str):
    clauses, values = [], []
    if device_hash:
        clauses.append("device_hash = ?")
        values.append(device_hash)
    if fingerprint_hash:
        clauses.append("fingerprint_hash = ?")
        values.append(fingerprint_hash)
    if not clauses:
        return None
    if device_hash:
        clauses.append("id IN (SELECT trial_id FROM trial_device_aliases WHERE device_hash = ?)")
        values.append(device_hash)
    return conn.execute(
        "SELECT * FROM trial_sessions WHERE " + " OR ".join(clauses) +
        " ORDER BY started_at ASC LIMIT 1",
        tuple(values),
    ).fetchone()


def _remember_device_alias(conn: sqlite3.Connection, trial, device_hash: str) -> None:
    if not device_hash or trial["device_hash"] == device_hash:
        return
    conn.execute(
        "INSERT OR IGNORE INTO trial_device_aliases(device_hash, trial_id, created_at) VALUES (?, ?, ?)",
        (device_hash, trial["id"], _iso(_now())),
    )


def _days_left(expires_at: str) -> int:
    try:
        end = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return max(0, int((end - _now()).total_seconds() + 86399) // 86400)
    except (ValueError, TypeError):
        return 0


class TrialRequest(BaseModel):
    device_token: str | None = Field(default=None, max_length=2048)
    fingerprint: str = Field(default="", max_length=4000)
    automation: bool = False


def _prepare_identity(request: Request, response: Response, token: str | None, fingerprint: str):
    device_hash, device_id = _identity_hash(token)
    if not device_hash:
        token, device_id = _new_device_token()
        device_hash = _hash(device_id)
    _set_cookie(response, token)
    return token, device_hash, _fingerprint_hash(fingerprint), _ip_hash(request)


@router.post("/status")
async def trial_status_endpoint(body: TrialRequest, request: Request, response: Response):
    token = _token_from_request(request, body.device_token)
    token, device_hash, fingerprint_hash, ip_hash = _prepare_identity(request, response, token, body.fingerprint)
    with closing(db.get_connection()) as conn:
        trial = _find_trial(conn, device_hash, fingerprint_hash)
        if trial is None:
            return {"status": "available", "available": True, "device_token": token, "days_left": None}
        # A fingerprint match lets a clean browser profile rehydrate the long-lived
        # cookie on this device without starting a second trial.
        if trial["device_hash"] != device_hash:
            _remember_device_alias(conn, trial, device_hash)
            conn.commit()
        if trial["converted_user_id"]:
            return {"status": "converted", "available": False, "converted": True, "device_token": token}
        left = _days_left(trial["expires_at"])
        if left <= 0:
            return {"status": "expired", "available": False, "expired": True, "message": "Your 7-day trial has ended", "device_token": token}
        return {"status": "active", "available": False, "active": True, "started_at": trial["started_at"], "expires_at": trial["expires_at"], "days_left": left, "device_token": token}


@router.post("/start")
async def start_trial(body: TrialRequest, request: Request, response: Response):
    token = _token_from_request(request, body.device_token)
    _automation_check(request, body.fingerprint)
    token, device_hash, fingerprint_hash, ip_hash = _prepare_identity(request, response, token, body.fingerprint)
    if body.automation:
        raise HTTPException(status_code=403, detail="Trial start is unavailable in automated browsers.")

    now = _now()
    with db.get_connection() as conn:
        existing = _find_trial(conn, device_hash, fingerprint_hash)
        if existing is not None:
            if existing["device_hash"] != device_hash:
                _remember_device_alias(conn, existing, device_hash)
                conn.commit()
            if existing["converted_user_id"]:
                raise HTTPException(status_code=409, detail="This trial is linked to an account. Please sign in.")
            left = _days_left(existing["expires_at"])
            if left <= 0:
                raise HTTPException(status_code=402, detail="Your 7-day trial has ended. Sign up or sign in to continue.", headers={"X-Notely-Trial-Expired": "true"})
            return {"status": "active", "resumed": True, "started_at": existing["started_at"], "expires_at": existing["expires_at"], "days_left": left, "device_token": token}

        # Creation limits are independent of the caller's device cookie. IP is
        # only a rate-limit signal; it is never sufficient to identify a trial.
        cutoff = _iso(now - timedelta(hours=24))
        ip_attempts = conn.execute(
            "SELECT COUNT(*) FROM trial_attempts WHERE kind='ip' AND key_hash=? AND created_at>=?",
            (ip_hash, cutoff),
        ).fetchone()[0]
        fp_attempts = conn.execute(
            "SELECT COUNT(*) FROM trial_attempts WHERE kind='fingerprint' AND key_hash=? AND created_at>=?",
            (fingerprint_hash, cutoff),
        ).fetchone()[0] if fingerprint_hash else 0
        if ip_attempts >= 20 or (fingerprint_hash and fp_attempts >= 1):
            raise HTTPException(status_code=429, detail="A trial has already been used on this device or too many trial attempts were made. Please sign up or sign in.")

        trial_id = uuid.uuid4().hex
        started = _iso(now)
        expires = _iso(now + timedelta(days=TRIAL_DAYS))
        hidden_email = "trial+" + trial_id + "@trial.notely.invalid"
        hidden_password = auth.hash_password(secrets.token_urlsafe(32))
        workspace_user_id = db.create_user("Trial workspace", hidden_email, hidden_password)
        if workspace_user_id is None:
            raise HTTPException(status_code=503, detail="Could not initialize trial storage. Please sign up or sign in.")
        try:
            conn.execute(
                "INSERT INTO trial_sessions (id, device_hash, ip_hash, fingerprint_hash, started_at, expires_at, converted_user_id, workspace_user_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
                (trial_id, device_hash, ip_hash, fingerprint_hash, started, expires, workspace_user_id),
            )
            conn.execute("INSERT INTO trial_attempts (kind, key_hash, created_at) VALUES ('ip', ?, ?)", (ip_hash, started))
            if fingerprint_hash:
                conn.execute("INSERT INTO trial_attempts (kind, key_hash, created_at) VALUES ('fingerprint', ?, ?)", (fingerprint_hash, started))
            conn.commit()
        except Exception:
            conn.rollback()
            # Remove the invisible workspace principal if the trial row failed.
            with db.get_connection() as cleanup:
                cleanup.execute("DELETE FROM users WHERE id = ?", (workspace_user_id,))
                cleanup.commit()
            raise HTTPException(status_code=503, detail="Could not initialize trial storage. Please try again.")
    return {"status": "active", "resumed": False, "started_at": started, "expires_at": expires, "days_left": TRIAL_DAYS, "device_token": token}


@router.post("/identity")
async def rehydrate_trial_identity(body: TrialRequest, request: Request, response: Response):
    token = _token_from_request(request, body.device_token)
    token, device_hash, fingerprint_hash, _ = _prepare_identity(request, response, token, body.fingerprint)
    with db.get_connection() as conn:
        trial = _find_trial(conn, device_hash, fingerprint_hash)
        if trial is not None and trial["device_hash"] != device_hash:
            conn.execute("UPDATE trial_sessions SET device_hash = ? WHERE id = ?", (device_hash, trial["id"]))
            conn.commit()
    return {"ok": True, "device_token": token}


def resolve_trial_user(request: Request) -> dict[str, Any] | None:
    token = _token_from_request(request)
    device_hash, _ = _identity_hash(token)
    if not device_hash:
        return None
    with db.get_connection() as conn:
        trial = conn.execute(
            "SELECT * FROM trial_sessions WHERE device_hash = ? OR id IN (SELECT trial_id FROM trial_device_aliases WHERE device_hash = ?) ORDER BY started_at ASC LIMIT 1",
            (device_hash, device_hash),
        ).fetchone()
        if trial is None or trial["converted_user_id"]:
            return None
        left = _days_left(trial["expires_at"])
        if left <= 0:
            raise HTTPException(
                status_code=402,
                detail="Your 7-day trial has ended. Sign up or sign in to continue.",
                headers={"X-Notely-Trial-Expired": "true", "Cache-Control": "no-store"},
            )
        row = db.get_user_by_id(int(trial["workspace_user_id"]))
        if row is None:
            return None
        user = dict(row)
        user.update({
            "trial_started_at": trial["started_at"],
            "trial_ends_at": trial["expires_at"],
            "trial_days_left": left,
            "trial_active": True,
            "trial_expired": False,
            "is_trial": True,
            "trial_id": trial["id"],
            "converted_user_id": None,
        })
        return user


def convert_trial_to_account(request: Request, new_user_id: int) -> bool:
    """Move an anonymous trial's user-owned data to a verified account."""
    token = _token_from_request(request)
    device_hash, _ = _identity_hash(token)
    if not device_hash:
        return False
    with db.get_connection() as conn:
        trial = conn.execute(
            "SELECT * FROM trial_sessions WHERE (device_hash = ? OR id IN (SELECT trial_id FROM trial_device_aliases WHERE device_hash = ?)) AND converted_user_id IS NULL LIMIT 1",
            (device_hash,),
        ).fetchone()
        if trial is None:
            return False
        old_user_id = int(trial["workspace_user_id"])
        if old_user_id == new_user_id:
            conn.execute("UPDATE trial_sessions SET converted_user_id=? WHERE id=?", (new_user_id, trial["id"]))
            conn.commit()
            return True

        # Keep the workspace created for the account's normal defaults, but
        # replace it with the anonymous trial's preferences/data.
        conn.execute("DELETE FROM user_settings WHERE user_id = ?", (new_user_id,))
        table_rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
        for table_row in table_rows:
            table = table_row["name"]
            if table in {"users", "questions", "trial_sessions", "email_verifications", "auth_signin_attempts", "trial_attempts"}:
                continue
            columns = [row["name"] for row in conn.execute('PRAGMA table_info("' + table.replace('"', '""') + '")').fetchall()]
            if "user_id" not in columns:
                continue
            try:
                conn.execute('UPDATE "' + table.replace('"', '""') + '" SET user_id = ? WHERE user_id = ?', (new_user_id, old_user_id))
            except sqlite3.IntegrityError:
                # A uniqueness constraint can exist in optional/user-specific
                # tables; retaining the account's existing row is safer than
                # rolling back all migrated notes and conversations.
                continue
        conn.execute("UPDATE trial_sessions SET converted_user_id=?, workspace_user_id=? WHERE id=?", (new_user_id, new_user_id, trial["id"]))
        conn.execute("DELETE FROM users WHERE id = ?", (old_user_id,))
        conn.commit()
        return True
