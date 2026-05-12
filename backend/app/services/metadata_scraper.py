"""
Background metadata scraper.
Finds imported games with no cover art and enriches them via IGDB.

scrape_start()  — kicks off a daemon thread; returns immediately
scrape_status() — returns current progress (safe to call any time)
scrape_log()    — returns entries from the last run's debug log
scrape_pending  — the actual worker, also called by the scheduler
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict

from ..config import settings
from ..database import SessionLocal
from ..models.game import Game
from .igdb_service import fetch_game_metadata_debug, fetch_enrichment_by_id

logger = logging.getLogger(__name__)

_DEBUG_LOG = Path(settings.data_dir) / "scrape_debug.jsonl"

# ── In-process scrape state ──────────────────────────────────────────────────

class ScrapeState(TypedDict):
    running: bool
    total: int
    processed: int
    updated: int
    failed: int
    done: bool
    error: str | None

_state: ScrapeState = {
    "running": False,
    "total": 0,
    "processed": 0,
    "updated": 0,
    "failed": 0,
    "done": False,
    "error": None,
}
_lock = threading.Lock()


def scrape_status() -> ScrapeState:
    return dict(_state)  # type: ignore[return-value]


def scrape_log(limit: int = 500) -> list[dict]:
    """Return the last `limit` entries from the debug log (most recent last)."""
    if not _DEBUG_LOG.exists():
        return []
    lines = _DEBUG_LOG.read_text().splitlines()
    entries = []
    for line in lines[-limit:]:
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return entries


def scrape_start() -> dict:
    """Start a scrape in a background thread. Returns immediately."""
    with _lock:
        if _state["running"]:
            return {"already_running": True, "running": True}
        _state.update({
            "running": True, "done": False, "error": None,
            "total": 0, "processed": 0, "updated": 0, "failed": 0,
        })

    t = threading.Thread(target=scrape_pending, daemon=True)
    t.start()
    return {"already_running": False, "running": True}


def _log_entry(entry: dict) -> None:
    """Append one JSONL line to the debug log."""
    with _DEBUG_LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def scrape_pending() -> dict:
    """
    Worker: fetch IGDB metadata for every game with no cover_url.
    Safe to call directly (scheduler) or via scrape_start() (API).
    """
    db = SessionLocal()
    updated = failed = 0

    # Overwrite log for each new run
    _DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
    _DEBUG_LOG.write_text("")
    _log_entry({"event": "run_start", "time": datetime.now(timezone.utc).isoformat()})

    try:
        # Skip games already matched in IGDB (igdb_id set) but without a cover —
        # those were confirmed to have no cover image in IGDB and don't need retrying.
        games = (
            db.query(Game)
            .filter(Game.cover_url.is_(None), Game.igdb_id.is_(None))
            .all()
        )

        _state["total"] = len(games)
        _state["processed"] = 0

        if not games:
            _log_entry({"event": "run_end", "updated": 0, "failed": 0})
            return {"updated": 0, "failed": 0}

        for game in games:
            igdb_platform_id = getattr(game.platform, "igdb_platform_id", None)
            platform_name = getattr(game.platform, "name", None)
            entry: dict = {
                "game_id": game.id,
                "title": game.title,
                "platform": platform_name,
                "igdb_platform_id": igdb_platform_id,
            }
            try:
                meta, detail = fetch_game_metadata_debug(game.title, igdb_platform_id)
                entry["queries"] = detail
                if meta:
                    game.igdb_id = meta["igdb_id"]
                    game.cover_url = meta["cover_url"]
                    if meta["release_year"]:
                        game.release_year = meta["release_year"]
                    if meta.get("summary"):
                        game.summary = meta["summary"]
                    if meta.get("rating") is not None:
                        game.rating = meta["rating"]
                    if meta.get("game_modes"):
                        game.game_modes = meta["game_modes"]
                    if meta.get("themes"):
                        game.themes = meta["themes"]
                    if meta.get("similar_games"):
                        game.similar_games = meta["similar_games"]
                    entry["result"] = "matched"
                    entry["igdb_id"] = meta["igdb_id"]
                    entry["cover_url"] = meta["cover_url"]
                    updated += 1
                else:
                    entry["result"] = "not_found"
                    failed += 1
            except Exception as exc:
                logger.warning("IGDB lookup failed for %r: %s", game.title, exc)
                entry["result"] = "error"
                entry["error"] = str(exc)
                failed += 1

            _log_entry(entry)
            _state["processed"] += 1
            _state["updated"] = updated
            _state["failed"] = failed

            if _state["processed"] % 25 == 0:
                db.commit()

        db.commit()

        # ── Enrichment pass: fill new fields for already-matched games ──
        from sqlalchemy import or_
        to_enrich = (
            db.query(Game)
            .filter(
                Game.igdb_id.isnot(None),
                or_(Game.summary.is_(None), Game.rating.is_(None)),
            )
            .all()
        )
        enriched = 0
        _log_entry({"event": "enrich_start", "total": len(to_enrich)})
        for game in to_enrich:
            try:
                meta = fetch_enrichment_by_id(game.igdb_id)
                if meta:
                    if meta.get("summary"):
                        game.summary = meta["summary"]
                    if meta.get("rating") is not None:
                        game.rating = meta["rating"]
                    if meta.get("game_modes"):
                        game.game_modes = meta["game_modes"]
                    if meta.get("themes"):
                        game.themes = meta["themes"]
                    if meta.get("similar_games"):
                        game.similar_games = meta["similar_games"]
                    enriched += 1
            except Exception as exc:
                logger.warning("Enrich failed for igdb_id=%s: %s", game.igdb_id, exc)
        db.commit()
        _log_entry({"event": "enrich_end", "enriched": enriched})

        _log_entry({"event": "run_end", "updated": updated, "failed": failed,
                    "time": datetime.now(timezone.utc).isoformat()})
        logger.info("Scrape complete — updated: %d, not found: %d, enriched: %d", updated, failed, enriched)
        return {"updated": updated, "failed": failed}

    except Exception as exc:
        _state["error"] = str(exc)
        _log_entry({"event": "run_error", "error": str(exc)})
        logger.error("Scrape error: %s", exc)
        return {"updated": updated, "failed": failed, "error": str(exc)}
    finally:
        db.close()
        _state["running"] = False
        _state["done"] = True
