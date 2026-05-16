from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.download_client import DownloadClient
from ...schemas.download_client import (
    DownloadClientCreate,
    DownloadClientOut,
    DownloadClientTestResult,
    DownloadClientUpdate,
)
from ...services.download_service import get_client
from ...services.event_service import log_event

router = APIRouter()


@router.get("", response_model=list[DownloadClientOut])
def list_clients(db: Session = Depends(get_db)):
    return db.query(DownloadClient).all()


@router.post("", response_model=DownloadClientOut, status_code=201)
def create_client(payload: DownloadClientCreate, db: Session = Depends(get_db)):
    client = DownloadClient(**payload.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    log_event("DownloadClient", f"Added download client \"{client.name}\" ({client.implementation})")
    return client


@router.put("/{client_id}", response_model=DownloadClientOut)
def update_client(client_id: int, payload: DownloadClientUpdate, db: Session = Depends(get_db)):
    client = db.query(DownloadClient).filter_by(id=client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(client, key, value)
    db.commit()
    db.refresh(client)
    log_event("DownloadClient", f"Updated download client \"{client.name}\"")
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(DownloadClient).filter_by(id=client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")
    log_event("DownloadClient", f"Deleted download client \"{client.name}\"")
    db.delete(client)
    db.commit()


@router.post("/{client_id}/test", response_model=DownloadClientTestResult)
async def test_client(client_id: int, db: Session = Depends(get_db)):
    model = db.query(DownloadClient).filter_by(id=client_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Download client not found")
    try:
        client = get_client(model)
        success, message = await client.test()
    except NotImplementedError as exc:
        return DownloadClientTestResult(success=False, message=str(exc))
    return DownloadClientTestResult(success=success, message=message)
