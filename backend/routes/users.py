"""
=====================================================================
 AI NOTEBOOK  -  backend/routes/users.py
=====================================================================
Authentication & user-profile API.

Endpoints (all prefixed with /api):
  POST /api/auth/signup           -> create account, returns JWT
  POST /api/auth/login            -> login, returns JWT
  POST /api/auth/forgot-password  -> issue a reset token
  POST /api/auth/reset-password   -> set new password with reset token
  GET  /api/auth/me               -> current user profile
  PUT  /api/auth/profile          -> update display name
  PUT  /api/auth/change-password  -> change password (authenticated)
=====================================================================
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import smtplib
from contextlib import closing

import dns.resolver
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote

from email_validator import validate_email, EmailNotValidError
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend import auth, database as db

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class SignupIn(BaseModel):
    name: str = ""
    username: str = ""
    email: str = ""
    password: str = ""
    confirm_password: str = ""


class LoginIn(BaseModel):
    identifier: str # Email or Username
    password: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str = ""
    password: str = ""


class ProfileIn(BaseModel):
    name: str = ""
    username: str = ""
    email: str = ""


class ChangePwIn(BaseModel):
    current_password: str = ""
    new_password: str = ""


def _public_user(row) -> dict:
   return {
    "id": row["id"],
    "name": row["name"],
    "username": row["username"] if "username" in row.keys() else None,
    "email": row["email"],
    "created_at": row["created_at"],
    "last_login": row["last_login"] if "last_login" in row.keys() else None,
    **auth.trial_status(row),
}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
GENERIC_SIGNUP_MESSAGE = "If this address can be registered, a verification code has been sent."
GENERIC_LOGIN_MESSAGE = "Invalid email/username or password."
GENERIC_RESET_MESSAGE = "If an account matches that address, a password-reset link will be sent shortly."
TEMP_EMAIL_DOMAINS = set("""
10minutemail.com 10minutemail.net 10minutemail.org 20minutemail.com 33mail.com
anonymbox.com discard.email discardmail.com dispostable.com emailondeck.com
fakeinbox.com getnada.com guerrillamail.com guerrillamail.biz guerrillamail.de
guerrillamail.info guerrillamail.net guerrillamail.org mailinator.com maildrop.cc
mailnesia.com mintemail.com moakt.com mytemp.email nakedmail.com nevermail.de
sharklasers.com spam4.me spambox.us temp-mail.org temp-mail.io tempail.com
tempmail.com tempmail.dev tempmail.net tempmail.plus tempmailo.com throwaway.email
throwawaymail.com trashmail.com trashmail.net yopmail.com yopmail.fr yopmail.net
yopmail.org 1secmail.com 1secmail.net 1secmail.org 5ymail.com emailfake.com
email-fake.com emailmiser.com fakemail.net getairmail.com mailcatch.com mailnull.com
mailsac.com mailtemp.info mailtothis.com mintemail.com mohmal.com mytrashmail.com
nowmymail.com objectmail.com oneoffemail.com quickinbox.com rcpt.at rejectmail.com
safetymail.info saynotospams.com tempinbox.com temporaryemail.net temporary-mail.net
throwawaymail.net trash-mail.com vanishmail.com wegwerfmail.de wegwerfmail.net
wegwerfmail.org zippymail.info mail-temp.com tempmailaddress.com emailtemporanea.com
emailigo.de emailz.gdn fleckens.hu getonemail.com incognitomail.org inboxbear.com
inboxkitten.com jetable.org koszmail.pl lr78.com mail-temporaire.fr mail7.io
mailbox52.ga mailblocks.com mailforspam.com mailimate.com mailinater.com mailmoat.com
mailnew.com mailslite.com mailzilla.com spamgourmet.com spamfree24.org spamherelots.com
tempemail.co.za tempemail.com tempemail.net tempinbox.co.uk temporarymail.com
temporarymailaddress.com throwam.com trashymail.com uswk.net wordtotext.com
""".split())
TEMP_EMAIL_DOMAINS.update(domain.strip().lower() for domain in os.environ.get("TEMP_EMAIL_DOMAINS", "").split(",") if domain.strip())

COMMON_PASSWORDS = set("""
123456 1234567 12345678 123456789 1234567890 111111 000000 password password1
password123 passw0rd p@ssw0rd qwerty qwerty123 qwertyuiop abc123 abc12345
iloveyou letmein welcome welcome1 admin admin123 login monkey dragon sunshine
princess football baseball master shadow ashley michael superman trustno1
whatever freedom 123123 654321 987654321 1q2w3e4r 1q2w3e4r5t 123qwe
qazwsx qazwsx123 zxcvbnm asdfghjkl password12 pass1234 user user123
student student123 changeme default secret secret123 test test123 love123
hello123 computer internet samsung google batman matrix starwars hello
qwerty1 qwerty12 iloveyou1 welcome123 access guest root toor passw0rd123
""".split())


class VerifyEmailIn(BaseModel):
    email: str
    otp: str = ""
    device_token: str = ""
    fingerprint: str = ""


class ResendVerificationIn(BaseModel):
    email: str


def _canonical_email(raw: str) -> str:
    email = (raw or "").strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    local, domain = email.rsplit("@", 1)
    local, domain = local.lower(), domain.lower().rstrip(".")
    if domain in {"gmail.com", "googlemail.com"}:
        local = local.split("+", 1)[0].replace(".", "")
        domain = "gmail.com"
    return local + "@" + domain


def _validated_email(raw: str) -> tuple[str, str]:
    delivery_email = (raw or "").strip().lower()
    if not EMAIL_RE.fullmatch(delivery_email):
        raise HTTPException(status_code=400, detail="Invalid email format. Enter a valid email address.")

    try:
        checked = validate_email(
            delivery_email,
            check_deliverability=False,
            allow_smtputf8=False,
        )
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="Invalid email format. Enter a valid email address.")

    domain = (checked.domain or delivery_email.rsplit("@", 1)[-1]).lower().rstrip(".")
    if any(domain == blocked or domain.endswith("." + blocked) for blocked in TEMP_EMAIL_DOMAINS):
        raise HTTPException(status_code=400, detail="This email provider is not allowed. Please use a permanent email address.")

    # Only a definite NXDOMAIN is treated as a missing domain. Temporary DNS
    # failures (timeouts, SERVFAIL, unavailable resolvers) must not block a
    # syntactically valid address; SMTP delivery will provide the final check.
    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = 1.0
        resolver.lifetime = 2.0
        resolver.resolve(domain, "MX", lifetime=2.0, raise_on_no_answer=False)
    except dns.resolver.NXDOMAIN:
        raise HTTPException(status_code=400, detail="Email domain not found. Check the domain spelling and try again.")
    except Exception as exc:
        logging.getLogger("notely-auth").warning(
            "Email domain lookup skipped after temporary DNS failure; error_type=%s",
            type(exc).__name__,
        )

    return _canonical_email(delivery_email), delivery_email


def _smtp_error_code(exc: Exception) -> int | None:
    code = getattr(exc, "smtp_code", None)
    return code if isinstance(code, int) else None


def _log_smtp_failure(action: str, exc: Exception) -> None:
    # Do not log exception text or tracebacks: SMTP exceptions can include
    # server details and potentially sensitive configuration information.
    logging.getLogger("notely-auth").error(
        "%s failed; error_type=%s smtp_code=%s",
        action,
        type(exc).__name__,
        _smtp_error_code(exc),
    )


def _password_problem(password: str) -> str | None:
    if len(password) < 8:
        return "Use at least 8 characters for your password."
    if len(password.encode("utf-8")) > 1024:
        return "Choose a shorter password."
    if password.strip().lower() in COMMON_PASSWORDS:
        return "Choose a less common password."
    return None


def _otp_hash(email: str, otp: str) -> str:
    secret = (os.environ.get("OTP_SECRET") or os.environ.get("JWT_SECRET") or auth.JWT_SECRET).encode()
    return hmac.new(secret, (email + "|" + otp).encode(), hashlib.sha256).hexdigest()


def _send_email(recipient: str, subject: str, body: str) -> None:
    host = os.environ.get("SMTP_HOST", "").strip()
    sender = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER", "")).strip()
    if not host or not sender:
        raise RuntimeError("SMTP_HOST and SMTP_FROM must be configured to send email.")
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    port = int(os.environ.get("SMTP_PORT", "587"))
    use_ssl = os.environ.get("SMTP_USE_SSL", "0").lower() in {"1", "true", "yes"}
    use_tls = os.environ.get("SMTP_USE_TLS", "1").lower() in {"1", "true", "yes"}
    smtp_cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_cls(host, port, timeout=12) as server:
        if use_tls and not use_ssl:
            server.starttls()
            server.ehlo()
        username = os.environ.get("SMTP_USER", "")
        password = os.environ.get("SMTP_PASSWORD", "")
        if username:
            server.login(username, password)
        server.send_message(message)


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def _new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _signin_key(identifier: str, request: Request) -> str:
    raw_ip = request.headers.get("x-forwarded-for", "")
    if raw_ip:
        raw_ip = raw_ip.split(",", 1)[0].strip()
    elif request.client:
        raw_ip = request.client.host
    key = identifier.lower().strip() + "|" + raw_ip
    secret = (os.environ.get("OTP_SECRET") or os.environ.get("JWT_SECRET") or auth.JWT_SECRET).encode()
    return hmac.new(secret, key.encode(), hashlib.sha256).hexdigest()


def _signin_lock_state(key: str) -> tuple[bool, int]:
    now = datetime.now(timezone.utc)
    with closing(db.get_connection()) as conn:
        row = conn.execute("SELECT attempts, locked_until FROM auth_signin_attempts WHERE key_hash=?", (key,)).fetchone()
    if not row or not row["locked_until"]:
        return False, 0
    try:
        until = _parse_time(row["locked_until"])
    except (TypeError, ValueError):
        return False, 0
    return until > now, max(0, int((until - now).total_seconds()))


def _record_signin_failure(key: str) -> None:
    now = datetime.now(timezone.utc)
    now_s = now.isoformat(timespec="seconds")
    with closing(db.get_connection()) as conn:
        row = conn.execute("SELECT attempts FROM auth_signin_attempts WHERE key_hash=?", (key,)).fetchone()
        attempts = (int(row["attempts"]) if row else 0) + 1
        locked_until = (now + timedelta(minutes=15)).isoformat(timespec="seconds") if attempts >= 5 else None
        conn.execute(
            "INSERT INTO auth_signin_attempts (key_hash, attempts, locked_until, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(key_hash) DO UPDATE SET attempts=excluded.attempts, locked_until=excluded.locked_until, updated_at=excluded.updated_at",
            (key, attempts, locked_until, now_s),
        )
        conn.commit()


def _clear_signin_failures(key: str) -> None:
    with closing(db.get_connection()) as conn:
        conn.execute("DELETE FROM auth_signin_attempts WHERE key_hash=?", (key,))
        conn.commit()


@router.post("/signup")
async def signup(body: SignupIn, request: Request):
    name = (body.name or "").strip()
    password = body.password or ""
    confirm_password = body.confirm_password or ""
    if not name:
        raise HTTPException(status_code=400, detail="Please enter your name.")
    if confirm_password != password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    problem = _password_problem(password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    email, delivery_email = _validated_email(body.email)
    existing_user = db.get_user_by_email(email)
    password_matches = 0
    if existing_user:
        # Same response and OTP delivery path for an existing address: only
        # the mailbox holder can complete this step, and a matching password
        # converts the "sign up" attempt into a normal sign-in.
        username = existing_user["username"] or ""
        name = existing_user["name"]
    else:
        username = (body.username or "").strip().lower()
        if not username:
            base = re.sub(r"[^a-z0-9_]", "", email.split("@", 1)[0])[:24] or "student"
            username = base
            if db.get_user_by_username(username):
                username = f"{base}_{secrets.token_hex(3)}"
        elif db.get_user_by_username(username):
            raise HTTPException(status_code=400, detail="Unable to create this account with those details.")

    now = datetime.now(timezone.utc)
    ip_raw = request.headers.get("x-forwarded-for", "")
    if ip_raw:
        ip_raw = ip_raw.split(",", 1)[0].strip()
    elif request.client:
        ip_raw = request.client.host
    secret = (os.environ.get("OTP_SECRET") or os.environ.get("JWT_SECRET") or auth.JWT_SECRET).encode()
    signup_ip_key = hmac.new(secret, ("signup-ip|" + (ip_raw or "unknown")).encode(), hashlib.sha256).hexdigest()
    now_s = now.isoformat(timespec="seconds")
    cutoff = (now - timedelta(hours=1)).isoformat(timespec="seconds")
    with closing(db.get_connection()) as conn:
        pending = conn.execute("SELECT expires_at, resend_after FROM email_verifications WHERE email=?", (email,)).fetchone()
        if pending is not None:
            try:
                if _parse_time(pending["expires_at"]) > now and _parse_time(pending["resend_after"]) > now:
                    return {"verification_required": True, "email": delivery_email, "message": "A verification code was already sent. Check your inbox or wait before requesting another."}
            except (TypeError, ValueError):
                pass
        ip_attempts = conn.execute(
            "SELECT COUNT(*) FROM trial_attempts WHERE kind='signup-ip' AND key_hash=? AND created_at>=?",
            (signup_ip_key, cutoff),
        ).fetchone()[0]
        if ip_attempts >= 5:
            raise HTTPException(status_code=429, detail="Too many verification requests. Please try again later.")
        conn.execute("INSERT INTO trial_attempts(kind, key_hash, created_at) VALUES('signup-ip', ?, ?)", (signup_ip_key, now_s))
        conn.commit()

    # Argon2 verification is intentionally after the signup rate-limit check.
    password_matches = int(existing_user is not None and auth.verify_password(password, existing_user["password_hash"]))
    otp = _new_otp()
    expires = (now + timedelta(minutes=10)).isoformat(timespec="seconds")
    resend_after = (now + timedelta(seconds=60)).isoformat(timespec="seconds")
    password_hash = auth.hash_password(password)
    try:
        with closing(db.get_connection()) as conn:
            conn.execute(
                "INSERT INTO email_verifications (email, delivery_email, name, username, password_hash, otp_hash, expires_at, resend_after, attempts, created_at, existing_user_id, password_matches) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?) "
                "ON CONFLICT(email) DO UPDATE SET delivery_email=excluded.delivery_email, name=excluded.name, username=excluded.username, password_hash=excluded.password_hash, otp_hash=excluded.otp_hash, expires_at=excluded.expires_at, resend_after=excluded.resend_after, attempts=0, created_at=excluded.created_at, existing_user_id=excluded.existing_user_id, password_matches=excluded.password_matches",
                (email, delivery_email, name, username, password_hash, _otp_hash(email, otp), expires, resend_after, now.isoformat(timespec="seconds"), existing_user["id"] if existing_user else None, password_matches),
            )
            conn.commit()
        _send_email(delivery_email, "Your Notely verification code", f"Your Notely verification code is {otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.")
    except Exception as exc:
        _log_smtp_failure("Signup OTP email delivery", exc)
        with closing(db.get_connection()) as conn:
            conn.execute("DELETE FROM email_verifications WHERE email=?", (email,))
            conn.commit()
        raise HTTPException(status_code=503, detail="We couldn't send your verification email. Please check your email settings or try again later.")
    return {"verification_required": True, "email": delivery_email, "message": "Check your email for a six-digit verification code. It expires in 10 minutes."}


@router.post("/resend-verification")
async def resend_verification(body: ResendVerificationIn):
    email = _canonical_email(body.email)
    now = datetime.now(timezone.utc)
    with closing(db.get_connection()) as conn:
        row = conn.execute("SELECT * FROM email_verifications WHERE email=?", (email,)).fetchone()
    if row is None:
        return {"message": GENERIC_SIGNUP_MESSAGE}
    try:
        if _parse_time(row["resend_after"]) > now:
            raise HTTPException(status_code=429, detail="Please wait before requesting another code.")
    except ValueError:
        pass
    otp = _new_otp()
    expires = (now + timedelta(minutes=10)).isoformat(timespec="seconds")
    resend_after = (now + timedelta(seconds=60)).isoformat(timespec="seconds")
    with closing(db.get_connection()) as conn:
        conn.execute("UPDATE email_verifications SET otp_hash=?, expires_at=?, resend_after=?, attempts=0, created_at=? WHERE email=?",
                     (_otp_hash(email, otp), expires, resend_after, now.isoformat(timespec="seconds"), email))
        conn.commit()
    try:
        _send_email(row["delivery_email"], "Your Notely verification code", f"Your Notely verification code is {otp}. It expires in 10 minutes.")
    except Exception as exc:
        _log_smtp_failure("Resend OTP email delivery", exc)
        raise HTTPException(status_code=503, detail="We couldn't send your verification email. Please check your email settings or try again later.")
    return {"message": "A new verification code has been sent."}


@router.post("/verify-email")
async def verify_email(body: VerifyEmailIn, request: Request):
    email = _canonical_email(body.email)
    otp = (body.otp or "").strip()
    if not re.fullmatch(r"\d{6}", otp):
        raise HTTPException(status_code=400, detail="The verification code is invalid or expired. Request a new one.")
    now = datetime.now(timezone.utc)
    with closing(db.get_connection()) as conn:
        row = conn.execute("SELECT * FROM email_verifications WHERE email=?", (email,)).fetchone()
        if row is None:
            raise HTTPException(status_code=400, detail="The verification code is invalid or expired. Request a new one.")
        try:
            is_expired = _parse_time(row["expires_at"]) <= now
        except (TypeError, ValueError):
            is_expired = True
        if is_expired or int(row["attempts"]) >= 5:
            conn.execute("DELETE FROM email_verifications WHERE email=?", (email,))
            conn.commit()
            raise HTTPException(status_code=400, detail="The verification code is invalid or expired. Request a new one.")
        if not hmac.compare_digest(_otp_hash(email, otp), row["otp_hash"]):
            attempts = int(row["attempts"]) + 1
            if attempts >= 5:
                conn.execute("DELETE FROM email_verifications WHERE email=?", (email,))
            else:
                conn.execute("UPDATE email_verifications SET attempts=? WHERE email=?", (attempts, email))
            conn.commit()
            raise HTTPException(status_code=400, detail="The verification code is invalid or expired. Request a new one.")
    existing_user_id = row["existing_user_id"] if "existing_user_id" in row.keys() else None
    if existing_user_id is not None:
        with closing(db.get_connection()) as conn:
            conn.execute("DELETE FROM email_verifications WHERE email=?", (email,))
            conn.commit()
        if not int(row["password_matches"] or 0):
            raise HTTPException(status_code=400, detail="Could not complete this step. Check your details or sign in.")
        existing = db.get_user_by_id(int(existing_user_id))
        if existing is None:
            raise HTTPException(status_code=400, detail="The verification code is invalid or expired. Request a new one.")
        user_id = int(existing_user_id)
    else:
        user_id = db.create_user(row["name"], email, row["password_hash"], username=row["username"], start_trial=True)
        if user_id is None:
            with closing(db.get_connection()) as conn:
                conn.execute("DELETE FROM email_verifications WHERE email=?", (email,))
                conn.commit()
            raise HTTPException(status_code=400, detail="The verification code is invalid or expired. Request a new one.")
        with closing(db.get_connection()) as conn:
            conn.execute("DELETE FROM email_verifications WHERE email=?", (email,))
            conn.commit()
    db.touch_last_login(user_id)
    try:
        from backend.routes.trials import convert_trial_to_account
        convert_trial_to_account(request, user_id)
    except Exception:
        logging.getLogger("notely-auth").exception("Trial conversion failed after account verification")
    token = auth.create_access_token(user_id, email)
    user = db.get_user_by_id(user_id)
    return {"token": token, "user": _public_user(user), "message": "Email verified successfully."}


@router.post("/login")
async def login(body: LoginIn, request: Request):
    identifier_raw = (body.identifier or "").strip()
    password = body.password or ""
    if not identifier_raw or not password:
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_MESSAGE)
    identifier = _canonical_email(identifier_raw) if "@" in identifier_raw else identifier_raw.lower()
    key = _signin_key(identifier, request)
    locked, seconds = _signin_lock_state(key)
    if locked:
        raise HTTPException(status_code=429, detail="Too many unsuccessful sign-in attempts. Try again later.", headers={"Retry-After": str(seconds)})
    user = db.get_user_by_email(identifier) if "@" in identifier else None
    if user is None:
        user = db.get_user_by_username(identifier)
    if user is None or not auth.verify_password(password, user["password_hash"]):
        _record_signin_failure(key)
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_MESSAGE)
    _clear_signin_failures(key)
    db.touch_last_login(user["id"])
    token = auth.create_access_token(user["id"], user["email"])
    return {"token": token, "user": _public_user(db.get_user_by_id(user["id"]))}


@router.post("/refresh")
async def refresh_session(user=Depends(auth.current_user)):
    if isinstance(user, dict) and user.get("is_trial"):
        raise HTTPException(status_code=401, detail="Sign in with a verified account to refresh this session.")
    status_info = auth.trial_status(user)
    if status_info["is_trial"] and status_info["trial_expired"]:
        raise HTTPException(status_code=402, detail="Your 7-day trial has ended. Sign up or sign in to continue.", headers={"X-Notely-Trial-Expired": "true"})
    fresh = db.get_user_by_id(int(user["id"]))
    token = auth.create_access_token(int(user["id"]), str(fresh["email"]))
    return {"token": token, "user": _public_user(fresh)}


@router.post("/forgot-password")
async def forgot_password(body: ForgotIn, request: Request):
    # Generic response for unknown email addresses. Reset secrets are only
    # delivered to the mailbox and are never returned by the API.
    try:
        email = _canonical_email(body.email)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        found = db.set_reset_token(email, token, expires)
        if found:
            base_url = os.environ.get("APP_BASE_URL", str(request.base_url).rstrip("/")).rstrip("/")
            link = base_url + "/forgot?token=" + quote(token)
            _send_email(email, "Reset your Notely password", "Use this link within one hour to reset your Notely password:\n\n" + link + "\n\nIf you did not request this, ignore this email.")
    except Exception:
        logging.getLogger("notely-auth").exception("Password-reset email could not be processed")
    return {"message": GENERIC_RESET_MESSAGE}


@router.post("/reset-password")
async def reset_password(body: ResetIn):
    problem = _password_problem(body.password or "")
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    user = db.get_user_by_reset_token(body.token)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
    try:
        expires = datetime.strptime(user["reset_expires"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
    db.update_user_password(user["id"], auth.hash_password(body.password))
    return {"message": "Your password has been reset. You can now sign in."}


@router.get("/me")
async def me(user=Depends(auth.current_user)):
    return {"user": _public_user(db.get_user_by_id(user["id"]))}


@router.put("/profile")
async def update_profile(body: ProfileIn, user=Depends(auth.current_user)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter your name.")
    db.update_user_profile(user["id"], name)
    return {"user": _public_user(db.get_user_by_id(user["id"]))}


@router.put("/change-password")
async def change_password(body: ChangePwIn, user=Depends(auth.current_user)):
    if len(body.new_password or "") < 8:
        raise HTTPException(status_code=400, detail="Use at least 8 characters for your new password.")
    row = db.get_user_by_id(user["id"])
    if not auth.verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    db.update_user_password(user["id"], auth.hash_password(body.new_password))
    return {"message": "Password updated successfully."}

# ---------------------------------------------------------------------------
# Settings Routes
# ---------------------------------------------------------------------------
class SettingsUpdateIn(BaseModel):
    category: str
    data: dict

@router.get("/settings")
async def get_settings(user=Depends(auth.current_user)):
    row = db.get_user_settings(user["id"])
    if not row:
        # Fallback if somehow not initialized
        return {
            "appearance": {"theme": "system", "accentColor": "#3b82f6"},
            "dashboard": {"compactSidebar": False, "showWelcome": True, "showStreak": True, "defaultPage": "dashboard"},
            "notifications": {"email": True, "reminders": True, "dailyGoal": True},
            "ai_settings": {"model": "auto", "length": "medium", "difficulty": "intermediate"},
            "onboarding": None,
        }

    import json

    def _maybe(key):
        try:
            raw = row[key]
        except (IndexError, KeyError):
            return None
        return json.loads(raw) if raw else None

    return {
        "appearance": json.loads(row["appearance"]),
        "dashboard": json.loads(row["dashboard"]),
        "notifications": json.loads(row["notifications"]),
        "ai_settings": json.loads(row["ai_settings"]),
        "onboarding": _maybe("onboarding"),
    }

@router.put("/settings")
async def update_settings(body: SettingsUpdateIn, user=Depends(auth.current_user)):
    success = db.update_user_settings(user["id"], body.category, body.data)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update settings.")
    return {"message": "Settings updated successfully."}

@router.delete("/account")
async def delete_account(user=Depends(auth.current_user)):
    # Deleting an account removes its server-side account data.
    db.delete_user_account(user["id"])
    return {"message": "Account deleted successfully."}
