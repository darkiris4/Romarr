import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import main
from app.services.redact import RedactingFilter


@pytest.fixture
def dist(tmp_path):
    root = tmp_path / "site" / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("INDEX")
    (root / "assets" / "app.js").write_text("ASSET")
    (root / "favicon.ico").write_text("ICON")
    (tmp_path / "site" / "secret.txt").write_text("SECRET")
    (root / "link.txt").symlink_to(tmp_path / "site" / "secret.txt")
    return root


def make_app(dist, origins=""):
    app = FastAPI()

    @app.get("/api/v1/ping")
    def ping():
        return {"ok": True}

    main.configure_cors(app, main.parse_origins(origins))
    main.add_security_headers(app, "/api/v1")
    main.register_spa(app, dist)
    return app


@pytest.fixture
def client(dist):
    return TestClient(make_app(dist))


def test_serves_asset_and_root_file(client):
    assert client.get("/assets/app.js").text == "ASSET"
    assert client.get("/favicon.ico").text == "ICON"


def test_unknown_route_falls_back_to_index(client):
    assert client.get("/library/games/3").text == "INDEX"


@pytest.mark.parametrize(
    "path",
    [
        "/../secret.txt",
        "/%2e%2e/secret.txt",
        "/%2e%2e%2fsecret.txt",
        "/assets/../../secret.txt",
        "//etc/hostname",
        "/%2fetc/hostname",
        "/link.txt",
    ],
)
def test_traversal_never_leaks(client, path):
    response = client.get(path)
    assert "SECRET" not in response.text
    assert response.text == "INDEX"


def test_api_paths_unaffected(client):
    assert client.get("/api/v1/ping").json() == {"ok": True}


def test_no_cors_headers_by_default(client):
    response = client.get("/api/v1/ping", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-credentials" not in response.headers


def test_cors_allows_only_listed_origins(dist):
    client = TestClient(make_app(dist, "https://a.example, https://b.example/"))
    ok = client.get("/api/v1/ping", headers={"Origin": "https://b.example"})
    assert ok.headers["access-control-allow-origin"] == "https://b.example"
    assert "access-control-allow-credentials" not in ok.headers
    other = client.get("/api/v1/ping", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers


def test_settings_reads_allowed_origins(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.example")
    assert Settings().allowed_origins == "https://a.example"
    assert Settings.model_fields["allowed_origins"].default == ""


@pytest.mark.parametrize("path", ["/api/v1/ping", "/", "/assets/app.js"])
def test_security_headers_everywhere(client, path):
    headers = client.get(path).headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "same-origin"
    assert headers["x-frame-options"] == "DENY"
    assert headers["content-security-policy"] == "frame-ancestors 'none'"


def test_no_store_only_on_api(client):
    assert client.get("/api/v1/ping").headers["cache-control"] == "no-store"
    assert client.get("/assets/app.js").headers.get("cache-control") != "no-store"
    assert client.get("/").headers.get("cache-control") != "no-store"


def test_console_handler_redacts():
    assert any(isinstance(f, RedactingFilter) for f in main._console.filters)
    record = logging.LogRecord("x", logging.INFO, "f", 1, "GET /x?api_key=abc123", None, None)
    main._console.filter(record)
    assert "abc123" not in main._console.format(record)
