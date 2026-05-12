"""
APScheduler-based background task runner.
All periodic work (RSS sync, download polling, wanted search) lives here.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start():
    if not scheduler.running:
        scheduler.start()
        _register_jobs()
        logger.info("Scheduler started")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)


def _register_jobs():
    from .download_poll import poll_downloads
    from .rss_search import search_wanted

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
