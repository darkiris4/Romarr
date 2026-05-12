from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.history import HistoryEventType, HistoryItem
from ...schemas.history import HistoryItemOut

router = APIRouter()


@router.get("/", response_model=list[HistoryItemOut])
def list_history(
    event_type: HistoryEventType | None = None,
    game_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(HistoryItem).options(joinedload(HistoryItem.game).joinedload("platform"))
    if event_type:
        q = q.filter(HistoryItem.event_type == event_type)
    if game_id:
        q = q.filter(HistoryItem.game_id == game_id)
    return q.order_by(HistoryItem.date.desc()).offset(skip).limit(limit).all()
