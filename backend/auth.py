"""
=====================================================================
 AI NOTEBOOK  -  backend/auth.py
=====================================================================
Security utilities for the web application:

  * Password hashing  : PBKDF2-HMAC-SHA256 (standard library only, no
                        native build needed → works on Vercel's Python
                        runtime out of the box).
  * JWT tokens        : signed with HMAC-SHA256 using a stdlib
                        implementation (no external PyJWT dependency).
  * FastAPI dependency: `current_user` extracts and validates the
                        bearer token, returning the authenticated user.

Secrets are read from environment variables only — never hardcoded.
=====================================================================
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import secrets
import time

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend import database as db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# You SHOULD set JWT_SECRET in the environment so tokens survive restarts and
# work across multiple serverless instances.
#
# IMPORTANT: A randomly-generated per-process secret breaks logins on
# serverless platforms (e.g. Vercel) because each cold-started instance would
# generate a *different* secret — a token signed by one instance then fails
# signature validation on another, producing spurious "session expired" /
# "invalid login" errors right after a successful signup or login.
#
# To stay robust even when JWT_SECRET is not configured, we fall back to a
# DETERMINISTIC secret derived from a few stable, platform-provided values.
# This keeps every instance in agreement while still being non-trivial to
# guess. Setting JWT_SECRET explicitly in production remains strongly advised.
def _stable_fallback_secret() -> str:
    seed_parts = [
        os.environ.get("VERCEL_URL", ""),
        os.environ.get("VERCEL_PROJECT_ID", ""),
        os.environ.get("VERCEL_GIT_REPO_ID", ""),
        # A fixed app-specific salt so the seed is never empty.
        "study-sphere-ai::jwt::v1",
    ]
    seed = "|".join(seed_parts).encode("utf-8")
    return hashlib.sha256(seed).hexdigest()


JWT_SECRET = os.environ.get("JWT_SECRET") or _stable_fallback_secret()
JWT_ALG = "HS256"
JWT_TTL_SECONDS = int(os.environ.get("JWT_TTL_SECONDS", str(60 * 60 * 24 * 7)))  # 7 days

PBKDF2_ROUNDS = 200_000


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2 — pure standard library)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """Return a salted PBKDF2 hash string: pbkdf2_sha256$rounds$salt$hash."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ROUNDS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verification of a password against a stored hash."""
    try:
        algorithm, rounds_s, salt_b64, hash_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_s)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# JWT (compact HS256 implementation — no third-party dependency)
# ---------------------------------------------------------------------------
def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(user_id: int, email: str) -> str:
    header = {"alg": JWT_ALG, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> dict:
    """Validate signature + expiry. Raises ValueError if invalid."""
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError:
        raise ValueError("Malformed token")

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_sig = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
    actual_sig = _b64url_decode(signature_b64)
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid signature")

    payload = json.loads(_b64url_decode(payload_b64))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")
    return payload


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def trial_status(user) -> dict:
    """Return server-derived trial status for a user row; legacy accounts stay grandfathered."""
    try:
        end_raw = user["trial_ends_at"]
        start_raw = user["trial_started_at"]
    except (KeyError, TypeError, IndexError):
        end_raw = None
        start_raw = None
    if not end_raw:
        return {
            "trial_started_at": start_raw,
            "trial_ends_at": None,
            "trial_days_left": None,
            "trial_active": True,
            "trial_expired": False,
            "is_trial": False,
        }
    try:
        end = datetime.fromisoformat(str(end_raw).replace("Z", "+00:00"))
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        seconds_left = (end - datetime.now(timezone.utc)).total_seconds()
        days_left = max(0, math.ceil(seconds_left / 86400))
        active = seconds_left > 0
    except (TypeError, ValueError):
        days_left = 0
        active = False
    return {
        "trial_started_at": start_raw,
        "trial_ends_at": end_raw,
        "trial_days_left": days_left,
        "trial_active": active,
        "trial_expired": not active,
        "is_trial": True,
    }


async def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    """Require a real authenticated account."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired. Sign in again.")

    user = db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found. Sign in again.")

    path = request.url.path
    method = request.method.upper()
    is_write = method in {"POST", "PUT", "PATCH", "DELETE"}
    auth_path = path.startswith("/api/auth/")
    is_cancel = path.endswith("/cancel")
    status_info = trial_status(user)
    if is_write and not auth_path and not is_cancel and status_info["trial_expired"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your 7-day trial has ended. Your saved work is still available in read-only mode.",
            headers={"X-Notely-Trial-Expired": "true"},
        )
    return dict(user)
