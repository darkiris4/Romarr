from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.indexer import Indexer
from ...schemas.indexer import IndexerCreate, IndexerOut, IndexerTestResult, IndexerUpdate
from ...services.indexer_service import test_indexer

router = APIRouter()


@router.get("", response_model=list[IndexerOut])
def list_indexers(db: Session = Depends(get_db)):
    return db.query(Indexer).all()


@router.post("", response_model=IndexerOut, status_code=201)
def create_indexer(payload: IndexerCreate, db: Session = Depends(get_db)):
    indexer = Indexer(**payload.model_dump())
    db.add(indexer)
    db.commit()
    db.refresh(indexer)
    return indexer


@router.put("/{indexer_id}", response_model=IndexerOut)
def update_indexer(indexer_id: int, payload: IndexerUpdate, db: Session = Depends(get_db)):
    indexer = db.query(Indexer).filter_by(id=indexer_id).first()
    if not indexer:
        raise HTTPException(status_code=404, detail="Indexer not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(indexer, key, value)
    db.commit()
    db.refresh(indexer)
    return indexer


@router.delete("/{indexer_id}", status_code=204)
def delete_indexer(indexer_id: int, db: Session = Depends(get_db)):
    indexer = db.query(Indexer).filter_by(id=indexer_id).first()
    if not indexer:
        raise HTTPException(status_code=404, detail="Indexer not found")
    db.delete(indexer)
    db.commit()


@router.post("/{indexer_id}/test", response_model=IndexerTestResult)
async def test_indexer_connection(indexer_id: int, db: Session = Depends(get_db)):
    indexer = db.query(Indexer).filter_by(id=indexer_id).first()
    if not indexer:
        raise HTTPException(status_code=404, detail="Indexer not found")
    success, message = await test_indexer(indexer)
    return IndexerTestResult(success=success, message=message)
