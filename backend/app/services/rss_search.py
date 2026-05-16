"""Search indexers for all wanted/monitored games."""

import logging

from ..database import SessionLocal
from ..models.game import Game, GameStatus
from ..models.history import HistoryEventType, HistoryItem
from ..models.indexer import Indexer
from ..models.queue_item import QueueItem, QueueStatus
from .indexer_service import search_indexer

logger = logging.getLogger(__name__)


async def search_wanted():
    db = SessionLocal()
    try:
        wanted = db.query(Game).filter_by(status=GameStatus.WANTED, monitored=True).all()
        indexers = db.query(Indexer).filter_by(enabled=True).all()
        for game in wanted:
            for indexer in indexers:
                try:
                    cats = [int(c) for c in indexer.categories.split(",") if c.strip().isdigit()]
                    results = await search_indexer(indexer, game.title, categories=cats or None)
                    if results:
                        results.sort(key=lambda r: r.seeders or 0, reverse=True)
                        best = results[0]
                        await _grab(db, game, indexer, best)
                        break
                except Exception as exc:
                    logger.warning("Search error for '%s' on %s: %s", game.title, indexer.name, exc)
    finally:
        db.close()


async def _grab(db, game, indexer, result):
    from ..models.download_client import DownloadClient
    from .download_service import get_client

    client_model = db.query(DownloadClient).filter_by(enabled=True).first()
    if not client_model:
        return

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
