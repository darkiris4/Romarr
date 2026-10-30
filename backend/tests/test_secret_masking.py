"""API responses mask stored credentials and updates keep them unless replaced."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401 — registers all models
from app.api.v1 import connect, download_clients, indexers, list_sources
from app.database import Base, get_db
from app.models.connection import Connection
from app.models.download_client import DownloadClient
from app.models.indexer import Indexer
from app.models.list_source import ListSource
from app.services.secret_mask import MASK, mask_json_config, merge_json_config


@pytest.fixture()
def session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False)
    engine.dispose()


@pytest.fixture()
def db(session_factory):
    session = session_factory()
    yield session
    session.close()


@pytest.fixture()
def api(session_factory):
    app = FastAPI()
    app.include_router(download_clients.router, prefix="/downloadclients")
    app.include_router(indexers.router, prefix="/indexers")
    app.include_router(connect.router, prefix="/connect")
    app.include_router(list_sources.router, prefix="/lists")

    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


CLIENT = {
    "name": "qb",
    "implementation": "qbittorrent",
    "host": "localhost",
    "port": 8080,
    "username": "admin",
    "password": "pw-secret-1",
    "api_key": "key-secret-1",
}
INDEXER = {
    "name": "idx",
    "protocol": "torznab",
    "url": "http://idx.example/api",
    "api_key": "idx-secret-1",
}


def stored_client(db):
    db.expire_all()
    return db.query(DownloadClient).one()


def stored_indexer(db):
    db.expire_all()
    return db.query(Indexer).one()


# ── download clients ──────────────────────────────────────────────────────────


def test_client_responses_never_contain_secrets(api, db):
    created = api.post("/downloadclients", json=CLIENT)
    assert created.status_code == 201
    cid = created.json()["id"]
    for body in (created.text, api.get("/downloadclients").text):
        assert "pw-secret-1" not in body
        assert "key-secret-1" not in body
    data = api.get("/downloadclients").json()[0]
    assert data["password"] == MASK
    assert data["api_key"] == MASK
    assert data["has_password"] is True
    assert data["has_api_key"] is True
    assert stored_client(db).password == "pw-secret-1"
    assert api.put(f"/downloadclients/{cid}", json={"name": "x"}).json()["password"] == MASK


def test_client_empty_secrets_report_absent(api):
    api.post("/downloadclients", json={**CLIENT, "password": "", "api_key": ""})
    data = api.get("/downloadclients").json()[0]
    assert data["password"] == ""
    assert data["api_key"] == ""
    assert data["has_password"] is False
    assert data["has_api_key"] is False


def test_client_update_keeps_secret_for_mask_or_omitted(api, db):
    cid = api.post("/downloadclients", json=CLIENT).json()["id"]
    api.put(f"/downloadclients/{cid}", json={"name": "a", "password": MASK, "api_key": MASK})
    row = stored_client(db)
    assert (row.name, row.password, row.api_key) == ("a", "pw-secret-1", "key-secret-1")
    api.put(f"/downloadclients/{cid}", json={"name": "b"})
    row = stored_client(db)
    assert (row.name, row.password, row.api_key) == ("b", "pw-secret-1", "key-secret-1")


def test_client_update_replaces_secret(api, db):
    cid = api.post("/downloadclients", json=CLIENT).json()["id"]
    api.put(f"/downloadclients/{cid}", json={"password": "new-pw"})
    row = stored_client(db)
    assert (row.password, row.api_key) == ("new-pw", "key-secret-1")


def test_client_inline_test_fills_stored_secrets(api, monkeypatch):
    cid = api.post("/downloadclients", json=CLIENT).json()["id"]
    seen = []

    class Fake:
        async def test(self):
            return True, "ok"

    def fake_get_client(model):
        seen.append((model.password, model.api_key))
        return Fake()

    monkeypatch.setattr(download_clients, "get_client", fake_get_client)
    base = {"implementation": "qbittorrent", "host": "h", "port": 1}
    api.post("/downloadclients/test", json={**base, "id": cid})
    api.post("/downloadclients/test", json={**base, "id": cid, "password": MASK, "api_key": ""})
    api.post("/downloadclients/test", json={**base, "id": cid, "password": "typed"})
    api.post("/downloadclients/test", json={**base, "password": ""})
    assert seen == [
        ("pw-secret-1", "key-secret-1"),
        ("pw-secret-1", "key-secret-1"),
        ("typed", "key-secret-1"),
        ("", ""),
    ]


# ── indexers ──────────────────────────────────────────────────────────────────


def test_indexer_responses_never_contain_secret(api, db):
    created = api.post("/indexers", json=INDEXER)
    assert created.status_code == 201
    for body in (created.text, api.get("/indexers").text):
        assert "idx-secret-1" not in body
    data = api.get("/indexers").json()[0]
    assert data["api_key"] == MASK
    assert data["has_api_key"] is True
    assert stored_indexer(db).api_key == "idx-secret-1"


def test_indexer_empty_key_reports_absent(api):
    api.post("/indexers", json={**INDEXER, "api_key": ""})
    data = api.get("/indexers").json()[0]
    assert data["api_key"] == ""
    assert data["has_api_key"] is False


def test_indexer_update_keeps_or_replaces_secret(api, db):
    iid = api.post("/indexers", json=INDEXER).json()["id"]
    api.put(f"/indexers/{iid}", json={"name": "a", "api_key": MASK})
    assert stored_indexer(db).api_key == "idx-secret-1"
    api.put(f"/indexers/{iid}", json={"name": "b"})
    assert stored_indexer(db).api_key == "idx-secret-1"
    api.put(f"/indexers/{iid}", json={"api_key": "fresh"})
    assert stored_indexer(db).api_key == "fresh"


def test_indexer_inline_test_fills_stored_secret(api, monkeypatch):
    iid = api.post("/indexers", json=INDEXER).json()["id"]
    seen = []

    async def fake_test(indexer):
        seen.append(indexer.api_key)
        return True, "ok"

    monkeypatch.setattr(indexers, "test_indexer", fake_test)
    api.post("/indexers/test", json={"url": "u", "id": iid})
    api.post("/indexers/test", json={"url": "u", "id": iid, "api_key": MASK})
    api.post("/indexers/test", json={"url": "u", "id": iid, "api_key": "typed"})
    api.post("/indexers/test", json={"url": "u", "api_key": ""})
    assert seen == ["idx-secret-1", "idx-secret-1", "typed", ""]


# ── connections ───────────────────────────────────────────────────────────────


def test_connection_config_masked_and_preserved(api, db):
    payload = {
        "name": "tg",
        "type": "telegram",
        "config": {"token": "tg-secret-1", "chat_id": "42"},
    }
    created = api.post("/connect", json=payload)
    assert created.status_code == 201
    cid = created.json()["id"]
    for body in (created.text, api.get("/connect").text):
        assert "tg-secret-1" not in body
    assert api.get("/connect").json()[0]["config"] == {"token": MASK, "chat_id": "42"}

    api.put(
        f"/connect/{cid}",
        json={**payload, "config": {"token": MASK, "chat_id": "43"}},
    )
    db.expire_all()
    assert json.loads(db.query(Connection).one().config_json) == {
        "token": "tg-secret-1",
        "chat_id": "43",
    }

    api.put(f"/connect/{cid}", json={**payload, "config": {"token": "new", "chat_id": "43"}})
    db.expire_all()
    assert json.loads(db.query(Connection).one().config_json)["token"] == "new"


# ── list sources ──────────────────────────────────────────────────────────────


def test_list_source_config_masked_and_preserved(api, db):
    config = {"client_id": "cid", "client_secret": "ls-secret-1", "list": "x"}
    payload = {"name": "l", "plugin": "trakt", "config": json.dumps(config)}
    created = api.post("/lists", json=payload)
    assert created.status_code == 201
    sid = created.json()["id"]
    for body in (created.text, api.get("/lists").text):
        assert "ls-secret-1" not in body
    shown = json.loads(api.get("/lists").json()[0]["config"])
    assert shown == {"client_id": "cid", "client_secret": MASK, "list": "x"}

    api.put(f"/lists/{sid}", json={**payload, "config": json.dumps({**shown, "list": "y"})})
    db.expire_all()
    assert json.loads(db.query(ListSource).one().config) == {**config, "list": "y"}

    api.put(
        f"/lists/{sid}",
        json={**payload, "config": json.dumps({**shown, "client_secret": "new"})},
    )
    db.expire_all()
    assert json.loads(db.query(ListSource).one().config)["client_secret"] == "new"


def test_list_source_sync_error_is_redacted(api, monkeypatch):
    sid = api.post("/lists", json={"name": "l", "plugin": "p"}).json()["id"]

    async def boom(db, source):
        raise RuntimeError("failed: https://x/api?client_secret=leakedvalue1")

    monkeypatch.setattr("app.services.list_service.sync_list_source", boom)
    response = api.post(f"/lists/{sid}/sync")
    assert response.status_code == 500
    assert "leakedvalue1" not in response.text


def test_json_config_helpers():
    raw = json.dumps({"token": "t", "api_key": "", "other": "o", "n": 1})
    assert json.loads(mask_json_config(raw)) == {
        "token": MASK,
        "api_key": "",
        "other": "o",
        "n": 1,
    }
    assert mask_json_config("not json") == "not json"
    assert mask_json_config("[1]") == "[1]"
    merged = merge_json_config(json.dumps({"token": MASK, "secret": MASK}), '{"token": "t"}')
    assert json.loads(merged) == {"token": "t"}
    assert merge_json_config("not json", "{}") == "not json"
    assert json.loads(merge_json_config('{"password": "p"}', "garbage")) == {"password": "p"}
