"""Credential storage, password hashing, session tokens and API key handling.

All state lives in the app_config table. Passwords are stored as self-describing scrypt
strings, session tokens are HMAC-signed and carry their own expiry, and rotating the
session secret invalidates every token issued before.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time

from .config_service import get_config, set_config

SESSION_COOKIE = "romarr_session"
REMEMBER_SECONDS = 30 * 24 * 60 * 60
SESSION_SECONDS = 12 * 60 * 60

AUTH_MODES = ("forms", "basic", "none")
AUTH_REQUIRED = ("enabled", "disabled_for_local")

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_SALT_BYTES = 16
_SCRYPT_KEY_BYTES = 32
_SCRYPT_MAXMEM = 64 * 1024 * 1024


# ── Password hashing ──────────────────────────────────────────────────────────


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int, length: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=n,
        r=r,
        p=p,
        dklen=length,
        maxmem=_SCRYPT_MAXMEM,
    )


def hash_password(password: str) -> str:
    """Return a self-describing string: scrypt$n$r$p$salt_hex$hash_hex."""
    salt = secrets.token_bytes(_SCRYPT_SALT_BYTES)
    digest = _scrypt(password, salt, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _SCRYPT_KEY_BYTES)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = bytes.fromhex(hash_hex)
        actual = _scrypt(password, bytes.fromhex(salt_hex), int(n), int(r), int(p), len(expected))
    except (ValueError, TypeError, MemoryError):
        return False
    return hmac.compare_digest(actual, expected)


# ── Configuration accessors ───────────────────────────────────────────────────


def get_auth_mode() -> str:
    value = get_config("auth_mode", "")
    return value if value in AUTH_MODES else "forms"


def get_auth_required() -> str:
    value = get_config("auth_required", "")
    return value if value in AUTH_REQUIRED else "enabled"


def get_username() -> str:
    return get_config("auth_username", "")


def setup_required() -> bool:
    return not get_config("auth_password_hash", "")


def set_credentials(username: str, password: str) -> None:
    """Store the username and a fresh password hash, invalidating existing sessions."""
    set_config("auth_username", username)
    set_config("auth_password_hash", hash_password(password))
    rotate_session_secret()


def check_credentials(username: str, password: str) -> bool:
    """Verify both fields on every call so the work done does not depend on the username."""
    stored = get_config("auth_password_hash", "")
    name_ok = hmac.compare_digest(username.encode("utf-8"), get_username().encode("utf-8"))
    pass_ok = bool(stored) and verify_password(password, stored)
    return name_ok and pass_ok


def reset_credentials() -> None:
    """Clear the username and password so the setup flow runs again; the API key is kept."""
    set_config("auth_username", "")
    set_config("auth_password_hash", "")
    rotate_session_secret()


# ── API key ───────────────────────────────────────────────────────────────────


def get_api_key() -> str:
    key = get_config("auth_api_key", "")
    if not key:
        key = secrets.token_hex(16)
        set_config("auth_api_key", key)
    return key


def reset_api_key() -> str:
    key = secrets.token_hex(16)
    set_config("auth_api_key", key)
    return key


def check_api_key(candidate: str) -> bool:
    if not candidate:
        return False
    return hmac.compare_digest(candidate.encode("utf-8"), get_api_key().encode("utf-8"))


# ── Session tokens ────────────────────────────────────────────────────────────


def _session_secret() -> bytes:
    secret = get_config("auth_session_secret", "")
    if not secret:
        secret = secrets.token_hex(32)
        set_config("auth_session_secret", secret)
    return secret.encode("utf-8")


def rotate_session_secret() -> None:
    set_config("auth_session_secret", secrets.token_hex(32))


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str) -> str:
    return hmac.new(_session_secret(), payload.encode("ascii"), hashlib.sha256).hexdigest()


def create_session_token(username: str, remember: bool) -> str:
    lifetime = REMEMBER_SECONDS if remember else SESSION_SECONDS
    body = json.dumps({"u": username, "e": int(time.time()) + lifetime}, separators=(",", ":"))
    payload = _b64(body.encode("utf-8"))
    return f"{payload}.{_sign(payload)}"


def verify_session_token(token: str) -> str | None:
    """Return the username a valid, unexpired token was issued for, otherwise None."""
    if not token or token.count(".") != 1:
        return None
    payload, signature = token.split(".")
    try:
        if not hmac.compare_digest(signature.encode("ascii"), _sign(payload).encode("ascii")):
            return None
        data = json.loads(_unb64(payload))
        username, expires = data["u"], data["e"]
    except (ValueError, KeyError, TypeError, binascii.Error, UnicodeError):
        return None
    if not isinstance(username, str) or not isinstance(expires, int) or expires < time.time():
        return None
    return username


def set_session_cookie(response, token: str, remember: bool, secure: bool) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=REMEMBER_SECONDS if remember else None,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax")


# ── HTTP Basic ────────────────────────────────────────────────────────────────


def check_basic(header_value: str) -> bool:
    """Verify an Authorization header of the form 'Basic base64(user:password)'."""
    scheme, _, encoded = (header_value or "").strip().partition(" ")
    if scheme.lower() != "basic" or not encoded.strip():
        return False
    try:
        decoded = base64.b64decode(encoded.strip(), validate=True).decode("utf-8")
    except (binascii.Error, ValueError):
        return False
    username, sep, password = decoded.partition(":")
    if not sep:
        return False
    return check_credentials(username, password)
