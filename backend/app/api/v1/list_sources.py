from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.list_source import ListSource

router = APIRouter()


class ListSourceIn(BaseModel):
    name: str
    plugin: str
    enabled: bool = True
    config: str = "{}"


class ListSourceOut(BaseModel):
    id: int
    name: str
    plugin: str
    enabled: bool
    config: str
    last_sync: datetime | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ListSourceOut])
def list_sources(db: Session = Depends(get_db)):
    return db.query(ListSource).order_by(ListSource.id).all()


@router.post("", response_model=ListSourceOut, status_code=201)
def create_source(payload: ListSourceIn, db: Session = Depends(get_db)):
    source = ListSource(**payload.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.put("/{source_id}", response_model=ListSourceOut)
def update_source(source_id: int, payload: ListSourceIn, db: Session = Depends(get_db)):
    source = db.query(ListSource).filter_by(id=source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="List source not found")
    for k, v in payload.model_dump().items():
        setattr(source, k, v)
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: int, db: Session = Depends(get_db)):
    source = db.query(ListSource).filter_by(id=source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="List source not found")
    db.delete(source)
    db.commit()


@router.post("/{source_id}/sync")
async def sync_source(source_id: int, db: Session = Depends(get_db)):
    source = db.query(ListSource).filter_by(id=source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="List source not found")
    from ...services.list_service import sync_list_source

    try:
        added = await sync_list_source(db, source)
        source.last_sync = datetime.utcnow()
        db.commit()
        return {"added": added}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
