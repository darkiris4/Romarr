"""Poll active queue items against their download clients."""

import logging

from ..database import SessionLocal
from ..models.queue_item import QueueItem, QueueStatus
from .download_service import get_client
from .event_service import log_event

logger = logging.getLogger(__name__)


async def poll_downloads():
    db = SessionLocal()
    try:
        active = (
            db.query(QueueItem)
            .filter(QueueItem.status.in_([
                QueueStatus.QUEUED,
                QueueStatus.DOWNLOADING,
                QueueStatus.IMPORT_PENDING,
            ]))
            .all()
        )
        for item in active:
            if not item.download_client:
                continue
            try:
                client = get_client(item.download_client)
                status = await client.status(item.download_id)
                prev_status = item.status
                item.status = status.status
                item.size = status.size
                item.size_downloaded = status.size_downloaded
                if status.status == QueueStatus.COMPLETED:
                    item.status = QueueStatus.IMPORT_PENDING
                # Log meaningful transitions only
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
    finally:
        db.close()
