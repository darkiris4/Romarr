import logging
import os
import platform
import re
import sqlite3
import sys
import tempfile
import zipfile
import zlib
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from ...config import settings
from ...version import APP_VERSION

logger = logging.getLogger(__name__)

router = APIRouter()

_start_time = datetime.utcnow()


@router.get("/status")
async def system_status():
    import asyncio
    import os
    import shutil
    from pathlib import Path

    from ...database import SessionLocal
    from ...models.download_client import DownloadClient
    from ...models.indexer import Indexer
    from ...models.root_folder import RootFolder
    from ...services.config_service import get_config
    from ...services.download_service import get_client
    from ...services.igdb_service import _credentials, _get_token
    from ...services.indexer_service import test_indexer
    from ...services.library_scanner import _DAT_INDEX

    db = SessionLocal()
    try:
        enabled_indexers = db.query(Indexer).filter_by(enabled=True).all()
        enabled_clients = db.query(DownloadClient).filter_by(enabled=True).all()
        root_folder_count = db.query(RootFolder).count()
    finally:
        db.close()

    igdb_client_id, igdb_client_secret = _credentials()
    igdb_configured = bool(igdb_client_id and igdb_client_secret)
    dat_count = len(_DAT_INDEX)
    metadata_provider = get_config("metadata_provider", "igdb")

    # Run all connectivity probes concurrently so the status page stays fast.
    indexer_results, client_results = await asyncio.gather(
        asyncio.gather(*[test_indexer(idx) for idx in enabled_indexers], return_exceptions=True),
        asyncio.gather(*[get_client(c).test() for c in enabled_clients], return_exceptions=True),
    )

    failed_indexers = [
        idx.name
        for idx, result in zip(enabled_indexers, indexer_results)
        if isinstance(result, Exception) or not result[0]
    ]
    failed_clients = [
        c.name
        for c, result in zip(enabled_clients, client_results)
        if isinstance(result, Exception) or not result[0]
    ]

    health_issues = []
    if not root_folder_count:
        health_issues.append(
            {
                "message": "No root folder configured — set one so imported ROMs have a home",
                "path": "/settings/mediamanagement",
            }
        )
    if not dat_count:
        health_issues.append(
            {
                "message": "No No-Intro DAT files loaded — upload them to enable CRC32 matching",
                "path": "/settings/platforms",
            }
        )
    if metadata_provider == "rawg":
        from ...services.rawg_service import _api_key
        from ...services.rawg_service import test_credentials as _test_rawg

        if not _api_key():
            health_issues.append(
                {
                    "message": "RAWG API key not configured — metadata scraping will not work",
                    "path": "/settings/metadata",
                }
            )
        else:
            rawg_ok, _ = _test_rawg()
            if not rawg_ok:
                health_issues.append(
                    {
                        "message": "RAWG API key is invalid — check your key in Settings → Metadata",
                        "path": "/settings/metadata",
                    }
                )
    else:
        if not igdb_configured:
            health_issues.append(
                {
                    "message": "IGDB credentials not configured — metadata scraping will not work",
                    "path": "/settings/metadata",
                }
            )
        elif not _get_token():
            health_issues.append(
                {
                    "message": "IGDB credentials are invalid — check your Client ID and Secret",
                    "path": "/settings/metadata",
                }
            )
    if not enabled_indexers:
        health_issues.append(
            {
                "message": "No indexers configured — automatic searching will not work",
                "path": "/settings/indexers",
            }
        )
    elif failed_indexers:
        health_issues.append(
            {
                "message": f"Indexer(s) unreachable: {', '.join(failed_indexers)}",
                "path": "/settings/indexers",
            }
        )
    if not enabled_clients:
        health_issues.append(
            {
                "message": "No download client configured — grabbing releases will not work",
                "path": "/settings/downloadclients",
            }
        )
    elif failed_clients:
        health_issues.append(
            {
                "message": f"Download client(s) unreachable: {', '.join(failed_clients)}",
                "path": "/settings/downloadclients",
            }
        )

    data_path = Path(settings.data_dir).resolve()
    library_path = Path(settings.rom_library_path).resolve()

    def disk_info(p: Path):
        try:
            usage = shutil.disk_usage(p)
            return {"path": str(p), "free": usage.free, "total": usage.total}
        except Exception:
            return {"path": str(p), "free": None, "total": None}

    uptime_seconds = int((datetime.utcnow() - _start_time).total_seconds())

    return {
        "health": health_issues,
        "disk": [
            disk_info(data_path),
            disk_info(library_path),
        ],
        "about": {
            "version": APP_VERSION,
            "python": sys.version.split(" ")[0],
            "docker": Path("/.dockerenv").exists(),
            "sqliteVersion": _sqlite_version(),
            "appDataDirectory": str(data_path),
            "startupDirectory": os.getcwd(),
            "startupTime": _start_time.isoformat() + "Z",
            "uptimeSeconds": uptime_seconds,
            "branch": "main",
            "os": f"{platform.system()} {platform.release()}",
        },
    }


_updates_cache: dict = {"checked_at": 0.0, "data": None}
_UPDATES_TTL = 6 * 3600  # 6 hours


@router.get("/updates")
def get_updates():
    import time

    import httpx

    now = time.time()
    if now - _updates_cache["checked_at"] < _UPDATES_TTL and _updates_cache["data"]:
        return _updates_cache["data"]

    try:
        resp = httpx.get(
            "https://api.github.com/repos/darkiris4/Romarr/releases/latest",
            headers={"Accept": "application/vnd.github+json"},
            timeout=10,
        )
        resp.raise_for_status()
        release = resp.json()
        latest = release.get("tag_name", "").lstrip("v")
        release_url = release.get("html_url", "")
        release_notes = release.get("body", "")
        has_update = latest != "" and latest != APP_VERSION
    except Exception:
        latest = ""
        release_url = ""
        release_notes = ""
        has_update = False

    data = {
        "current": APP_VERSION,
        "latest": latest or APP_VERSION,
        "has_update": has_update,
        "release_url": release_url,
        "release_notes": release_notes,
    }
    _updates_cache["checked_at"] = now
    _updates_cache["data"] = data
    return data


@router.get("/tasks")
def list_tasks():
    from ...services.scheduler import get_job_history, scheduler

    history = get_job_history()
    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time
        interval_secs = None
        try:
            interval_secs = int(job.trigger.interval.total_seconds())
        except Exception:
            pass
        hist = history.get(job.id, {})
        jobs.append(
            {
                "id": job.id,
                "name": job.name or job.id,
                "interval": interval_secs,
                "lastExecution": hist.get("last_execution"),
                "lastDuration": hist.get("last_duration"),
                "nextExecution": next_run.isoformat() if next_run else None,
            }
        )
    return jobs


@router.get("/tasks/queue")
def task_queue():
    from ...services.scheduler import get_task_queue

    return get_task_queue()


@router.post("/tasks/{task_id}/trigger")
def trigger_task(task_id: str):
    from ...services.scheduler import scheduler

    job = scheduler.get_job(task_id)
    if not job:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Task not found")
    job.modify(next_run_time=datetime.now(job.next_run_time.tzinfo if job.next_run_time else None))
    return {"message": f"Task '{task_id}' triggered"}


class IgdbConfig(BaseModel):
    igdb_client_id: str = ""
    igdb_client_secret: str = ""


@router.get("/config/igdb")
def get_igdb_config():
    from ...services.config_service import get_many

    cfg = get_many(["igdb_client_id", "igdb_client_secret"])
    return {
        "igdb_client_id": cfg["igdb_client_id"],
        "igdb_client_secret": "•" * 8 if cfg["igdb_client_secret"] else "",
        "configured": bool(cfg["igdb_client_id"] and cfg["igdb_client_secret"]),
    }


@router.put("/config/igdb")
def save_igdb_config(payload: IgdbConfig):
    from ...services.config_service import set_config

    if payload.igdb_client_id:
        set_config("igdb_client_id", payload.igdb_client_id)
    # Only update secret if a real value (not the masked placeholder) was sent
    if payload.igdb_client_secret and not payload.igdb_client_secret.startswith("•"):
        set_config("igdb_client_secret", payload.igdb_client_secret)
    return {"message": "Saved"}


@router.post("/config/igdb/test")
def test_igdb():
    from ...services.igdb_service import test_credentials

    ok, message = test_credentials()
    return {"ok": ok, "message": message}


class RawgConfig(BaseModel):
    rawg_api_key: str = ""
    metadata_provider: str = ""


@router.get("/config/rawg")
def get_rawg_config():
    from ...services.config_service import get_many

    cfg = get_many(["rawg_api_key", "metadata_provider"])
    return {
        "rawg_api_key": "•" * 8 if cfg["rawg_api_key"] else "",
        "metadata_provider": cfg["metadata_provider"] or "igdb",
        "configured": bool(cfg["rawg_api_key"]),
    }


@router.put("/config/rawg")
def save_rawg_config(payload: RawgConfig):
    from ...services.config_service import set_config

    if payload.rawg_api_key and not payload.rawg_api_key.startswith("•"):
        set_config("rawg_api_key", payload.rawg_api_key)
    if payload.metadata_provider in ("igdb", "rawg"):
        set_config("metadata_provider", payload.metadata_provider)
    return {"message": "Saved"}


@router.post("/config/rawg/test")
def test_rawg():
    from ...services.rawg_service import test_credentials

    ok, message = test_credentials()
    return {"ok": ok, "message": message}


@router.post("/scrape")
def run_scrape(force: bool = False):
    """Start the metadata scraper in a background thread.
    force=True re-enriches all IGDB-matched games (used by Update All).
    """
    from ...services.metadata_scraper import scrape_start

    return scrape_start(force=force)


@router.get("/scrape/status")
def scrape_status():
    """Current scraper progress — safe to poll."""
    from ...services.metadata_scraper import scrape_status as _status

    return _status()


@router.get("/scrape/log")
def scrape_log(limit: int = 500):
    """Debug log from the most recent scrape run."""
    from ...services.metadata_scraper import scrape_log as _log

    return {"entries": _log(limit)}


@router.get("/events")
def list_events(page: int = 1, per_page: int = 50):
    from ...services.event_service import get_events

    return get_events(page, per_page)


@router.delete("/events", status_code=204)
def clear_events():
    from ...services.event_service import clear_events as _clear

    _clear()


@router.get("/backup")
def list_backups():
    from pathlib import Path

    from ...config import settings

    backup_dir = Path(settings.data_dir) / "backups"
    if not backup_dir.exists():
        return []

    files = sorted(backup_dir.glob("romarr_backup_*.zip"), reverse=True)
    result = []
    for f in files:
        stat = f.stat()
        result.append(
            {
                "name": f.name,
                "size": stat.st_size,
                "time": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
            }
        )
    return result


@router.post("/backup")
def create_backup():
    from ...services.scheduler import _backup

    _backup()
    return {"message": "Backup created"}


_BACKUP_NAME = re.compile(r"^romarr_backup_[A-Za-z0-9._-]+\.zip$")
_UPLOAD_MAX_BYTES = 512 * 1024 * 1024
_DB_MAX_BYTES = 2 * 1024 * 1024 * 1024
_CHUNK = 1024 * 1024


def _check_backup_name(filename: str) -> str:
    if not _BACKUP_NAME.fullmatch(filename) or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return filename


def _validate_sqlite(path: Path) -> None:
    """Raise HTTP 400 unless ``path`` is an intact SQLite database holding the Romarr tables."""
    try:
        conn = sqlite3.connect(f"file:{quote(str(path))}?mode=ro", uri=True)
        try:
            result = conn.execute("PRAGMA integrity_check").fetchall()
            if result != [("ok",)]:
                raise HTTPException(
                    status_code=400, detail="Backup database failed integrity check"
                )
            tables = {
                row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
        finally:
            conn.close()
    except sqlite3.Error:
        raise HTTPException(status_code=400, detail="Backup does not contain a valid database")
    if not {"platforms", "games"} <= tables:
        raise HTTPException(status_code=400, detail="Backup database is missing required tables")


def _extract_db(zip_path: Path, dest: Path) -> None:
    """Stream the single ``romarr.db`` member of ``zip_path`` into ``dest`` under a size cap."""
    try:
        with zipfile.ZipFile(zip_path) as zf:
            infos = zf.infolist()
            if [i.filename for i in infos] != ["romarr.db"]:
                raise HTTPException(
                    status_code=400, detail="Backup must contain exactly one file, romarr.db"
                )
            if infos[0].file_size > _DB_MAX_BYTES:
                raise HTTPException(status_code=400, detail="Backup database is too large")
            written = 0
            with zf.open(infos[0]) as src, open(dest, "wb") as out:
                while chunk := src.read(_CHUNK):
                    written += len(chunk)
                    if written > _DB_MAX_BYTES:
                        raise HTTPException(status_code=400, detail="Backup database is too large")
                    out.write(chunk)
    except (zipfile.BadZipFile, KeyError, OSError, zlib.error, EOFError, NotImplementedError):
        raise HTTPException(status_code=400, detail="Invalid backup file")


def _restore_from_zip(zip_path: Path) -> None:
    """Validate the database inside ``zip_path`` and swap it in for the live database."""
    from ...database import SessionLocal, engine
    from ...services.dat_manager import scan_dat_dir
    from ...services.scheduler import _backup

    db_path = Path(settings.data_dir) / "romarr.db"
    fd, tmp_name = tempfile.mkstemp(dir=db_path.parent, prefix=".restore_", suffix=".db")
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        _extract_db(zip_path, tmp_path)
        _validate_sqlite(tmp_path)
        _backup()
        os.replace(tmp_path, db_path)
    finally:
        # Opening the extracted copy can leave journal sidecars next to it.
        for suffix in ("", "-wal", "-shm"):
            Path(f"{tmp_path}{suffix}").unlink(missing_ok=True)

    # Stale WAL/SHM sidecars would be replayed against the restored database.
    for ext in ("-wal", "-shm"):
        (db_path.parent / (db_path.name + ext)).unlink(missing_ok=True)

    engine.dispose()
    try:
        with SessionLocal() as db:
            scan_dat_dir(db)
    except Exception:
        logger.warning("DAT index reload after restore failed", exc_info=True)


@router.post("/backup/restore")
async def restore_from_upload(file: UploadFile):
    from ...services.event_service import log_event

    fd, tmp_name = tempfile.mkstemp(dir=Path(settings.data_dir), prefix=".upload_", suffix=".zip")
    tmp_path = Path(tmp_name)
    try:
        size = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := await file.read(_CHUNK):
                size += len(chunk)
                if size > _UPLOAD_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Backup exceeds 512 MiB limit")
                out.write(chunk)
        _restore_from_zip(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    log_event("Backup", f"Database restored from uploaded file ({file.filename})")
    return {"message": "Database restored and reloaded."}


@router.get("/backup/{filename}")
def download_backup(filename: str):
    from pathlib import Path

    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    from ...config import settings

    _check_backup_name(filename)

    path = Path(settings.data_dir) / "backups" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/backup/{filename}", status_code=204)
def delete_backup(filename: str):
    from pathlib import Path

    from fastapi import HTTPException

    from ...config import settings

    _check_backup_name(filename)

    path = Path(settings.data_dir) / "backups" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    path.unlink()


@router.post("/backup/{filename}/restore")
def restore_backup(filename: str):
    from ...services.event_service import log_event

    _check_backup_name(filename)
    backup_path = Path(settings.data_dir) / "backups" / filename
    if not backup_path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")

    _restore_from_zip(backup_path)

    log_event("Backup", f"Database restored from {filename}")
    return {"message": "Database restored and reloaded."}


def _sqlite_version() -> str:
    try:
        import sqlite3

        return sqlite3.sqlite_version
    except Exception:
        return "unknown"
