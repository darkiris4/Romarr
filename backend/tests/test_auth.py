"""Authentication service and /auth endpoints against a temporary database."""

import base64
import time

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import database as database_module
from app.api.v1 import auth as auth_api
from app.models.app_event import AppEvent
from app.services import auth_service, config_service, event_service

PASSWORD = "fake-password-1"
NEW_PASSWORD = "fake-password-2"


@pytest.fixture
def session_local(monkeypatch):
    from app.database import Base

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(database_module, "SessionLocal", factory)
    monkeypatch.setattr(config_service, "SessionLocal", factory)
    yield factory
    engine.dispose()


@pytest.fixture
def client(session_local):
    """Test app whose request state reads authentication from a session cookie or header."""
    app = FastAPI()
    app.include_router(auth_api.router, prefix="/auth")

    @app.middleware("http")
    async def stub_authentication(request: Request, call_next):
        user = auth_service.verify_session_token(
            request.cookies.get(auth_service.SESSION_COOKIE, "")
        )
        request.state.authenticated = user is not None or "x-test-auth" in request.headers
        request.state.auth_user = user
        return await call_next(request)

    return TestClient(app)


def _setup(client, username="admin", password=PASSWORD):
    return client.post("/auth/setup", json={"username": username, "password": password})


def _events(session_local) -> list[str]:
    with session_local() as db:
        return [e.message for e in db.query(AppEvent).all()]


# ── Hashing ───────────────────────────────────────────────────────────────────


def test_hash_is_self_describing_and_salted():
    first = auth_service.hash_password(PASSWORD)
    second = auth_service.hash_password(PASSWORD)
    scheme, n, r, p, salt, digest = first.split("$")
    assert (scheme, n, r, p) == ("scrypt", "16384", "8", "1")
    assert len(bytes.fromhex(salt)) == 16
    assert PASSWORD not in first
    assert first != second


def test_verify_password():
    stored = auth_service.hash_password(PASSWORD)
    assert auth_service.verify_password(PASSWORD, stored)
    assert not auth_service.verify_password("wrong-password", stored)


@pytest.mark.parametrize(
    "stored", ["", "garbage", "scrypt$1$2$3$zz$zz", "bcrypt$16384$8$1$00$00", "scrypt$a$b$c$00$00"]
)
def test_verify_password_rejects_malformed_hash(stored):
    assert not auth_service.verify_password(PASSWORD, stored)


# ── Session tokens ────────────────────────────────────────────────────────────


def test_session_token_round_trip(session_local):
    token = auth_service.create_session_token("admin", False)
    assert auth_service.verify_session_token(token) == "admin"


def test_session_token_with_separator_in_username(session_local):
    token = auth_service.create_session_token("a|b.c", True)
    assert auth_service.verify_session_token(token) == "a|b.c"


@pytest.mark.parametrize("token", ["", "abc", "a.b.c", ".", "!!!.???"])
def test_session_token_rejects_garbage(session_local, token):
    assert auth_service.verify_session_token(token) is None


def test_session_token_tampered(session_local):
    token = auth_service.create_session_token("admin", False)
    payload, signature = token.split(".")
    forged = auth_service._b64(b'{"u":"root","e":99999999999}')
    assert auth_service.verify_session_token(f"{forged}.{signature}") is None
    assert auth_service.verify_session_token(f"{payload}.{'0' * len(signature)}") is None


def test_session_token_expires(session_local, monkeypatch):
    token = auth_service.create_session_token("admin", False)
    real = time.time()
    monkeypatch.setattr(auth_service.time, "time", lambda: real + auth_service.SESSION_SECONDS + 5)
    assert auth_service.verify_session_token(token) is None


def test_remember_extends_expiry(session_local, monkeypatch):
    short = auth_service.create_session_token("admin", False)
    long = auth_service.create_session_token("admin", True)
    real = time.time()
    monkeypatch.setattr(auth_service.time, "time", lambda: real + auth_service.SESSION_SECONDS + 5)
    assert auth_service.verify_session_token(short) is None
    assert auth_service.verify_session_token(long) == "admin"


def test_rotating_secret_invalidates_tokens(session_local):
    token = auth_service.create_session_token("admin", True)
    auth_service.rotate_session_secret()
    assert auth_service.verify_session_token(token) is None


def test_cookie_attributes(session_local):
    from fastapi import Response

    response = Response()
    auth_service.set_session_cookie(response, "tok", True, True)
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header and "path=/" in header
    assert "secure" in header and "max-age=2592000" in header

    response = Response()
    auth_service.set_session_cookie(response, "tok", False, False)
    header = response.headers["set-cookie"].lower()
    assert "max-age" not in header and "secure" not in header


# ── API key ───────────────────────────────────────────────────────────────────


def test_api_key_generated_once_and_checked(session_local):
    key = auth_service.get_api_key()
    assert len(key) == 32
    assert auth_service.get_api_key() == key
    assert auth_service.check_api_key(key)
    assert not auth_service.check_api_key("")
    assert not auth_service.check_api_key("0" * 32)


def test_api_key_reset(session_local):
    old = auth_service.get_api_key()
    new = auth_service.reset_api_key()
    assert new != old
    assert auth_service.check_api_key(new)
    assert not auth_service.check_api_key(old)


# ── Basic header parsing ──────────────────────────────────────────────────────


def _basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


def test_check_basic(session_local):
    auth_service.set_credentials("admin", PASSWORD)
    assert auth_service.check_basic(_basic("admin", PASSWORD))
    assert auth_service.check_basic(_basic("admin", PASSWORD).replace("Basic", "basic"))
    assert not auth_service.check_basic(_basic("admin", "wrong-password"))
    assert not auth_service.check_basic(_basic("other", PASSWORD))
    assert not auth_service.check_basic("Bearer abc")
    assert not auth_service.check_basic("Basic")
    assert not auth_service.check_basic("Basic !!!not-base64")
    assert not auth_service.check_basic("Basic " + base64.b64encode(b"nocolon").decode())
    assert not auth_service.check_basic("")


def test_check_basic_password_may_contain_colon(session_local):
    auth_service.set_credentials("admin", "fake:pass:word")
    assert auth_service.check_basic(_basic("admin", "fake:pass:word"))


def test_check_basic_without_credentials(session_local):
    assert not auth_service.check_basic(_basic("", ""))


# ── Defaults and reset ────────────────────────────────────────────────────────


def test_defaults(session_local):
    assert auth_service.get_auth_mode() == "forms"
    assert auth_service.get_auth_required() == "enabled"
    assert auth_service.get_username() == ""
    assert auth_service.setup_required()


def test_invalid_stored_mode_falls_back(session_local):
    config_service.set_config("auth_mode", "bogus")
    config_service.set_config("auth_required", "bogus")
    assert auth_service.get_auth_mode() == "forms"
    assert auth_service.get_auth_required() == "enabled"


def test_reset_credentials(session_local):
    auth_service.set_credentials("admin", PASSWORD)
    key = auth_service.get_api_key()
    token = auth_service.create_session_token("admin", True)
    auth_service.reset_credentials()
    assert auth_service.setup_required()
    assert auth_service.get_username() == ""
    assert auth_service.get_api_key() == key
    assert auth_service.verify_session_token(token) is None
    assert not auth_service.check_credentials("", "")


# ── /auth/status and /auth/setup ──────────────────────────────────────────────


def test_status_before_setup(client):
    body = client.get("/auth/status").json()
    assert body == {
        "setup_required": True,
        "authenticated": False,
        "mode": "forms",
        "username": None,
    }


def test_setup_creates_account_and_session(client):
    response = _setup(client)
    assert response.status_code == 200
    assert response.json() == {
        "setup_required": False,
        "authenticated": True,
        "mode": "forms",
        "username": "admin",
    }
    assert auth_service.SESSION_COOKIE in response.cookies
    assert client.get("/auth/status").json()["authenticated"] is True


def test_setup_conflict_once_configured(client):
    assert _setup(client).status_code == 200
    assert _setup(client, "other", NEW_PASSWORD).status_code == 409
    assert auth_service.get_username() == "admin"


@pytest.mark.parametrize(
    "username,password",
    [("", PASSWORD), ("   ", PASSWORD), ("x" * 65, PASSWORD), ("admin", "short")],
)
def test_setup_validation(client, username, password):
    assert _setup(client, username, password).status_code == 422
    assert auth_service.setup_required()


def test_setup_is_logged_without_password(client, session_local):
    _setup(client)
    messages = _events(session_local)
    assert any("admin" in m for m in messages)
    assert not any(PASSWORD in m for m in messages)


# ── /auth/login and /auth/logout ──────────────────────────────────────────────


def test_login_success(client):
    _setup(client)
    client.cookies.clear()
    response = client.post(
        "/auth/login", json={"username": "admin", "password": PASSWORD, "remember": True}
    )
    assert response.status_code == 200
    assert response.json()["authenticated"] is True
    assert "max-age=2592000" in response.headers["set-cookie"].lower()


def test_login_session_cookie_without_remember(client):
    _setup(client)
    response = client.post(
        "/auth/login", json={"username": "admin", "password": PASSWORD, "remember": False}
    )
    assert "max-age" not in response.headers["set-cookie"].lower()


def test_login_failures_share_message(client, session_local):
    _setup(client)
    client.cookies.clear()
    wrong = client.post("/auth/login", json={"username": "admin", "password": "wrong-password"})
    unknown = client.post("/auth/login", json={"username": "nobody", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Invalid username or password"}
    assert auth_service.SESSION_COOKIE not in wrong.cookies
    messages = _events(session_local)
    assert any("Failed login" in m and "nobody" in m for m in messages)
    assert not any("wrong-password" in m or PASSWORD in m for m in messages)


def test_login_before_setup_fails(client):
    response = client.post("/auth/login", json={"username": "", "password": ""})
    assert response.status_code == 401


def test_logout_clears_cookie(client):
    _setup(client)
    response = client.post("/auth/logout")
    assert response.status_code == 204
    header = response.headers["set-cookie"].lower()
    assert auth_service.SESSION_COOKIE in header
    assert "max-age=0" in header or "expires=" in header


# ── /auth/settings ────────────────────────────────────────────────────────────

AUTH = {"X-Test-Auth": "1"}


def _settings_body(**overrides):
    body = {"mode": "forms", "required": "enabled", "username": "admin", "trusted_proxies": ""}
    body.update(overrides)
    return body


def test_settings_require_authentication(client):
    _setup(client)
    client.cookies.clear()
    assert client.get("/auth/settings").status_code == 401
    assert client.put("/auth/settings", json=_settings_body()).status_code == 401
    assert (
        client.post(
            "/auth/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}
        ).status_code
        == 401
    )
    assert client.post("/auth/apikey/reset").status_code == 401


def test_get_settings(client):
    _setup(client)
    body = client.get("/auth/settings").json()
    assert set(body) == {"mode", "required", "username", "api_key", "trusted_proxies"}
    assert body["mode"] == "forms" and body["required"] == "enabled"
    assert body["username"] == "admin" and body["trusted_proxies"] == ""
    assert body["api_key"] == auth_service.get_api_key()


def test_update_settings(client, session_local):
    _setup(client)
    response = client.put(
        "/auth/settings",
        json=_settings_body(
            mode="basic",
            required="disabled_for_local",
            username="root",
            trusted_proxies=" 10.0.0.1, 192.168.0.0/24 ,,::1",
        ),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "basic" and body["required"] == "disabled_for_local"
    assert body["username"] == "root"
    assert body["trusted_proxies"] == "10.0.0.1,192.168.0.0/24,::1"
    assert auth_service.get_auth_mode() == "basic"
    assert auth_service.get_username() == "root"
    assert any("Settings changed" in m for m in _events(session_local))


@pytest.mark.parametrize("field,value", [("mode", "bogus"), ("required", "never")])
def test_update_settings_rejects_bad_enums(client, field, value):
    _setup(client)
    assert client.put("/auth/settings", json=_settings_body(**{field: value})).status_code == 422


@pytest.mark.parametrize("proxies", ["not-an-ip", "10.0.0.1,999.1.1.1", "10.0.0.0/99"])
def test_update_settings_rejects_bad_proxies(client, proxies):
    _setup(client)
    response = client.put("/auth/settings", json=_settings_body(trusted_proxies=proxies))
    assert response.status_code == 422
    assert config_service.get_config("auth_trusted_proxies", "") == ""


def test_update_settings_rejects_empty_username(client):
    _setup(client)
    assert client.put("/auth/settings", json=_settings_body(username=" ")).status_code == 422
    assert auth_service.get_username() == "admin"


@pytest.mark.parametrize("mode", ["forms", "basic"])
def test_settings_refuse_protection_without_credentials(client, mode):
    response = client.put("/auth/settings", json=_settings_body(mode=mode), headers=AUTH)
    assert response.status_code == 400
    assert config_service.get_config("auth_mode", "") == ""


def test_settings_allow_none_without_credentials(client):
    response = client.put("/auth/settings", json=_settings_body(mode="none"), headers=AUTH)
    assert response.status_code == 200
    assert auth_service.get_auth_mode() == "none"
    assert auth_service.setup_required()


# ── /auth/password ────────────────────────────────────────────────────────────


def test_password_change_rotates_sessions(client, session_local):
    _setup(client)
    old_token = client.cookies[auth_service.SESSION_COOKIE]
    response = client.post(
        "/auth/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 204
    new_token = response.cookies[auth_service.SESSION_COOKIE]
    assert new_token != old_token
    assert auth_service.verify_session_token(old_token) is None
    assert auth_service.verify_session_token(new_token) == "admin"
    assert auth_service.check_credentials("admin", NEW_PASSWORD)
    assert not auth_service.check_credentials("admin", PASSWORD)
    messages = _events(session_local)
    assert "Password changed" in messages
    assert not any(NEW_PASSWORD in m for m in messages)


def test_password_change_wrong_current(client):
    _setup(client)
    response = client.post(
        "/auth/password", json={"current_password": "wrong-password", "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 400
    assert auth_service.check_credentials("admin", PASSWORD)


def test_password_change_validates_new_password(client):
    _setup(client)
    response = client.post(
        "/auth/password", json={"current_password": PASSWORD, "new_password": "short"}
    )
    assert response.status_code == 422


# ── /auth/apikey/reset ────────────────────────────────────────────────────────


def test_api_key_reset_endpoint(client, session_local):
    _setup(client)
    old = auth_service.get_api_key()
    response = client.post("/auth/apikey/reset")
    assert response.status_code == 200
    new = response.json()["api_key"]
    assert new != old and auth_service.check_api_key(new)
    messages = _events(session_local)
    assert "API key reset" in messages
    assert not any(new in m or old in m for m in messages)


def test_event_service_is_shared(session_local):
    event_service.log_event("Authentication", "probe")
    assert "probe" in _events(session_local)
