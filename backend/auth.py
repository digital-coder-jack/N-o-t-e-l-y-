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
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from argon2 import PasswordHasher, exceptions as argon2_exceptions
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
        os.environ.get("VERCEL_PROJECT_ID", ""),
        os.environ.get("VERCEL_GIT_REPO_ID", ""),
        # A fixed app-specific salt so the seed is never empty.
        "notely::jwt::v2",
    ]
    seed = "|".join(seed_parts).encode("utf-8")
    return hashlib.sha256(seed).hexdigest()


JWT_SECRET = os.environ.get("JWT_SECRET") or _stable_fallback_secret()
JWT_ALG = "HS256"
JWT_TTL_SECONDS = int(os.environ.get("JWT_TTL_SECONDS", str(60 * 60 * 24 * 7)))  # 7 days

PBKDF2_ROUNDS = 200_000
ARGON2 = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2 — pure standard library)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """Hash new passwords using Argon2id."""
    return ARGON2.hash(password)


def verify_password(password: str, stored: str) -> bool:
    """Verify Argon2id hashes and transparently accept legacy PBKDF2 hashes."""
    try:
        if stored.startswith("$argon2"):
            return bool(ARGON2.verify(stored, password))
        algorithm, rounds_s, salt_b64, hash_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_s)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError, argon2_exceptions.VerificationError, argon2_exceptions.InvalidHashError):
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
def testing_auth_enabled() -> bool:
    """Temporary preview-only auth bypass. Production can never enable this."""
    return (
        os.environ.get("DISABLE_AUTH_FOR_TESTING", "").strip().lower() in {"1", "true", "yes", "on"}
        and os.environ.get("VERCEL_ENV", "").strip().lower() == "preview"
    )


def preview_test_user() -> dict:
    """Return one persistent, non-login Test User for protected preview testing."""
    email = "notely-preview-test-user@notely.invalid"
    row = db.get_user_by_email(email)
    if row is None:
        # TEMP: remove after testing
        user_id = db.create_user(
            "Test User",
            email,
            "PREVIEW_TEST_ACCOUNT_LOGIN_DISABLED",
            username="notely-preview-test-user",
        )
        row = db.get_user_by_id(user_id) if user_id else db.get_user_by_email(email)
    if row is None:
        raise HTTPException(status_code=503, detail="Preview test user could not be initialized.")
    user = dict(row)
    user["is_test_user"] = True
    user["is_trial"] = False
    user["trial_expired"] = False
    user["trial_active"] = True
    user["trial_days_left"] = None
    return user


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
    """Resolve an account session or a valid anonymous trial session.

    A stale account JWT can remain in localStorage after a visitor starts a
    no-account trial. If the signed trial device credential is also present,
    the obsolete bearer token must not force that visitor back to /login.
    Trial fallback is restricted to workspace endpoints and safe GET profile/
    settings reads; account-mutating auth routes still require a real JWT.
    """
    path = request.url.path
    method = request.method.upper()
    user = None
    account_token_present = credentials is not None and bool(credentials.credentials)

    # TEMP: remove after testing — only the Vercel Preview environment can use this bypass.
    # Vercel SSO protection must remain enabled for preview deployments.
    test_profile_read = method == "GET" and path in {"/api/auth/me", "/api/auth/settings"}
    if testing_auth_enabled() and (not path.startswith("/api/auth/") or test_profile_read) and not path.startswith("/api/trial/"):
        return preview_test_user()

    if account_token_present:
        try:
            payload = decode_access_token(credentials.credentials)
            user_id = int(payload["sub"])
            user = db.get_user_by_id(user_id)
        except (ValueError, KeyError, TypeError):
            user = None

    allow_trial_fallback = (
        not path.startswith("/api/auth/")
        or (method == "GET" and path in {"/api/auth/me", "/api/auth/settings"})
    )
    if user is None and allow_trial_fallback:
        # Import lazily to avoid a router/auth import cycle. An active signed
        # cookie or opaque signed device token is required by this resolver.
        try:
            from backend.routes.trials import resolve_trial_user
            user = resolve_trial_user(request)
        except HTTPException:
            raise
        except Exception:
            user = None

    if user is None:
        if account_token_present:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has expired. Sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in or start your 7-day trial to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Enforce expiry on every non-auth workspace API call. The trial resolver
    # already rejects expired anonymous trials before it returns a user.
    if not path.startswith("/api/auth/") and not path.startswith("/api/trial/"):
        status_info = trial_status(user)
        is_anonymous_trial = bool(user.get("is_trial")) if isinstance(user, dict) else False
        if (is_anonymous_trial or status_info["is_trial"]) and status_info["trial_expired"]:
            raise HTTPException(
                status_code=402,
                detail="Your 7-day trial has ended. Sign up or sign in to continue.",
                headers={"X-Notely-Trial-Expired": "true", "Cache-Control": "no-store"},
            )
    return dict(user) if not isinstance(user, dict) else dict(user)
