"""Search indexers for all wanted/monitored games."""

import logging
from datetime import datetime

from ..database import SessionLocal
from ..models.game import Game, GameStatus
from ..models.history import HistoryEventType, HistoryItem
from ..models.indexer import Indexer
from ..models.queue_item import QueueItem, QueueStatus
from .indexer_service import search_indexer

logger = logging.getLogger(__name__)


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


async def _search_games(games: list, indexers: list, db) -> None:
    for game in games:
        game.last_searched_at = datetime.utcnow()
        indexers_for_game = _filter_indexers(indexers, game.tags or "")
        grabbed = False
        for indexer in indexers_for_game:
            try:
                cats = [int(c) for c in indexer.categories.split(",") if c.strip().isdigit()]
                results = await search_indexer(indexer, game.title, categories=cats or None)
                if results:
                    results.sort(key=lambda r: r.seeders or 0, reverse=True)
                    best = results[0]
                    await _grab(db, game, indexer, best)
                    grabbed = True
                    break
            except Exception as exc:
                logger.warning("Search error for '%s' on %s: %s", game.title, indexer.name, exc)
        if not grabbed:
            db.commit()  # persist last_searched_at even when nothing was found


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
    try:
        download_id = await client.add(result.link, result.title)
    except Exception as exc:
        logger.error("Failed to add download for '%s': %s", game.title, exc)
        return

    queue_item = QueueItem(
        game_id=game.id,
        title=result.title,
        status=QueueStatus.DOWNLOADING,
        size=result.size,
        download_id=download_id,
        download_client_id=client_model.id,
        indexer_id=indexer.id,
        protocol=result.protocol,
    )
    db.add(queue_item)

    history = HistoryItem(
        game_id=game.id,
        event_type=HistoryEventType.GRABBED,
        source_title=result.title,
        indexer=indexer.name,
        download_client=client_model.name,
    )
    db.add(history)

    game.status = GameStatus.GRABBED
    db.commit()
