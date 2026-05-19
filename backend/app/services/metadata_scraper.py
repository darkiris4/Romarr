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
import os
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TypedDict

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from ..config import settings
from ..database import SessionLocal
from ..models.game import Game, GameStatus
from .igdb_service import fetch_enrichment_batch, fetch_enrichment_by_id, fetch_game_metadata, fetch_game_metadata_debug

logger = logging.getLogger(__name__)

_DEBUG_LOG = Path(settings.data_dir) / "scrape_debug.jsonl"

# ── In-process scrape state ──────────────────────────────────────────────────


class ScrapeState(TypedDict):
    running: bool
    phase: str  # 'scraping' | 'enriching'
    total: int
    processed: int
    updated: int
    failed: int
    done: bool
    error: str | None


_state: ScrapeState = {
    "running": False,
    "phase": "scraping",
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


def scrape_start(force: bool = False) -> dict:
    """Start a scrape in a background thread. Returns immediately.
    force=True re-enriches all IGDB-matched games, not just those missing fields.
    """
    with _lock:
        if _state["running"]:
            return {"already_running": True, "running": True}
        _state.update(
            {
                "running": True,
                "phase": "scraping",
                "done": False,
                "error": None,
                "total": 0,
                "processed": 0,
                "updated": 0,
                "failed": 0,
            }
        )

    t = threading.Thread(target=scrape_pending, args=(force,), daemon=True)
    t.start()
    return {"already_running": False, "running": True}


def _log_entry(entry: dict) -> None:
    """Append one JSONL line to the debug log."""
    with _DEBUG_LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def scrape_pending(force: bool = False) -> dict:
    """
    Worker: fetch IGDB metadata for unmatched games, then enrich matched games.
    force=True re-enriches all IGDB-matched games regardless of existing fields.
    Safe to call directly (scheduler) or via scrape_start() (API).
    """
    db = SessionLocal()
    updated = failed = 0

    # Overwrite log for each new run
    _DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
    _DEBUG_LOG.write_text("")
    _log_entry({"event": "run_start", "time": datetime.now(UTC).isoformat()})

    _RETRY_AFTER_DAYS = 30  # re-search unmatched games after this many days

    try:
        cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_RETRY_AFTER_DAYS)
        # Skip games already matched (igdb_id set) — they've been found.
        # Skip games searched recently that still weren't found — retry after 30 days.
        games = (
            db.query(Game)
            .filter(
                Game.cover_url.is_(None),
                Game.igdb_id.is_(None),
                or_(Game.igdb_searched_at.is_(None), Game.igdb_searched_at < cutoff),
            )
            .all()
        )

        _state["total"] = len(games)
        _state["processed"] = 0

        if not games:
            _log_entry({"event": "no_unmatched"})
            # fall through to enrichment pass

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
                game.igdb_searched_at = datetime.now(UTC).replace(tzinfo=None)
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
                    if meta.get("collection_id") is not None:
                        game.collection_id = meta["collection_id"]
                    if meta.get("collection_name"):
                        game.collection_name = meta["collection_name"]
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

        # ── Enrichment pass ──────────────────────────────────────────────────────
        # force=True  → re-enrich every IGDB-matched game (full refresh)
        # force=False → only games still missing summary / rating / collection
        enrich_query = db.query(Game).filter(Game.igdb_id.isnot(None))
        if not force:
            enrich_query = enrich_query.filter(
                or_(
                    Game.summary.is_(None),
                    Game.rating.is_(None),
                    Game.collection_id.is_(None),
                )
            )
        to_enrich = enrich_query.all()
        enriched = 0
        _state["phase"] = "enriching"
        _state["total"] = len(to_enrich)
        _state["processed"] = 0
        _log_entry({"event": "enrich_start", "total": len(to_enrich)})

        _BATCH = 50
        for i in range(0, len(to_enrich), _BATCH):
            chunk = to_enrich[i : i + _BATCH]
            ids = [g.igdb_id for g in chunk]
            try:
                batch_meta = fetch_enrichment_batch(ids)
                for game in chunk:
                    meta = batch_meta.get(game.igdb_id)
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
                        if meta.get("collection_id") is not None:
                            game.collection_id = meta["collection_id"]
                        if meta.get("collection_name"):
                            game.collection_name = meta["collection_name"]
                        enriched += 1
            except Exception as exc:
                logger.warning("Enrich batch failed for ids=%s: %s", ids, exc)
            _state["processed"] += len(chunk)
            if (i // _BATCH) % 10 == 0:
                db.commit()

        db.commit()
        _log_entry({"event": "enrich_end", "enriched": enriched})

        _log_entry(
            {
                "event": "run_end",
                "updated": updated,
                "failed": failed,
                "time": datetime.now(UTC).isoformat(),
            }
        )
        logger.info(
            "Scrape complete — updated: %d, not found: %d, enriched: %d", updated, failed, enriched
        )
        from .event_service import log_event

        log_event(
            "MetadataScraper",
            f"Scrape complete: {updated} matched, {enriched} enriched, {failed} not found",
        )
        return {"updated": updated, "failed": failed}

    except Exception as exc:
        _state["error"] = str(exc)
        _log_entry({"event": "run_error", "error": str(exc)})
        logger.error("Scrape error: %s", exc)
        from .event_service import log_event

        log_event("MetadataScraper", f"Scrape failed: {exc}")
        return {"updated": updated, "failed": failed, "error": str(exc)}
    finally:
        db.close()
        _state["running"] = False
        _state["done"] = True


def refresh_single_game(game_id: int) -> dict:
    """Re-run IGDB metadata and verify ROM file for a single game (Refresh & Scan)."""
    db = SessionLocal()
    try:
        game = db.query(Game).options(joinedload(Game.platform)).filter_by(id=game_id).first()
        if not game:
            return {"ok": False, "error": "not found"}

        # Scan: verify ROM file still exists on disk
        if game.rom_path and not os.path.exists(game.rom_path):
            game.rom_path = None
            game.checksum_crc32 = None
            game.checksum_md5 = None
            game.checksum_sha1 = None
            if game.status == GameStatus.IMPORTED:
                game.status = GameStatus.WANTED

        igdb_platform_id = getattr(game.platform, "igdb_platform_id", None)

        if game.igdb_id:
            # Already matched — refresh enrichment fields only
            meta = fetch_enrichment_by_id(game.igdb_id)
            if meta:
                if meta.get("cover_url"):
                    game.cover_url = meta["cover_url"]
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
                if meta.get("collection_id") is not None:
                    game.collection_id = meta["collection_id"]
                if meta.get("collection_name"):
                    game.collection_name = meta["collection_name"]
        else:
            # No IGDB match yet — attempt full title search
            meta = fetch_game_metadata(game.title, igdb_platform_id)
            game.igdb_searched_at = datetime.now(UTC).replace(tzinfo=None)
            if meta:
                game.igdb_id = meta["igdb_id"]
                game.cover_url = meta["cover_url"]
                if meta.get("release_year"):
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
                if meta.get("collection_id") is not None:
                    game.collection_id = meta["collection_id"]
                if meta.get("collection_name"):
                    game.collection_name = meta["collection_name"]

        db.commit()
        return {"ok": True}
    except Exception as exc:
        logger.warning("refresh_single_game failed for game %d: %s", game_id, exc)
        return {"ok": False, "error": str(exc)}
    finally:
        db.close()
