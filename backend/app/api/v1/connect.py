import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.connection import Connection
from ...services.event_service import log_event
from ...services.notification_service import test_connection

router = APIRouter()


class ConnectionBase(BaseModel):
    name: str
    type: str
    config: dict = {}
    tags: str = ""
    on_grab: bool = True
    on_import: bool = True
    on_upgrade: bool = True
    on_rename: bool = False
    on_delete: bool = False
    on_health_issue: bool = True
    on_download_failure: bool = True
    enabled: bool = True


class ConnectionOut(ConnectionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        d = {
            "id": obj.id,
            "name": obj.name,
            "type": obj.type,
            "config": json.loads(obj.config_json or "{}"),
            "tags": obj.tags or "",
            "on_grab": obj.on_grab,
            "on_import": obj.on_import,
            "on_upgrade": obj.on_upgrade,
            "on_rename": obj.on_rename,
            "on_delete": obj.on_delete,
            "on_health_issue": obj.on_health_issue,
            "on_download_failure": obj.on_download_failure,
            "enabled": obj.enabled,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
        }
        return cls(**d)


class TestResult(BaseModel):
    success: bool
    message: str


def _to_orm(payload: ConnectionBase) -> dict:
    d = payload.model_dump()
    config = d.pop("config", {})
    d["config_json"] = json.dumps(config)
    return d


@router.get("", response_model=list[ConnectionOut])
def list_connections(db: Session = Depends(get_db)):
    return [ConnectionOut.model_validate(c) for c in db.query(Connection).all()]


@router.post("", response_model=ConnectionOut, status_code=201)
def create_connection(payload: ConnectionBase, db: Session = Depends(get_db)):
    conn = Connection(**_to_orm(payload))
    db.add(conn)
    db.commit()
    db.refresh(conn)
    log_event("Connect", f'Added connection "{conn.name}" ({conn.type})')
    return ConnectionOut.model_validate(conn)


@router.put("/{conn_id}", response_model=ConnectionOut)
def update_connection(conn_id: int, payload: ConnectionBase, db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(id=conn_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    for key, value in _to_orm(payload).items():
        setattr(conn, key, value)
    db.commit()
    db.refresh(conn)
    log_event("Connect", f'Updated connection "{conn.name}"')
    return ConnectionOut.model_validate(conn)


@router.delete("/{conn_id}", status_code=204)
def delete_connection(conn_id: int, db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(id=conn_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    log_event("Connect", f'Deleted connection "{conn.name}"')
    db.delete(conn)
    db.commit()


@router.post("/{conn_id}/test", response_model=TestResult)
def test_connection_endpoint(conn_id: int, db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(id=conn_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    success, message = test_connection(conn.type, conn.config_json)
    return TestResult(success=success, message=message)
