"""
APScheduler-based background task runner.
All periodic work (RSS sync, download polling, wanted search) lives here.
"""

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED, EVENT_JOB_SUBMITTED
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

_job_start_times: dict[str, datetime] = {}
_job_history: dict[str, dict] = {}
_task_queue: list[dict] = []  # execution history, most recent last, capped at 100
_lock = threading.Lock()

_QUEUE_CAP = 100


def get_job_history() -> dict[str, dict]:
    with _lock:
        return dict(_job_history)


def get_task_queue() -> list[dict]:
    with _lock:
        return list(reversed(_task_queue))


def _on_job_submitted(event):
    with _lock:
        now = datetime.now(UTC)
        _job_start_times[event.job_id] = now
        _task_queue.append(
            {
                "id": event.job_id,
                "queued": now.isoformat(),
                "started": now.isoformat(),
                "ended": None,
                "duration": None,
                "status": "running",
            }
        )
        if len(_task_queue) > _QUEUE_CAP:
            _task_queue.pop(0)


def _on_job_finished(event):
    with _lock:
        start = _job_start_times.pop(event.job_id, None)
        now = datetime.now(UTC)
        duration = (now - start).total_seconds() if start else 0
        _job_history[event.job_id] = {
            "last_execution": now.isoformat(),
            "last_duration": round(duration, 3),
        }
        status = "failed" if getattr(event, "exception", None) else "completed"
        for entry in reversed(_task_queue):
            if entry["id"] == event.job_id and entry["ended"] is None:
                entry["ended"] = now.isoformat()
                entry["duration"] = round(duration, 3)
                entry["status"] = status
                break


def start():
    if not scheduler.running:
        scheduler.add_listener(_on_job_submitted, EVENT_JOB_SUBMITTED)
        scheduler.add_listener(_on_job_finished, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
        scheduler.start()
        _register_jobs()
        logger.info("Scheduler started")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)


def _deduplicate():
    from ..database import SessionLocal
    from .library_scanner import deduplicate_games

    db = SessionLocal()
    try:
        result = deduplicate_games(db)
        if result["removed"]:
            logger.info("Deduplication removed %d duplicate game record(s)", result["removed"])
            from .event_service import log_event

            log_event(
                "Scheduler", f"Deduplication removed {result['removed']} duplicate game record(s)"
            )
    except Exception:
        logger.exception("Deduplication job failed")
    finally:
        db.close()


def _check_health():
    from .event_service import log_event

    issues = []

    try:
        from .igdb_service import _credentials, _get_token

        client_id, client_secret = _credentials()
        if client_id and client_secret:
            token = _get_token()
            if not token:
                issues.append("IGDB: failed to obtain access token")
        # If not configured, skip — not an error
    except Exception as exc:
        issues.append(f"IGDB: {exc}")

    if issues:
        log_event("HealthCheck", f"Health issues: {'; '.join(issues)}")
        logger.warning("Health check issues: %s", "; ".join(issues))
    else:
        log_event("HealthCheck", "All systems operational")
        logger.info("Health check passed")


def _backup():
    import zipfile
    from pathlib import Path

    from ..config import settings
    from .event_service import log_event

    db_path = Path(settings.data_dir) / "romarr.db"
    if not db_path.exists():
        return

    backup_dir = Path(settings.data_dir) / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"romarr_backup_v0.1.0_{stamp}.zip"
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(db_path, "romarr.db")

    # Keep last 5 backups
    backups = sorted(backup_dir.glob("romarr_backup_*.zip"))
    for old in backups[:-5]:
        old.unlink(missing_ok=True)

    log_event("Backup", f"Database backed up ({dest.name})")
    logger.info("Database backed up to %s", dest)


def _housekeeping():
    from .event_service import log_event

    # Event log is auto-truncated by event_service on every write.
    # Future: clean stale queue items, orphaned import temp files, etc.
    log_event("Housekeeping", "Housekeeping complete")
    logger.info("Housekeeping complete")


def _register_jobs():
    from .download_poll import poll_downloads
    from .metadata_scraper import scrape_pending
    from .rss_search import search_wanted

    scheduler.add_job(
        poll_downloads,
        trigger=IntervalTrigger(seconds=5),
        id="poll_downloads",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        search_wanted,
        trigger=IntervalTrigger(minutes=15),
        id="search_wanted",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        scrape_pending,
        trigger=IntervalTrigger(hours=6),
        id="scrape_metadata",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _deduplicate,
        trigger=IntervalTrigger(hours=24),
        id="deduplicate",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _check_health,
        trigger=IntervalTrigger(hours=6),
        id="check_health",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _backup,
        trigger=IntervalTrigger(days=7),
        id="backup",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _housekeeping,
        trigger=IntervalTrigger(hours=24),
        id="housekeeping",
        replace_existing=True,
        max_instances=1,
    )
