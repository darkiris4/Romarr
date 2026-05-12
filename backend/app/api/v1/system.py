import platform
import sys
from datetime import datetime

from fastapi import APIRouter

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
    from ...services.scheduler import scheduler

    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time
        jobs.append({
            "id": job.id,
            "name": job.name or job.id,
            "nextExecution": next_run.isoformat() if next_run else None,
        })
    return jobs


@router.post("/tasks/{task_id}/trigger")
def trigger_task(task_id: str):
    from ...services.scheduler import scheduler

    job = scheduler.get_job(task_id)
    if not job:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Task not found")
    job.modify(next_run_time=datetime.now(job.next_run_time.tzinfo if job.next_run_time else None))
    return {"message": f"Task '{task_id}' triggered"}


@router.get("/logs")
def get_logs(limit: int = 200):
    # Structured log tail — extend with a real log handler in production
    return {"page": 1, "totalRecords": 0, "records": []}


@router.get("/backup")
def list_backups():
    return []


def _sqlite_version() -> str:
    try:
        import sqlite3
        return sqlite3.sqlite_version
    except Exception:
        return "unknown"
