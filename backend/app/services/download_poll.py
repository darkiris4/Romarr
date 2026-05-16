"""Poll active queue items against their download clients."""

import logging

from sqlalchemy.orm import joinedload

from ..database import SessionLocal
from ..models.game import Game
from ..models.queue_item import QueueItem, QueueStatus
from .download_service import get_client
from .event_service import log_event
from .retry_service import handle_download_failure

logger = logging.getLogger(__name__)

# Consecutive not-found counts per queue item ID.
# Prevents a transient gap (SABnzbd auto-clean, API hiccup) from immediately
# triggering handle_download_failure.  Resets when the item is found again.
_not_found_streak: dict[int, int] = {}
_NOT_FOUND_THRESHOLD = 5  # ~2.5 minutes at the default 30 s poll interval


async def poll_downloads():
    db = SessionLocal()
    try:
        active = (
            db.query(QueueItem)
            .options(
                joinedload(QueueItem.game).joinedload(Game.platform),
                joinedload(QueueItem.download_client),
                joinedload(QueueItem.indexer),
            )
            .filter(QueueItem.status.in_([
                QueueStatus.QUEUED,
                QueueStatus.DOWNLOADING,
            ]))
            .all()
        )

        failed_items = []
        for item in active:
            if not item.download_client:
                continue
            try:
                client = get_client(item.download_client)
                cs = await client.status(item.download_id)
                prev_status = item.status
                item.size = cs.size
                item.size_downloaded = cs.size_downloaded

                if cs.not_found:
                    # Item absent from client — could be a transient API error or
                    # SABnzbd auto-cleaning history before we polled COMPLETED.
                    # Only treat as failure after several consecutive misses.
                    streak = _not_found_streak.get(item.id, 0) + 1
                    _not_found_streak[item.id] = streak
                    if streak < _NOT_FOUND_THRESHOLD:
                        logger.debug(
                            "Queue item %d not found in client (%d/%d), holding status",
                            item.id, streak, _NOT_FOUND_THRESHOLD,
                        )
                        continue
                    logger.warning(
                        "Queue item %d absent from client for %d consecutive polls — marking failed",
                        item.id, streak,
                    )
                    _not_found_streak.pop(item.id, None)
                    item.status = QueueStatus.FAILED
                    failed_items.append(item)
                elif cs.status == QueueStatus.COMPLETED:
                    _not_found_streak.pop(item.id, None)
                    item.status = QueueStatus.IMPORT_PENDING
                elif cs.status == QueueStatus.FAILED:
                    _not_found_streak.pop(item.id, None)
                    item.status = QueueStatus.FAILED
                    failed_items.append(item)
                else:
                    _not_found_streak.pop(item.id, None)
                    item.status = cs.status

                if item.status != prev_status:
                    if item.status == QueueStatus.DOWNLOADING:
                        log_event("Download", f"Downloading \"{item.title}\"")
                    elif item.status == QueueStatus.IMPORT_PENDING:
                        log_event("Download", f"Download complete, import pending: \"{item.title}\"")
                    elif item.status == QueueStatus.FAILED:
                        log_event("Download", f"Download failed: \"{item.title}\"")
            except Exception as exc:
                logger.warning("Poll error for queue item %d: %s", item.id, exc)

        db.commit()

        for item in failed_items:
            try:
                await handle_download_failure(db, item)
            except Exception as exc:
                logger.error("Failed to handle failure for queue item %d: %s", item.id, exc)
    finally:
        db.close()
