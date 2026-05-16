"""
APScheduler-based background task runner.
All periodic work (RSS sync, download polling, wanted search) lives here.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR, EVENT_JOB_SUBMITTED

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

_job_start_times: dict[str, datetime] = {}
_job_history: dict[str, dict] = {}
_lock = threading.Lock()


def get_job_history() -> dict[str, dict]:
    with _lock:
        return dict(_job_history)


def _on_job_submitted(event):
    with _lock:
        _job_start_times[event.job_id] = datetime.now(timezone.utc)


def _on_job_finished(event):
    with _lock:
        start = _job_start_times.pop(event.job_id, None)
        now = datetime.now(timezone.utc)
        duration = (now - start).total_seconds() if start else 0
        _job_history[event.job_id] = {
            "last_execution": now.isoformat(),
            "last_duration": round(duration, 3),
        }


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
            log_event("Scheduler", f"Deduplication removed {result['removed']} duplicate game record(s)")
    except Exception:
        logger.exception("Deduplication job failed")
    finally:
        db.close()


def _check_health():
    from .event_service import log_event
    issues = []

    try:
        from .igdb_service import _get_token, _credentials
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
    import shutil
    from pathlib import Path
    from ..config import settings
    from .event_service import log_event

    db_path = Path(settings.data_dir) / "romarr.db"
    if not db_path.exists():
        return

    backup_dir = Path(settings.data_dir) / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"romarr_{stamp}.db"
    shutil.copy2(db_path, dest)

    # Keep last 5 backups
    backups = sorted(backup_dir.glob("romarr_*.db"))
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
    from .rss_search import search_wanted
    from .metadata_scraper import scrape_pending

    scheduler.add_job(
        poll_downloads,
        trigger=IntervalTrigger(seconds=30),
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
