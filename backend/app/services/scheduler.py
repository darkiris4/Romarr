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


def _deduplicate():
    from ..database import SessionLocal
    from ..models.game import Game
    from sqlalchemy import func

    db = SessionLocal()
    try:
        dupes = (
            db.query(Game.checksum_crc32)
            .filter(Game.checksum_crc32.isnot(None))
            .group_by(Game.checksum_crc32)
            .having(func.count(Game.id) > 1)
            .all()
        )
        removed = 0
        for (crc32,) in dupes:
            games = db.query(Game).filter_by(checksum_crc32=crc32).all()

            def _score(g: Game) -> int:
                return (
                    (1 if g.igdb_id else 0) +
                    (1 if g.cover_url else 0) +
                    (1 if g.summary else 0) +
                    (1 if g.rating is not None else 0)
                )

            games.sort(key=_score, reverse=True)
            for duplicate in games[1:]:
                db.delete(duplicate)
                removed += 1
        if removed:
            db.commit()
            logger.info("Deduplication removed %d duplicate game record(s)", removed)
    except Exception:
        logger.exception("Deduplication job failed")
    finally:
        db.close()


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
