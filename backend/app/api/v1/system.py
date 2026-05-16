import platform
import sys
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from ...config import settings

router = APIRouter()

_start_time = datetime.utcnow()


@router.get("/status")
def system_status():
    return {
        "appName": settings.app_name,
        "version": "0.1.0",
        "buildTime": "2025-01-01T00:00:00Z",
        "startupTime": _start_time.isoformat(),
        "runtimeVersion": sys.version,
        "osName": platform.system(),
        "osVersion": platform.release(),
        "isDebug": False,
        "isProduction": True,
        "branch": "main",
        "authentication": "none",
        "sqliteVersion": _sqlite_version(),
    }


@router.get("/tasks")
def list_tasks():
    from ...services.scheduler import scheduler, get_job_history

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
        jobs.append({
            "id": job.id,
            "name": job.name or job.id,
            "interval": interval_secs,
            "lastExecution": hist.get("last_execution"),
            "lastDuration": hist.get("last_duration"),
            "nextExecution": next_run.isoformat() if next_run else None,
        })
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
def run_scrape():
    """Start the metadata scraper in a background thread."""
    from ...services.metadata_scraper import scrape_start
    return scrape_start()


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
    return []


def _sqlite_version() -> str:
    try:
        import sqlite3
        return sqlite3.sqlite_version
    except Exception:
        return "unknown"
