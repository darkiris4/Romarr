import re

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app import main
from app.services import auth_middleware, auth_service

SESSION_TOKEN = "fake-session-token"
API_KEY = "fake-api-key"
BASIC = "Basic ZmFrZTpmYWtl"
LOCAL = ("192.168.1.20", 50000)
REMOTE = ("8.8.4.4", 50000)


@pytest.fixture
def conf(monkeypatch):
    state = {"mode": "forms", "required": "enabled", "proxies": ""}
    monkeypatch.setattr(auth_service, "get_auth_mode", lambda: state["mode"])
    monkeypatch.setattr(auth_service, "get_auth_required", lambda: state["required"])
    monkeypatch.setattr(auth_service, "get_username", lambda: "fake")
    monkeypatch.setattr(
        auth_service, "verify_session_token", lambda t: "fake" if t == SESSION_TOKEN else None
    )
    monkeypatch.setattr(auth_service, "check_api_key", lambda c: c == API_KEY)
    monkeypatch.setattr(auth_service, "check_basic", lambda h: h == BASIC)
    monkeypatch.setattr(auth_middleware, "get_config", lambda key, default="": state["proxies"])
    return state


def make_app():
    app = FastAPI()

    @app.get("/api/v1/thing")
    def thing_get(request: Request):
        return {
            "user": request.state.auth_user,
            "authenticated": auth_middleware.request_is_authenticated(request),
        }

    @app.post("/api/v1/thing")
    def thing_post():
        return {"ok": True}

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/v1/auth/status")
    def status(request: Request):
        return {"authenticated": auth_middleware.request_is_authenticated(request)}

    @app.post("/api/v1/auth/login")
    def login():
        return {"ok": True}

    @app.post("/api/v1/auth/setup")
    def setup():
        return {"ok": True}

    @app.get("/api/v1/auth/settings")
    def settings():
        return {"ok": True}

    @app.get("/elsewhere")
    def elsewhere():
        return {"ok": True}

    auth_middleware.add_authentication(app, "/api/v1")
    main.add_security_headers(app, "/api/v1")
    return app


def client_for(addr=REMOTE):
    return TestClient(make_app(), client=addr)


def cookie(client):
    client.cookies.set(auth_service.SESSION_COOKIE, SESSION_TOKEN)
    return client


def test_mode_none_allows_everything(conf):
    conf["mode"] = "none"
    response = client_for().get("/api/v1/thing")
    assert response.status_code == 200
    assert response.json() == {"user": None, "authenticated": True}
    assert client_for().post("/api/v1/thing").status_code == 200


def test_forms_without_credentials_is_401_without_challenge(conf):
    response = client_for().get("/api/v1/thing")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required"}
    assert "www-authenticate" not in response.headers


def test_rejection_carries_security_headers(conf):
    response = client_for().get("/api/v1/thing")
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"


def test_forms_valid_session_allows_and_sets_state(conf):
    response = cookie(client_for()).get("/api/v1/thing")
    assert response.json() == {"user": "fake", "authenticated": True}


def test_forms_invalid_session_rejected(conf):
    client = client_for()
    client.cookies.set(auth_service.SESSION_COOKIE, "tampered")
    assert client.get("/api/v1/thing").status_code == 401


def test_forms_ignores_basic_header(conf):
    response = client_for().get("/api/v1/thing", headers={"Authorization": BASIC})
    assert response.status_code == 401


def test_basic_challenge(conf):
    conf["mode"] = "basic"
    response = client_for().get("/api/v1/thing")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Basic realm="Romarr"'


def test_basic_valid_header_allows(conf):
    conf["mode"] = "basic"
    response = client_for().get("/api/v1/thing", headers={"Authorization": BASIC})
    assert response.status_code == 200
    assert response.json()["user"] == "fake"


def test_basic_wrong_header_and_session_cookie_rejected(conf):
    conf["mode"] = "basic"
    assert (
        client_for().get("/api/v1/thing", headers={"Authorization": "Basic bad"}).status_code == 401
    )
    assert cookie(client_for()).get("/api/v1/thing").status_code == 401


@pytest.mark.parametrize("mode", ["forms", "basic"])
def test_api_key_header_and_query(conf, mode):
    conf["mode"] = mode
    client = client_for()
    assert client.get("/api/v1/thing", headers={"X-Api-Key": API_KEY}).status_code == 200
    assert client.get("/api/v1/thing", params={"apikey": API_KEY}).status_code == 200
    assert client.get("/api/v1/thing", headers={"X-Api-Key": "wrong"}).status_code == 401
    assert client.get("/api/v1/thing", params={"apikey": "wrong"}).status_code == 401


def test_api_key_skips_csrf(conf):
    response = client_for().post("/api/v1/thing", headers={"X-Api-Key": API_KEY})
    assert response.status_code == 200


def test_local_bypass_for_private_and_loopback(conf):
    conf["required"] = "disabled_for_local"
    for addr in [LOCAL, ("127.0.0.1", 1), ("::1", 1), ("10.0.0.5", 1)]:
        response = client_for(addr).get("/api/v1/thing")
        assert response.status_code == 200
        assert response.json() == {"user": None, "authenticated": True}


def test_local_bypass_not_applied_to_public_address(conf):
    conf["required"] = "disabled_for_local"
    assert client_for(REMOTE).get("/api/v1/thing").status_code == 401


def test_local_bypass_off_when_required_enabled(conf):
    assert client_for(LOCAL).get("/api/v1/thing").status_code == 401


def test_spoofed_forwarded_for_ignored_without_trusted_proxies(conf):
    conf["required"] = "disabled_for_local"
    response = client_for(REMOTE).get("/api/v1/thing", headers={"X-Forwarded-For": "192.168.1.5"})
    assert response.status_code == 401


def test_spoofed_forwarded_for_ignored_from_untrusted_peer(conf):
    conf["required"] = "disabled_for_local"
    conf["proxies"] = "10.0.0.1"
    response = client_for(REMOTE).get("/api/v1/thing", headers={"X-Forwarded-For": "192.168.1.5"})
    assert response.status_code == 401


def test_forwarded_for_used_from_trusted_proxy(conf):
    conf["required"] = "disabled_for_local"
    conf["proxies"] = "10.0.0.0/24"
    proxy = ("10.0.0.1", 1)
    ok = client_for(proxy).get("/api/v1/thing", headers={"X-Forwarded-For": "192.168.1.5"})
    assert ok.status_code == 200
    remote = client_for(proxy).get("/api/v1/thing", headers={"X-Forwarded-For": "8.8.8.8"})
    assert remote.status_code == 401


def test_forwarded_for_chain_skips_trusted_hops_and_ignores_spoofed_left(conf):
    conf["required"] = "disabled_for_local"
    conf["proxies"] = "10.0.0.1, 10.0.0.2"
    proxy = ("10.0.0.1", 1)
    chain = "192.168.1.5, 8.8.8.8, 10.0.0.2"
    assert (
        client_for(proxy).get("/api/v1/thing", headers={"X-Forwarded-For": chain}).status_code
        == 401
    )


def test_proxy_without_forwarded_header_uses_peer(conf):
    conf["required"] = "disabled_for_local"
    conf["proxies"] = "10.0.0.1"
    assert client_for(("10.0.0.1", 1)).get("/api/v1/thing").status_code == 200


def test_invalid_forwarded_address_does_not_bypass(conf):
    conf["required"] = "disabled_for_local"
    conf["proxies"] = "10.0.0.1"
    response = client_for(("10.0.0.1", 1)).get(
        "/api/v1/thing", headers={"X-Forwarded-For": "nonsense"}
    )
    assert response.status_code == 401


def test_invalid_proxy_entries_are_ignored(conf):
    conf["required"] = "disabled_for_local"
    conf["proxies"] = "not-an-ip, 10.0.0.1"
    assert client_for(REMOTE).get("/api/v1/thing").status_code == 401


def test_decision_order_none_beats_everything(conf):
    conf["mode"] = "none"
    conf["required"] = "enabled"
    assert client_for(REMOTE).get("/api/v1/thing").status_code == 200


def test_decision_order_local_before_basic_challenge(conf):
    conf["mode"] = "basic"
    conf["required"] = "disabled_for_local"
    assert client_for(LOCAL).get("/api/v1/thing").status_code == 200
    assert client_for(REMOTE).get("/api/v1/thing").status_code == 401


def test_csrf_safe_methods_need_no_origin(conf):
    assert cookie(client_for()).get("/api/v1/thing").status_code == 200


def test_csrf_missing_origin_and_referer_rejected(conf):
    response = cookie(client_for()).post("/api/v1/thing")
    assert response.status_code == 403
    assert response.json() == {"detail": "Cross-origin request rejected"}


def test_csrf_matching_origin_accepted(conf):
    headers = {"Origin": "http://testserver"}
    assert cookie(client_for()).post("/api/v1/thing", headers=headers).status_code == 200


def test_csrf_mismatched_origin_rejected(conf):
    headers = {"Origin": "http://evil.example"}
    assert cookie(client_for()).post("/api/v1/thing", headers=headers).status_code == 403


def test_csrf_origin_port_must_match(conf):
    headers = {"Origin": "http://testserver:8000"}
    assert cookie(client_for()).post("/api/v1/thing", headers=headers).status_code == 403


def test_csrf_referer_used_when_origin_absent(conf):
    ok = cookie(client_for()).post("/api/v1/thing", headers={"Referer": "http://testserver/page"})
    assert ok.status_code == 200
    bad = cookie(client_for()).post("/api/v1/thing", headers={"Referer": "http://evil.example/x"})
    assert bad.status_code == 403


def test_csrf_origin_takes_precedence_over_referer(conf):
    headers = {"Origin": "http://evil.example", "Referer": "http://testserver/page"}
    assert cookie(client_for()).post("/api/v1/thing", headers=headers).status_code == 403


def test_csrf_forwarded_host_honoured_only_from_trusted_proxy(conf):
    headers = {"Origin": "https://romarr.example", "X-Forwarded-Host": "romarr.example"}
    assert cookie(client_for(REMOTE)).post("/api/v1/thing", headers=headers).status_code == 403
    conf["proxies"] = "10.0.0.1"
    assert (
        cookie(client_for(("10.0.0.1", 1))).post("/api/v1/thing", headers=headers).status_code
        == 200
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/health"),
        ("GET", "/api/v1/auth/status"),
        ("POST", "/api/v1/auth/login"),
        ("POST", "/api/v1/auth/setup"),
    ],
)
def test_public_paths(conf, method, path):
    assert client_for().request(method, path).status_code == 200


def test_status_reports_authentication_state(conf):
    assert client_for().get("/api/v1/auth/status").json() == {"authenticated": False}
    assert cookie(client_for()).get("/api/v1/auth/status").json() == {"authenticated": True}


def test_public_login_ignores_cross_origin_check(conf):
    response = cookie(client_for()).post(
        "/api/v1/auth/login", headers={"Origin": "http://evil.example"}
    )
    assert response.status_code == 200


def test_protected_auth_endpoint_requires_credentials(conf):
    assert client_for().get("/api/v1/auth/settings").status_code == 401


def test_options_is_public(conf):
    assert client_for().options("/api/v1/thing").status_code != 401


def test_paths_outside_api_prefix_stay_public(conf):
    assert client_for().get("/elsewhere").status_code == 200


def test_spa_and_assets_stay_public(conf, tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("INDEX")
    (dist / "assets" / "app.js").write_text("ASSET")
    app = make_app()
    main.register_spa(app, dist)
    client = TestClient(app, client=REMOTE)
    assert client.get("/assets/app.js").text == "ASSET"
    assert client.get("/login").text == "INDEX"
    assert client.get("/").text == "INDEX"


def test_setup_required_still_rejects_protected_routes(conf, monkeypatch):
    monkeypatch.setattr(auth_service, "setup_required", lambda: True)
    assert client_for().get("/api/v1/thing").status_code == 401


def test_request_is_authenticated_defaults_false():
    class Bare:
        state = type("S", (), {})()

    assert auth_middleware.request_is_authenticated(Bare()) is False


# Full application ---------------------------------------------------------------------

PUBLIC = {
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/auth/status"),
    ("POST", "/api/v1/auth/setup"),
    ("POST", "/api/v1/auth/login"),
}


def _api_routes():
    """Every (method, path) the application documents under the API prefix."""
    http_methods = {"get", "put", "post", "delete", "patch"}
    for path, operations in main.app.openapi()["paths"].items():
        if path.startswith("/api/v1/"):
            for method in sorted(operations.keys() & http_methods):
                yield method.upper(), path


def test_app_registers_api_routes():
    routes = list(_api_routes())
    assert len(routes) > 20
    assert ("GET", "/api/v1/games") in routes


def test_every_protected_route_rejects_anonymous_requests(conf):
    client = TestClient(main.app, client=REMOTE)
    checked = 0
    for method, path in _api_routes():
        if (method, path) in PUBLIC:
            continue
        url = re.sub(r"\{[^}]+\}", "1", path)
        response = client.request(method, url)
        assert response.status_code == 401, f"{method} {path} returned {response.status_code}"
        checked += 1
    assert checked > 20


def test_every_protected_route_rejects_anonymous_in_basic_mode(conf):
    conf["mode"] = "basic"
    client = TestClient(main.app, client=REMOTE)
    for method, path in _api_routes():
        if (method, path) in PUBLIC:
            continue
        response = client.request(method, re.sub(r"\{[^}]+\}", "1", path))
        assert response.status_code == 401, f"{method} {path}"
        assert response.headers["www-authenticate"] == 'Basic realm="Romarr"'


def test_health_reports_ok_without_credentials(conf):
    response = TestClient(main.app, client=REMOTE).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["cache-control"] == "no-store"


def test_health_reports_error_when_database_unavailable(conf, monkeypatch):
    class Broken:
        def connect(self):
            raise RuntimeError("database offline")

    monkeypatch.setattr(main, "engine", Broken())
    response = TestClient(main.app, client=REMOTE).get("/api/v1/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error"}
