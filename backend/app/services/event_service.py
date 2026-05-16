import logging

logger = logging.getLogger(__name__)

_MAX_EVENTS = 1000


def log_event(component: str, message: str) -> None:
    from ..database import SessionLocal
    from ..models.app_event import AppEvent

    db = SessionLocal()
    try:
        db.add(AppEvent(component=component, message=message))
        db.flush()
        count = db.query(AppEvent).count()
        if count > _MAX_EVENTS:
            cutoff_ids = (
                db.query(AppEvent.id)
                .order_by(AppEvent.created_at.asc())
                .limit(count - _MAX_EVENTS)
                .subquery()
            )
            db.query(AppEvent).filter(AppEvent.id.in_(cutoff_ids)).delete(synchronize_session=False)
        db.commit()
    except Exception:
        logger.exception("Failed to log event")
    finally:
        db.close()


def get_events(page: int = 1, per_page: int = 50) -> dict:
    from ..database import SessionLocal
    from ..models.app_event import AppEvent

    db = SessionLocal()
    try:
        total = db.query(AppEvent).count()
        rows = (
            db.query(AppEvent)
            .order_by(AppEvent.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return {
            "total": total,
            "page": page,
            "per_page": per_page,
            "events": [
                {
                    "id": e.id,
                    "component": e.component,
                    "message": e.message,
                    "created_at": e.created_at.isoformat(),
                }
                for e in rows
            ],
        }
    finally:
        db.close()


def clear_events() -> None:
    from ..database import SessionLocal
    from ..models.app_event import AppEvent

    db = SessionLocal()
    try:
        db.query(AppEvent).delete()
        db.commit()
    finally:
        db.close()
