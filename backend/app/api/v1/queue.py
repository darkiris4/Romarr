from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.queue_item import QueueItem
from ...schemas.queue_item import QueueItemOut

router = APIRouter()


@router.get("", response_model=list[QueueItemOut])
def list_queue(db: Session = Depends(get_db)):
    return (
        db.query(QueueItem)
        .options(joinedload(QueueItem.game).joinedload("platform"))
        .order_by(QueueItem.added_at.desc())
        .all()
    )


@router.delete("/{item_id}", status_code=204)
def remove_from_queue(
    item_id: int, remove_from_client: bool = False, db: Session = Depends(get_db)
):
    item = db.query(QueueItem).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    db.delete(item)
    db.commit()
