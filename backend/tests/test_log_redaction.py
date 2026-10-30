"""Credentials must not reach logs, stored events or returned error text."""

import asyncio
import logging
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.app_event import AppEvent
from app.models.download_client import DownloadClient
from app.models.indexer import Indexer, IndexerProtocol
from app.services import (
    download_service,
    event_service,
    igdb_service,
    indexer_service,
    log_service,
    notification_service,
    rawg_service,
)
from app.services.redact import RedactingFilter

SECRET = "s3cr3tvalue99"
real_client = httpx.Client


def _app_log(caplog) -> str:
    """Text of records emitted by the application's own loggers (not httpx internals)."""
    return "\n".join(r.getMessage() for r in caplog.records if r.name.startswith("app."))


def _route_httpx(monkeypatch, module, handler):
    """Make every httpx client created by ``module`` use a mock transport."""
    transport = httpx.MockTransport(handler)
    real_async = httpx.AsyncClient

    def client(*args, **kwargs):
        return real_client(*args, transport=transport, **kwargs)

    def async_client(*args, **kwargs):
        return real_async(*args, transport=transport, **kwargs)

    monkeypatch.setattr(module.httpx, "Client", client)
    monkeypatch.setattr(module.httpx, "AsyncClient", async_client)


def test_igdb_auth_sends_credentials_in_body_and_logs_clean(monkeypatch, caplog):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["query"] = request.url.query.decode()
        seen["body"] = request.content.decode()
        return httpx.Response(403, request=request)

    monkeypatch.setattr(igdb_service, "_credentials", lambda: ("cid", SECRET))
    monkeypatch.setitem(igdb_service._token_cache, "token", None)
    transport = httpx.MockTransport(handler)
    real_post = httpx.post

    def post(url, **kwargs):
        with real_client(transport=transport) as client:
            return client.post(url, **kwargs)

    monkeypatch.setattr(igdb_service.httpx, "post", post)
    with caplog.at_level(logging.DEBUG):
        ok, message = igdb_service.test_credentials()
    monkeypatch.setattr(igdb_service.httpx, "post", real_post)

    assert not ok
    assert seen["query"] == ""
    assert f"client_secret={SECRET}" in seen["body"]
    assert SECRET not in _app_log(caplog)
    assert SECRET not in message
    assert "IGDB auth failed" in _app_log(caplog)


def test_rawg_errors_are_redacted(monkeypatch, caplog):
    monkeypatch.setattr(rawg_service, "_api_key", lambda: SECRET)
    _route_httpx(monkeypatch, rawg_service, lambda r: httpx.Response(500, request=r))
    # httpx.get is module level; route it through a mock client as well
    transport = httpx.MockTransport(lambda r: httpx.Response(500, request=r))

    def get(url, **kwargs):
        with real_client(transport=transport) as client:
            return client.get(url, **kwargs)

    monkeypatch.setattr(rawg_service.httpx, "get", get)
    with caplog.at_level(logging.DEBUG):
        ok, message = rawg_service.test_credentials()
        assert rawg_service._get("games", {}) is None
    assert not ok
    assert SECRET not in message
    assert SECRET not in _app_log(caplog)


def test_indexer_search_failure_is_clean(monkeypatch, caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, request=request)

    _route_httpx(monkeypatch, indexer_service, handler)
    indexer = Indexer(
        name="idx", url="https://idx.example", api_key=SECRET, protocol=IndexerProtocol.TORZNAB
    )
    with caplog.at_level(logging.DEBUG):
        with pytest.raises(httpx.HTTPStatusError) as err:
            asyncio.run(indexer_service.search_indexer(indexer, "mario"))
        ok, message = asyncio.run(indexer_service.test_indexer(indexer))
    assert SECRET in str(err.value)  # raw error still carries it; callers redact
    assert SECRET not in _app_log(caplog)
    assert SECRET not in message
    assert "https://idx.example/api" in _app_log(caplog)


def test_indexer_success_does_not_log_body_or_params(monkeypatch, caplog):
    xml = f"<rss><channel><item><title>Game</title><link>http://x/dl?apikey={SECRET}</link></item></channel></rss>"
    _route_httpx(monkeypatch, indexer_service, lambda r: httpx.Response(200, text=xml))
    indexer = Indexer(
        name="idx", url="https://idx.example", api_key=SECRET, protocol=IndexerProtocol.TORZNAB
    )
    with caplog.at_level(logging.DEBUG):
        asyncio.run(indexer_service.search_indexer(indexer, "mario"))
    assert SECRET not in _app_log(caplog)


def test_indexer_error_element_is_redacted():
    xml = f'<rss><channel><error code="100" description="bad apikey={SECRET}"/></channel></rss>'
    with pytest.raises(ValueError) as err:
        indexer_service._parse_newznab_xml(xml, "idx", IndexerProtocol.TORZNAB)
    assert SECRET not in str(err.value)


def _qbit_client() -> DownloadClient:
    return DownloadClient(
        name="qb",
        host="qbit.local",
        port=8080,
        use_ssl=False,
        url_base="",
        username="u",
        password="p",
        category="roms",
    )


def test_qbittorrent_add_keeps_url_out_of_logs_and_errors(monkeypatch, caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/torrents/add"):
            return httpx.Response(200, text="Fails.")
        if request.url.host == "idx.example":
            return httpx.Response(200, content=b"d8:announce0:e")
        return httpx.Response(200, text="Ok.")

    _route_httpx(monkeypatch, download_service, handler)
    client = download_service.QBittorrentClient(_qbit_client())
    url = f"https://idx.example/dl/1.torrent?apikey={SECRET}"
    with caplog.at_level(logging.DEBUG):
        with pytest.raises(ValueError) as err:
            asyncio.run(client.add(url, "game"))
    assert SECRET not in str(err.value)
    assert SECRET not in _app_log(caplog)
    assert "idx.example" in _app_log(caplog)


def test_client_test_result_is_redacted(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"failed for https://h/api?apikey={SECRET}")

    _route_httpx(monkeypatch, download_service, handler)
    client = download_service.QBittorrentClient(_qbit_client())
    ok, message = asyncio.run(client.test())
    assert not ok
    assert SECRET not in message


def test_notification_failure_is_redacted(monkeypatch, caplog):
    webhook = f"https://discord.com/api/webhooks/1234567890/{SECRET}"
    _route_httpx(monkeypatch, notification_service, lambda r: httpx.Response(404, request=r))
    config = f'{{"url": "{webhook}"}}'
    with caplog.at_level(logging.DEBUG):
        notification_service._dispatch_one("discord", config, "on_grab", "t", "b")
    assert "Notification failed" in _app_log(caplog)
    assert SECRET not in _app_log(caplog)

    def boom(*args, **kwargs):
        raise RuntimeError(f"cannot reach {webhook}")

    monkeypatch.setattr(notification_service, "_dispatch_one", boom)
    ok, message = notification_service.test_connection("discord", config)
    assert not ok
    assert SECRET not in message


def test_log_event_stores_redacted_message(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'events.db'}")
    AppEvent.metadata.create_all(engine, tables=[AppEvent.__table__])
    session_factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    monkeypatch.setattr("app.database.SessionLocal", session_factory)

    event_service.log_event("IGDB", f"auth failed client_secret={SECRET}")

    with session_factory() as db:
        rows = db.query(AppEvent).all()
    assert len(rows) == 1
    assert SECRET not in rows[0].message
    assert "client_secret=***" in rows[0].message


def test_file_handlers_carry_redacting_filter(monkeypatch, tmp_path):
    monkeypatch.setattr(log_service, "settings", SimpleNamespace(log_dir=tmp_path / "logs"))
    root = logging.getLogger()
    saved_level = root.level
    try:
        log_service.setup_logging("trace")
        assert len(log_service._handlers) == 3
        for handler in log_service._handlers:
            assert any(isinstance(f, RedactingFilter) for f in handler.filters)
        logging.getLogger("t").info("GET https://x/api?apikey=%s", SECRET)
        for handler in log_service._handlers:
            handler.flush()
        written = "".join(p.read_text() for p in (tmp_path / "logs").glob("romarr*.txt"))
        assert "apikey=***" in written
        assert SECRET not in written
    finally:
        for handler in log_service._handlers:
            root.removeHandler(handler)
            handler.close()
        log_service._handlers.clear()
        root.setLevel(saved_level)
