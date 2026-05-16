from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.game import Game, GameStatus
from ...models.queue_item import QueueItem, QueueStatus
from ...schemas.queue_item import QueueItemOut

router = APIRouter()


@router.get("", response_model=list[QueueItemOut])
def list_queue(db: Session = Depends(get_db)):
    return (
        db.query(QueueItem)
        .options(
            joinedload(QueueItem.game).joinedload(Game.platform),
            joinedload(QueueItem.indexer),
            joinedload(QueueItem.download_client),
        )
        .order_by(QueueItem.added_at.desc())
        .all()
    )


@router.post("/poll", status_code=204)
async def manual_poll():
    """Trigger an immediate download status poll outside the scheduler cycle."""
    from ...services.download_poll import poll_downloads
    await poll_downloads()


@router.post("/{item_id}/import")
async def import_queue_item(item_id: int, db: Session = Depends(get_db)):
    from ...services.import_service import import_downloaded_file

    item = (
        db.query(QueueItem)
        .options(
            joinedload(QueueItem.game).joinedload(Game.platform),
            joinedload(QueueItem.download_client),
            joinedload(QueueItem.indexer),
        )
        .filter_by(id=item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    if item.status != QueueStatus.IMPORT_PENDING:
        raise HTTPException(status_code=400, detail="Item is not pending import")
    try:
        return await import_downloaded_file(db, item)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.delete("/{item_id}", status_code=204)
def remove_from_queue(
    item_id: int, remove_from_client: bool = False, db: Session = Depends(get_db)
):
    item = db.query(QueueItem).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    game_id = item.game_id
    db.delete(item)
    db.flush()
    remaining = db.query(QueueItem).filter_by(game_id=game_id).count()
    if remaining == 0:
        game = db.query(Game).filter_by(id=game_id).first()
        if game and game.status == GameStatus.GRABBED:
            game.status = GameStatus.WANTED
    db.commit()
