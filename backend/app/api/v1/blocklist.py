from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.blocklist import BlocklistItem
from ...schemas.blocklist import BlocklistCreate, BlocklistOut

router = APIRouter()


@router.get("", response_model=list[BlocklistOut])
def list_blocklist(db: Session = Depends(get_db)):
    return (
        db.query(BlocklistItem)
        .options(joinedload(BlocklistItem.game))
        .order_by(BlocklistItem.added_at.desc())
        .all()
    )


@router.post("", response_model=BlocklistOut, status_code=201)
def add_to_blocklist(payload: BlocklistCreate, db: Session = Depends(get_db)):
    item = BlocklistItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return db.query(BlocklistItem).options(joinedload(BlocklistItem.game)).filter_by(id=item.id).one()


@router.delete("/{item_id}", status_code=204)
def remove_from_blocklist(item_id: int, db: Session = Depends(get_db)):
    item = db.query(BlocklistItem).filter_by(id=item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Blocklist entry not found")
    db.delete(item)
    db.commit()
