"""Poll active queue items against their download clients."""

import logging
from datetime import datetime, timedelta

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
# (bytes_downloaded, unix_timestamp) per item — used to compute download speed / ETA
_prev_sample: dict[int, tuple[int, float]] = {}

_not_found_streak: dict[int, int] = {}
_NOT_FOUND_THRESHOLD = 5       # ~25 s — client keeps history, missing = probably gone
_NOT_FOUND_THRESHOLD_CLEAN = 2 # ~10 s — client auto-removes, missing = probably done
# Radarr pattern: newly grabbed items may not appear in client queue immediately
# (client is still fetching/processing the NZB/torrent file).  Skip not-found
# handling until the item is old enough for absence to be meaningful.
_GRAB_GRACE_SECONDS = 300      # 5 minutes


def _refresh_eta(item, cs) -> None:
    """Update estimated_completion from current download speed; clear when not downloading."""
    from ..models.queue_item import QueueStatus as QS
    if cs.not_found or cs.size <= 0 or cs.size_downloaded <= 0 or cs.status != QS.DOWNLOADING:
        _prev_sample.pop(item.id, None)
        item.estimated_completion = None
        return
    now_ts = datetime.utcnow().timestamp()
    prev = _prev_sample.get(item.id)
    _prev_sample[item.id] = (cs.size_downloaded, now_ts)
    if prev is None:
        return
    prev_dl, prev_ts = prev
    elapsed = now_ts - prev_ts
    delta = cs.size_downloaded - prev_dl
    if elapsed <= 0 or delta <= 0:
        return
    speed_bps = delta / elapsed
    remaining = cs.size - cs.size_downloaded
    if remaining <= 0:
        return
    item.estimated_completion = datetime.utcnow() + timedelta(seconds=remaining / speed_bps)


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
                _refresh_eta(item, cs)

                status_logged = False
                if cs.encrypted:
                    # SABnzbd detected a password-protected archive — fail immediately,
                    # same path as an explicit client failure (blocklist + auto-retry).
                    _not_found_streak.pop(item.id, None)
                    item.status = QueueStatus.FAILED
                    item.error_message = "Encrypted / password-protected archive"
                    failed_items.append(item)
                    log_event("Download", f"Encrypted archive detected, failing: \"{item.title}\"")
                    status_logged = True
                elif cs.not_found:
                    # Item absent from client — either a transient API gap or the
                    # client auto-cleaned it after completion.
                    #
                    # Radarr pattern: apply a grace period for newly grabbed items.
                    # Clients need time to fetch/process the NZB or torrent file
                    # before the job appears in the queue API.  Absence during this
                    # window is expected, not a sign the download is done or failed.
                    age_s = (datetime.utcnow() - item.added_at).total_seconds()
                    if age_s < _GRAB_GRACE_SECONDS:
                        logger.debug(
                            "Queue item %d not found in client but within grace period (%ds old), skipping",
                            item.id, int(age_s),
                        )
                        continue
                    # Grace period expired — use streak counter.
                    # When the client is configured to remove completed downloads
                    # (remove_completed=True), a missing item is almost certainly
                    # done — treat it as completed.  Otherwise fall back to a higher
                    # streak threshold so a single transient miss doesn't trigger
                    # the failure cascade.
                    threshold = (
                        _NOT_FOUND_THRESHOLD_CLEAN
                        if item.download_client.remove_completed
                        else _NOT_FOUND_THRESHOLD
                    )
                    streak = _not_found_streak.get(item.id, 0) + 1
                    _not_found_streak[item.id] = streak
                    if streak < threshold:
                        logger.debug(
                            "Queue item %d not found in client (%d/%d), holding status",
                            item.id, streak, threshold,
                        )
                        continue
                    _not_found_streak.pop(item.id, None)
                    if item.download_client.remove_completed:
                        item.status = QueueStatus.IMPORT_PENDING
                        log_event(
                            "Download",
                            f"Download complete (auto-removed by client), import pending: \"{item.title}\"",
                        )
                        status_logged = True
                    else:
                        logger.warning(
                            "Queue item %d absent from client for %d consecutive polls — marking failed",
                            item.id, streak,
                        )
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

                if item.status != prev_status and not status_logged:
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
