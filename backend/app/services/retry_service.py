"""Handles failed downloads: blocklist, history, remove from client, auto-retry."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models.blocklist import BlocklistItem
from ..models.download_client import DownloadClient
from ..models.game import Game, GameStatus
from ..models.history import HistoryEventType, HistoryItem
from ..models.indexer import Indexer
from ..models.queue_item import QueueItem, QueueStatus
from .download_service import get_client
from .event_service import log_event
from .indexer_service import search_indexer
from .search_utils import normalize_title, other_platform_re, sanitize_query

logger = logging.getLogger(__name__)


async def handle_download_failure(db: Session, item: QueueItem) -> None:
    """Blocklist the failed release, write history, remove from client, and auto-retry."""
    client_name = item.download_client.name if item.download_client else ""
    indexer_name = item.indexer.name if item.indexer else ""
    game = item.game

    db.add(HistoryItem(
        game_id=item.game_id,
        event_type=HistoryEventType.IMPORT_FAILED,
        source_title=item.title,
        indexer=indexer_name,
        download_client=client_name,
    ))
    db.add(BlocklistItem(
        game_id=item.game_id,
        source_title=item.title,
        indexer=indexer_name,
        protocol=item.protocol,
        reason="downloadFailed",
    ))
    db.commit()

    if item.download_client and item.download_id:
        try:
            client = get_client(item.download_client)
            await client.remove(item.download_id)
        except Exception as exc:
            logger.warning("Could not remove failed download %s from client: %s", item.download_id, exc)

    failed_title = item.title
    db.delete(item)
    db.commit()

    log_event("Download", f"Download failed, blocklisted \"{failed_title}\" — searching for next release")

    await _auto_retry(db, game)


async def _auto_retry(db: Session, game: Game) -> None:
    """Search indexers and grab the best non-blocklisted release for the game."""
    blocked = {b.source_title for b in db.query(BlocklistItem).filter_by(game_id=game.id).all()}

    query = sanitize_query(normalize_title(game.title))
    platform_no_intro = game.platform.no_intro_name if game.platform else None
    cross_platform_re = other_platform_re(platform_no_intro) if platform_no_intro else None

    indexers = db.query(Indexer).filter_by(enabled=True).all()
    candidates = []
    for indexer in indexers:
        try:
            cats = [int(c) for c in (indexer.categories or "").split(",") if c.strip().isdigit()]
            results = await search_indexer(indexer, query, categories=cats or None)
            for r in results:
                if r.title in blocked:
                    continue
                if cross_platform_re and cross_platform_re.search(r.title):
                    continue
                candidates.append(r)
        except Exception as exc:
            logger.warning("Auto-retry search failed for indexer '%s': %s", indexer.name, exc)

    if not candidates:
        game.status = GameStatus.WANTED
        db.commit()
        log_event("Download", f"No alternative releases found for \"{game.title}\" — reset to Wanted")
        return

    candidates.sort(key=lambda r: r.seeders or 0, reverse=True)
    best = candidates[0]

    clients = db.query(DownloadClient).filter_by(enabled=True).order_by(DownloadClient.priority).all()
    if not clients:
        game.status = GameStatus.WANTED
        db.commit()
        log_event("Download", f"No download clients available — \"{game.title}\" reset to Wanted")
        return

    client_model = clients[0]
    dl_client = get_client(client_model)

    try:
        download_id = await dl_client.add(best.link, best.title)
    except Exception as exc:
        logger.error("Auto-retry grab failed for '%s': %s", best.title, exc)
        game.status = GameStatus.WANTED
        db.commit()
        log_event("Download", f"Auto-retry grab error for \"{game.title}\" — reset to Wanted")
        return

    db.add(QueueItem(
        game_id=game.id,
        title=best.title,
        status=QueueStatus.QUEUED,
        size=best.size or 0,
        download_id=download_id,
        download_client_id=client_model.id,
        protocol=best.protocol,
    ))
    db.add(HistoryItem(
        game_id=game.id,
        event_type=HistoryEventType.GRABBED,
        source_title=best.title,
        indexer=best.indexer,
        download_client=client_model.name,
    ))
    game.status = GameStatus.GRABBED
    db.commit()

    log_event("Download", f"Auto-retry grabbed \"{best.title}\" for \"{game.title}\" via {client_model.name}")
