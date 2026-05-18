"""Search indexers for all wanted/monitored games."""

import json
import logging
import re
from datetime import datetime, timedelta

from ..database import SessionLocal
from ..models.delay_profile import DelayProfile
from ..models.game import Game, GameStatus
from ..models.history import HistoryEventType, HistoryItem
from ..models.indexer import Indexer
from ..models.queue_item import QueueItem, QueueStatus
from ..models.release_profile import ReleaseProfile
from .indexer_service import search_indexer

logger = logging.getLogger(__name__)

_HACK_RE = re.compile(r"\((Hack|Translation|Pirate)\)", re.IGNORECASE)
_UNL_RE = re.compile(r"\(Unl\)", re.IGNORECASE)
_REGION_RE = re.compile(r"\(([^)]+)\)")


def _filter_indexers(indexers: list, game_tags: str) -> list:
    """Return indexers matching the game's tags, falling back to untagged ones."""
    tag_set = {t.strip().lower() for t in (game_tags or "").split(",") if t.strip()}
    if not tag_set:
        return indexers
    matching = [
        i
        for i in indexers
        if any(t.strip().lower() in tag_set for t in (i.tags or "").split(",") if t.strip())
    ]
    if not matching:
        matching = [i for i in indexers if not (i.tags or "").strip()]
    return matching or indexers


def _get_release_profile(game: Game, db) -> ReleaseProfile | None:
    """Resolve effective release profile: game override → platform default → global default."""
    if game.release_profile_id:
        rp = db.query(ReleaseProfile).filter_by(id=game.release_profile_id).first()
        if rp:
            return rp
    if game.platform and game.platform.release_profile_id:
        rp = db.query(ReleaseProfile).filter_by(id=game.platform.release_profile_id).first()
        if rp:
            return rp
    return db.query(ReleaseProfile).filter_by(is_default=True).first()


def _get_delay_profile(game: Game, db) -> DelayProfile | None:
    """Resolve delay profile by tag matching; fall back to default (empty tags)."""
    game_tags = {t.strip().lower() for t in (game.tags or "").split(",") if t.strip()}
    all_profiles = db.query(DelayProfile).all()
    if game_tags:
        for dp in all_profiles:
            dp_tags = {t.strip().lower() for t in (dp.tags or "").split(",") if t.strip()}
            if dp_tags and dp_tags & game_tags:
                return dp
    return next((dp for dp in all_profiles if dp.is_default), None)


def _region_score(title: str, priority: list[str]) -> int:
    """Lower = better. Return position of first matching region in priority list."""
    m = _REGION_RE.search(title)
    region_str = m.group(1) if m else ""
    parts = [r.strip() for r in region_str.split(",")]
    for i, prio in enumerate(priority):
        if any(prio.lower() in p.lower() for p in parts):
            return i
    return len(priority)


def _apply_release_profile(results: list, profile: ReleaseProfile | None) -> list:
    """Filter and sort results according to the release profile."""
    if not profile:
        return results

    try:
        region_priority = json.loads(profile.region_priority or "[]")
    except Exception:
        region_priority = []

    filtered = []
    for r in results:
        title = r.title if hasattr(r, "title") else r.get("title", "")
        if not profile.accept_hacks and _HACK_RE.search(title):
            continue
        if not profile.accept_unlicensed and _UNL_RE.search(title):
            continue
        filtered.append(r)

    if region_priority:
        filtered.sort(
            key=lambda r: (
                _region_score(
                    r.title if hasattr(r, "title") else r.get("title", ""), region_priority
                ),
                -(r.seeders if hasattr(r, "seeders") and r.seeders else 0),
            )
        )
    else:
        filtered.sort(key=lambda r: -(r.seeders if hasattr(r, "seeders") and r.seeders else 0))

    return filtered


def _apply_delay_protocol(results: list, delay_profile: DelayProfile | None) -> list:
    """Sort results by preferred protocol."""
    if not delay_profile or delay_profile.preferred_protocol == "any":
        return results
    proto = delay_profile.preferred_protocol
    return sorted(
        results,
        key=lambda r: (
            0 if (r.protocol if hasattr(r, "protocol") else r.get("protocol", "")) == proto else 1,
            -(r.seeders if hasattr(r, "seeders") and r.seeders else 0),
        ),
    )


async def _search_games(games: list, indexers: list, db) -> None:
    for game in games:
        game.last_searched_at = datetime.utcnow()
        release_profile = _get_release_profile(game, db)
        delay_profile = _get_delay_profile(game, db)

        indexers_for_game = _filter_indexers(indexers, game.tags or "")
        all_results = []
        for indexer in indexers_for_game:
            try:
                cats = [int(c) for c in indexer.categories.split(",") if c.strip().isdigit()]
                results = await search_indexer(indexer, game.title, categories=cats or None)
                all_results.extend(results)
            except Exception as exc:
                logger.warning("Search error for '%s' on %s: %s", game.title, indexer.name, exc)

        if not all_results:
            db.commit()
            continue

        all_results = _apply_release_profile(all_results, release_profile)
        all_results = _apply_delay_protocol(all_results, delay_profile)

        if not all_results:
            db.commit()
            continue

        # Delay enforcement
        bypass = delay_profile.bypass_if_only_one if delay_profile else True
        usenet_delay = delay_profile.usenet_delay if delay_profile else 0
        torrent_delay = delay_profile.torrent_delay if delay_profile else 0
        best = all_results[0]
        best_proto = best.protocol if hasattr(best, "protocol") else ""
        delay_mins = usenet_delay if "usenet" in best_proto else torrent_delay

        if delay_mins > 0 and not (bypass and len(all_results) == 1):
            if game.delay_grab_until is None:
                game.delay_grab_until = datetime.utcnow() + timedelta(minutes=delay_mins)
                logger.info("Delay profile: holding '%s' for %d min", game.title, delay_mins)
                db.commit()
                continue
            if datetime.utcnow() < game.delay_grab_until:
                db.commit()
                continue
            game.delay_grab_until = None

        best_indexer = indexers_for_game[0]
        for idx in indexers_for_game:
            if hasattr(best, "indexer") and best.indexer == idx.name:
                best_indexer = idx
                break

        await _grab(db, game, best_indexer, best)


async def search_wanted():
    db = SessionLocal()
    try:
        wanted = db.query(Game).filter_by(status=GameStatus.WANTED, monitored=True).all()
        indexers = db.query(Indexer).filter_by(enabled=True).all()
        await _search_games(wanted, indexers, db)
    finally:
        db.close()


async def search_wanted_for_ids(ids: list[int]):
    """Same as search_wanted but restricted to specific game IDs."""
    db = SessionLocal()
    try:
        wanted = (
            db.query(Game)
            .filter(
                Game.id.in_(ids),
                Game.status == GameStatus.WANTED,
                Game.monitored == True,  # noqa: E712
            )
            .all()
        )
        indexers = db.query(Indexer).filter_by(enabled=True).all()
        await _search_games(wanted, indexers, db)
    finally:
        db.close()


async def _grab(db, game, indexer, result):
    from ..models.download_client import DownloadClient
    from .download_service import get_client

    clients = db.query(DownloadClient).filter_by(enabled=True).all()
    if not clients:
        return

    # Tag-aware client selection
    game_tag_set = {t.strip().lower() for t in (game.tags or "").split(",") if t.strip()}
    if game_tag_set:
        tag_matched = [
            c
            for c in clients
            if any(
                t.strip().lower() in game_tag_set for t in (c.tags or "").split(",") if t.strip()
            )
        ]
        if not tag_matched:
            tag_matched = [c for c in clients if not (c.tags or "").strip()]
        if tag_matched:
            clients = tag_matched

    client_model = clients[0]
    client = get_client(client_model)
    title = result.title if hasattr(result, "title") else result.get("title", "")
    link = result.link if hasattr(result, "link") else result.get("link", "")
    protocol = result.protocol if hasattr(result, "protocol") else result.get("protocol", "")
    size = result.size if hasattr(result, "size") else result.get("size", 0)
    try:
        download_id = await client.add(link, title)
    except Exception as exc:
        logger.error("Failed to add download for '%s': %s", game.title, exc)
        return

    queue_item = QueueItem(
        game_id=game.id,
        title=title,
        status=QueueStatus.DOWNLOADING,
        size=size,
        download_id=download_id,
        download_client_id=client_model.id,
        indexer_id=indexer.id,
        protocol=protocol,
    )
    db.add(queue_item)

    history = HistoryItem(
        game_id=game.id,
        event_type=HistoryEventType.GRABBED,
        source_title=title,
        indexer=indexer.name,
        download_client=client_model.name,
    )
    db.add(history)

    game.status = GameStatus.GRABBED
    db.commit()
