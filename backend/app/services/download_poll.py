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
                QueueStatus.IMPORT_PENDING,
            ]))
            .all()
        )

        failed_items = []
        for item in active:
            if not item.download_client:
                continue
            try:
                client = get_client(item.download_client)
                status = await client.status(item.download_id)
                prev_status = item.status
                item.size = status.size
                item.size_downloaded = status.size_downloaded

                if status.status == QueueStatus.COMPLETED:
                    item.status = QueueStatus.IMPORT_PENDING
                elif status.status == QueueStatus.FAILED:
                    item.status = QueueStatus.FAILED
                    failed_items.append(item)
                else:
                    item.status = status.status

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
