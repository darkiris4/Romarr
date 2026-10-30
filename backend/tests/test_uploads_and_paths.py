"""Upload, rename, file-deletion and backup-restore behaviour against a temporary database."""

import io
import sqlite3
import zipfile
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import database as database_module
from app.api.v1 import library as library_api
from app.api.v1 import system as system_api
from app.config import settings
from app.database import Base, get_db
from app.models.game import Game, GameStatus
from app.models.platform import Platform
from app.models.root_folder import RootFolder
from app.services import config_service, library_scanner
from app.services.library_scanner import DatROM

VALID_DAT = b'<?xml version="1.0"?>\n<datafile><header><name>Test System</name></header></datafile>'


def _make_db(path: Path, platform_name: str = "Original") -> None:
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    with sessionmaker(bind=engine)() as db:
        db.add(
            Platform(
                name=platform_name,
                no_intro_name=platform_name,
                folder_name=platform_name,
                extensions="",
                enabled=True,
            )
        )
        db.commit()
    engine.dispose()


@pytest.fixture
def env(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(settings, "data_dir", str(data_dir))
    monkeypatch.setattr(settings, "rom_library_path", str(tmp_path / "library"))
    db_path = data_dir / "romarr.db"
    _make_db(db_path)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    session_local = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "SessionLocal", session_local)
    monkeypatch.setattr(config_service, "SessionLocal", session_local)

    def override_get_db():
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(library_api.router, prefix="/library")
    app.include_router(system_api.router, prefix="/system")
    from app.api.v1 import games as games_api

    app.include_router(games_api.router, prefix="/games")
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client, data_dir, session_local, tmp_path
    engine.dispose()


# ── DAT upload ────────────────────────────────────────────────────────────────


def _upload(client, name, content):
    return client.post("/library/dat/upload", files={"file": (name, content)})


@pytest.mark.parametrize(
    "name",
    ["../evil.dat", "..\\evil.dat", "sub/evil.dat", "/etc/evil.dat", "x.txt"],
)
def test_dat_upload_rejects_bad_filenames(env, name):
    client, data_dir, _, tmp_path = env
    assert _upload(client, name, VALID_DAT).status_code == 422
    assert not (data_dir / "evil.dat").exists()
    assert not (tmp_path / "evil.dat").exists()


def test_dat_name_validation_rejects_nul():
    with pytest.raises(HTTPException) as exc:
        library_api._validated_dat_name("a\x00b.dat")
    assert exc.value.status_code == 422


def test_dat_upload_rejects_non_xml(env):
    client, data_dir, _, _ = env
    assert _upload(client, "x.dat", b"MZ\x90\x00binary").status_code == 422
    assert not (data_dir / "dats" / "x.dat").exists()


def test_dat_upload_rejects_oversized(env, monkeypatch):
    client, data_dir, _, _ = env
    monkeypatch.setattr(library_api, "_DAT_MAX_BYTES", 1024)
    assert _upload(client, "big.dat", b"<a>" + b"x" * 4096).status_code == 413
    assert list((data_dir / "dats").glob("*")) == []


def test_dat_upload_accepts_valid(env):
    client, data_dir, _, _ = env
    resp = _upload(client, "Test System.dat", b"\xef\xbb\xbf  \n" + VALID_DAT)
    assert resp.status_code == 200
    assert (data_dir / "dats" / "Test System.dat").exists()
    assert [p.name for p in (data_dir / "dats").iterdir()] == ["Test System.dat"]


def test_dat_delete_validates_name(env):
    client, data_dir, _, tmp_path = env
    (tmp_path / "victim.dat").write_bytes(b"<a/>")
    assert client.delete("/library/dat/..%5Cvictim.dat").status_code in (404, 422)
    assert client.delete("/library/dat/a%00b.dat").status_code == 422
    assert (tmp_path / "victim.dat").exists()
    _upload(client, "ok.dat", VALID_DAT)
    assert client.delete("/library/dat/ok.dat").status_code == 204
    assert not (data_dir / "dats" / "ok.dat").exists()


# ── canonical rename ──────────────────────────────────────────────────────────

HOSTILE = "../../outside/pwned"


def _add_game(session_local, rom_path, crc="AABBCCDD"):
    with session_local() as db:
        platform = db.query(Platform).first()
        game = Game(
            title="G",
            platform_id=platform.id,
            status=GameStatus.IMPORTED,
            rom_path=str(rom_path),
            checksum_crc32=crc,
        )
        db.add(game)
        db.commit()
        return game.id


def _index_dat(monkeypatch, full_title):
    rom = DatROM("t", "USA", "AABBCCDD", "", "", 1, full_title=full_title)
    monkeypatch.setattr(library_scanner, "_DAT_INDEX", {1: {"AABBCCDD": rom}})


def test_scanner_rename_cannot_leave_folder(env, monkeypatch):
    _, _, _, tmp_path = env
    folder = tmp_path / "roms"
    folder.mkdir()
    src = folder / "game.bin"
    src.write_bytes(b"x")
    _index_dat(monkeypatch, HOSTILE)
    result = Path(library_scanner._try_rename_to_canonical(str(src), "AABBCCDD"))
    assert result.parent == folder
    assert not (tmp_path / "outside").exists()
    assert result.exists()


def test_rename_endpoint_stays_in_folder_and_requires_managed(env, monkeypatch):
    client, _, session_local, tmp_path = env
    managed = tmp_path / "managed"
    managed.mkdir()
    other = tmp_path / "other"
    other.mkdir()
    with session_local() as db:
        db.add(RootFolder(path=str(managed)))
        db.commit()
    _index_dat(monkeypatch, HOSTILE)

    inside = managed / "a.bin"
    inside.write_bytes(b"x")
    outside = other / "b.bin"
    outside.write_bytes(b"x")
    gid_in = _add_game(session_local, inside)
    gid_out = _add_game(session_local, outside)

    resp = client.post("/library/rename", json={"game_ids": [gid_in, gid_out]})
    assert resp.status_code == 200
    assert resp.json() == {"renamed": 1, "errors": 1}
    assert outside.exists()
    assert not inside.exists()
    assert not (tmp_path / "outside").exists()
    assert [p.parent for p in managed.iterdir()] == [managed]
    rows = client.post("/library/rename-preview", json={"game_ids": [gid_out]}).json()["rows"]
    assert Path(rows[0]["proposed_path"]).parent == other


# ── delete_game_file ──────────────────────────────────────────────────────────


def test_delete_game_file_refuses_outside_path(env):
    client, _, session_local, tmp_path = env
    victim = tmp_path / "elsewhere.bin"
    victim.write_bytes(b"x")
    gid = _add_game(session_local, victim)
    resp = client.delete(f"/games/{gid}/file")
    assert resp.status_code == 409
    assert "outside the managed folders" in resp.json()["detail"]
    assert victim.exists()


def test_delete_game_file_inside_root_folder(env):
    client, _, session_local, tmp_path = env
    root = tmp_path / "root"
    root.mkdir()
    rom = root / "g.bin"
    rom.write_bytes(b"x")
    with session_local() as db:
        db.add(RootFolder(path=str(root)))
        db.commit()
    gid = _add_game(session_local, rom)
    assert client.delete(f"/games/{gid}/file").status_code == 200
    assert not rom.exists()
    with session_local() as db:
        assert db.get(Game, gid).rom_path is None


# ── backup restore ────────────────────────────────────────────────────────────


def _zip_bytes(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _valid_db_bytes(tmp_path, name="Restored") -> bytes:
    path = tmp_path / "src.db"
    path.unlink(missing_ok=True)
    _make_db(path, name)
    return path.read_bytes()


def _restore(client, data):
    return client.post("/system/backup/restore", files={"file": ("b.zip", data)})


def _platform_names(data_dir):
    conn = sqlite3.connect(data_dir / "romarr.db")
    try:
        return [r[0] for r in conn.execute("SELECT name FROM platforms")]
    finally:
        conn.close()


def test_restore_rejects_non_zip(env):
    client, data_dir, _, _ = env
    resp = _restore(client, b"not a zip")
    assert resp.status_code == 400
    assert _platform_names(data_dir) == ["Original"]


def test_restore_rejects_zip_without_db(env):
    client, data_dir, _, _ = env
    assert _restore(client, _zip_bytes({"other.txt": b"x"})).status_code == 400
    assert _platform_names(data_dir) == ["Original"]


@pytest.mark.parametrize("payload", [b"garbage" * 100, b"SQLite format 3\x00" + b"\xff" * 4096])
def test_restore_rejects_corrupt_or_non_sqlite_db(env, payload):
    client, data_dir, _, _ = env
    assert _restore(client, _zip_bytes({"romarr.db": payload})).status_code == 400
    assert _platform_names(data_dir) == ["Original"]


def test_restore_rejects_db_missing_tables(env, tmp_path):
    client, data_dir, _, _ = env
    path = tmp_path / "empty.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE unrelated (id INTEGER)")
    conn.commit()
    conn.close()
    assert _restore(client, _zip_bytes({"romarr.db": path.read_bytes()})).status_code == 400
    assert _platform_names(data_dir) == ["Original"]


def test_restore_rejects_extra_members(env, tmp_path):
    client, data_dir, _, _ = env
    data = _zip_bytes({"romarr.db": _valid_db_bytes(tmp_path), "../evil": b"x"})
    assert _restore(client, data).status_code == 400
    assert _platform_names(data_dir) == ["Original"]


def test_restore_rejects_oversized_declared_size(env, tmp_path, monkeypatch):
    client, data_dir, _, _ = env
    monkeypatch.setattr(system_api, "_DB_MAX_BYTES", 1024)
    assert _restore(client, _zip_bytes({"romarr.db": _valid_db_bytes(tmp_path)})).status_code == 400
    assert _platform_names(data_dir) == ["Original"]


def test_restore_rejects_oversized_upload(env, monkeypatch):
    client, data_dir, _, _ = env
    monkeypatch.setattr(system_api, "_UPLOAD_MAX_BYTES", 10)
    assert _restore(client, b"x" * 100).status_code == 413
    assert _platform_names(data_dir) == ["Original"]


def test_restore_accepts_valid_backup(env, tmp_path):
    client, data_dir, _, _ = env
    (data_dir / "romarr.db-wal").write_bytes(b"stale")
    (data_dir / "romarr.db-shm").write_bytes(b"stale")
    resp = _restore(client, _zip_bytes({"romarr.db": _valid_db_bytes(tmp_path)}))
    assert resp.status_code == 200
    assert "restored" in resp.json()["message"]
    assert _platform_names(data_dir) == ["Restored"]
    assert not (data_dir / "romarr.db-wal").exists()
    assert not (data_dir / "romarr.db-shm").exists()

    safety = list((data_dir / "backups").glob("romarr_backup_*.zip"))
    assert len(safety) == 1
    extracted = tmp_path / "safety.db"
    with zipfile.ZipFile(safety[0]) as zf:
        extracted.write_bytes(zf.read("romarr.db"))
    conn = sqlite3.connect(extracted)
    assert [r[0] for r in conn.execute("SELECT name FROM platforms")] == ["Original"]
    conn.close()
    assert [p.name for p in data_dir.glob(".*")] == []


@pytest.mark.parametrize(
    "name", ["evil.zip", "romarr_backup_..%2f..%2fx.zip", "romarr_backup_a.txt", "romarr_backup_.."]
)
def test_named_restore_rejects_bad_names(env, name):
    client, _, _, _ = env
    assert client.post(f"/system/backup/{name}/restore").status_code in (400, 404, 405)
    assert client.get(f"/system/backup/{name}").status_code in (400, 404)
    assert client.delete(f"/system/backup/{name}").status_code in (400, 404)


def test_named_restore_validates_and_restores(env, tmp_path):
    client, data_dir, _, _ = env
    backups = data_dir / "backups"
    backups.mkdir()
    (backups / "romarr_backup_bad.zip").write_bytes(b"nope")
    assert client.post("/system/backup/romarr_backup_bad.zip/restore").status_code == 400
    assert client.post("/system/backup/romarr_backup_missing.zip/restore").status_code == 404
    (backups / "romarr_backup_good.zip").write_bytes(
        _zip_bytes({"romarr.db": _valid_db_bytes(tmp_path, "FromNamed")})
    )
    assert client.post("/system/backup/romarr_backup_good.zip/restore").status_code == 200
    assert _platform_names(data_dir) == ["FromNamed"]


def _wal_db_bytes(tmp_path: Path, platform_name: str = "WalRestored") -> bytes:
    path = tmp_path / "wal-source.db"
    _make_db(path, platform_name)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.commit()
    conn.close()
    return path.read_bytes()


def test_restore_leaves_no_temporary_files_for_wal_backup(env, tmp_path):
    client, data_dir, _, _ = env
    resp = _restore(client, _zip_bytes({"romarr.db": _wal_db_bytes(tmp_path)}))
    assert resp.status_code == 200
    assert _platform_names(data_dir) == ["WalRestored"]
    assert [p.name for p in data_dir.glob(".*")] == []


class _FixedClock:
    """Stand-in for the datetime class used by the scheduler, frozen at one instant."""

    @staticmethod
    def now(tz=None):
        from datetime import datetime

        return datetime(2026, 1, 2, 3, 4, 5, tzinfo=tz)


def test_backups_in_the_same_second_get_distinct_names(env, monkeypatch):
    from app.services import scheduler

    _, data_dir, _, _ = env
    monkeypatch.setattr(scheduler, "datetime", _FixedClock)
    scheduler._backup()
    scheduler._backup()
    scheduler._backup()
    names = sorted(p.name for p in (data_dir / "backups").glob("romarr_backup_*.zip"))
    assert len(names) == 3 and len(set(names)) == 3


def test_safety_backup_never_replaces_the_backup_being_restored(env, tmp_path, monkeypatch):
    from app.services import scheduler

    client, data_dir, _, _ = env
    monkeypatch.setattr(scheduler, "datetime", _FixedClock)
    scheduler._backup()
    backups = data_dir / "backups"
    original = next(backups.glob("romarr_backup_*.zip"))
    before = original.read_bytes()
    assert client.post(f"/system/backup/{original.name}/restore").status_code == 200
    assert original.read_bytes() == before
    assert len(list(backups.glob("romarr_backup_*.zip"))) == 2
