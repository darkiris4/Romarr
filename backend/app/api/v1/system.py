import platform
import sys
from datetime import datetime

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel


def _reload_db() -> None:
    """Drop the SQLAlchemy connection pool so the next request opens a fresh
    connection to the restored database file. No process restart needed."""
    from ...database import engine

    engine.dispose()


from ...config import settings
from ...version import APP_VERSION

router = APIRouter()

_start_time = datetime.utcnow()


@router.get("/status")
def system_status():
    import os
    import shutil
    from pathlib import Path

    from ...database import SessionLocal
    from ...models.download_client import DownloadClient
    from ...models.indexer import Indexer
    from ...models.root_folder import RootFolder
    from ...services.igdb_service import _credentials
    from ...services.library_scanner import _DAT_INDEX

    db = SessionLocal()
    try:
        indexer_count = db.query(Indexer).count()
        client_count = db.query(DownloadClient).count()
        root_folder_count = db.query(RootFolder).count()
    finally:
        db.close()

    igdb_client_id, igdb_client_secret = _credentials()
    igdb_configured = bool(igdb_client_id and igdb_client_secret)
    dat_count = len(_DAT_INDEX)

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
    if not igdb_configured:
        health_issues.append(
            {
                "message": "IGDB credentials not configured — metadata scraping will not work",
                "path": "/settings/general",
            }
        )
    if not indexer_count:
        health_issues.append(
            {
                "message": "No indexers configured — automatic searching will not work",
                "path": "/settings/indexers",
            }
        )
    if not client_count:
        health_issues.append(
            {
                "message": "No download client configured — grabbing releases will not work",
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


@router.post("/backup/restore")
async def restore_from_upload(file: UploadFile):
    import io
    import zipfile
    from pathlib import Path

    from fastapi import HTTPException

    from ...config import settings
    from ...services.event_service import log_event

    content = await file.read()
    db_path = Path(settings.data_dir) / "romarr.db"

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            if "romarr.db" not in zf.namelist():
                raise HTTPException(status_code=400, detail="ZIP does not contain romarr.db")
            db_path.write_bytes(zf.read("romarr.db"))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid backup file")

    # Remove stale WAL/SHM sidecars so SQLite doesn't replay old transactions
    # against the restored DB on next open.
    for ext in ("-wal", "-shm"):
        sidecar = db_path.parent / (db_path.name + ext)
        sidecar.unlink(missing_ok=True)

    log_event("Backup", f"Database restored from uploaded file ({file.filename})")
    _reload_db()
    return {"message": "Restored successfully."}


@router.get("/backup/{filename}")
def download_backup(filename: str):
    from pathlib import Path

    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    from ...config import settings

    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

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

    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    path = Path(settings.data_dir) / "backups" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    path.unlink()


@router.post("/backup/{filename}/restore")
def restore_backup(filename: str):
    import zipfile
    from pathlib import Path

    from fastapi import HTTPException

    from ...config import settings
    from ...services.event_service import log_event

    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    backup_path = Path(settings.data_dir) / "backups" / filename
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    db_path = Path(settings.data_dir) / "romarr.db"
    with zipfile.ZipFile(backup_path) as zf:
        db_path.write_bytes(zf.read("romarr.db"))

    # Remove stale WAL/SHM sidecars so SQLite doesn't replay old transactions
    # against the restored DB on next open.
    for ext in ("-wal", "-shm"):
        sidecar = db_path.parent / (db_path.name + ext)
        sidecar.unlink(missing_ok=True)

    log_event("Backup", f"Database restored from {filename}")
    _reload_db()
    return {"message": "Restored successfully."}


def _sqlite_version() -> str:
    try:
        import sqlite3

        return sqlite3.sqlite_version
    except Exception:
        return "unknown"
