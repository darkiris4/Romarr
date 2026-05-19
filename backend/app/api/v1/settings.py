import json
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.remote_path_mapping import RemotePathMapping
from ...models.root_folder import RootFolder
from ...services.config_service import get_config, set_config

router = APIRouter()


class RootFolderCreate(BaseModel):
    path: str


def _fmt_bytes(n: int) -> str:
    for unit, div in [("TiB", 1 << 40), ("GiB", 1 << 30), ("MiB", 1 << 20), ("KiB", 1 << 10)]:
        if n >= div:
            v = n / div
            return (
                f"{v:.2f} {unit}" if v < 10 else f"{v:.1f} {unit}" if v < 100 else f"{v:.0f} {unit}"
            )
    return f"{n} B"


def _folder_info(path: str) -> dict:
    p = Path(path)
    if p.exists() and p.is_dir():
        usage = shutil.disk_usage(path)
        free_str = _fmt_bytes(usage.free)
        try:
            unmapped = len([d for d in p.iterdir() if d.is_dir()])
        except PermissionError:
            unmapped = 0
    else:
        free_str = "—"
        unmapped = 0
    return {"free_space": free_str, "unmapped_folders": unmapped}


@router.get("/root-folders")
def list_root_folders(db: Session = Depends(get_db)):
    folders = db.query(RootFolder).all()
    return [{"id": f.id, "path": f.path, **_folder_info(f.path)} for f in folders]


@router.post("/root-folders", status_code=201)
def add_root_folder(payload: RootFolderCreate, db: Session = Depends(get_db)):
    path = payload.path.strip()
    if not path:
        raise HTTPException(status_code=422, detail="Path cannot be empty")
    if db.query(RootFolder).filter_by(path=path).first():
        raise HTTPException(status_code=409, detail="Root folder already exists")
    folder = RootFolder(path=path)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "path": folder.path, **_folder_info(folder.path)}


@router.delete("/root-folders/{folder_id}", status_code=204)
def delete_root_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.query(RootFolder).filter_by(id=folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Root folder not found")
    db.delete(folder)
    db.commit()


# ── Remote Path Mappings ──────────────────────────────────────────────────────


class RemotePathMappingCreate(BaseModel):
    host: str
    remote_path: str
    local_path: str


class RemotePathMappingOut(BaseModel):
    id: int
    host: str
    remote_path: str
    local_path: str
    model_config = {"from_attributes": True}


@router.get("/remote-path-mappings", response_model=list[RemotePathMappingOut])
def list_remote_path_mappings(db: Session = Depends(get_db)):
    return (
        db.query(RemotePathMapping)
        .order_by(RemotePathMapping.host, RemotePathMapping.remote_path)
        .all()
    )


@router.post("/remote-path-mappings", response_model=RemotePathMappingOut, status_code=201)
def add_remote_path_mapping(payload: RemotePathMappingCreate, db: Session = Depends(get_db)):
    m = RemotePathMapping(
        host=payload.host.strip(),
        remote_path=payload.remote_path.strip(),
        local_path=payload.local_path.strip(),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.put("/remote-path-mappings/{mapping_id}", response_model=RemotePathMappingOut)
def update_remote_path_mapping(
    mapping_id: int, payload: RemotePathMappingCreate, db: Session = Depends(get_db)
):
    m = db.query(RemotePathMapping).filter_by(id=mapping_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Mapping not found")
    m.host = payload.host.strip()
    m.remote_path = payload.remote_path.strip()
    m.local_path = payload.local_path.strip()
    db.commit()
    return m


@router.delete("/remote-path-mappings/{mapping_id}", status_code=204)
def delete_remote_path_mapping(mapping_id: int, db: Session = Depends(get_db)):
    m = db.query(RemotePathMapping).filter_by(id=mapping_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(m)
    db.commit()


# ── Profiles ──────────────────────────────────────────────────────────────────

_DEFAULT_PROFILE: dict[str, Any] = {
    "regions": [
        {"code": "USA", "label": "USA", "enabled": True},
        {"code": "Europe", "label": "Europe", "enabled": True},
        {"code": "World", "label": "World", "enabled": True},
        {"code": "Japan", "label": "Japan", "enabled": True},
        {"code": "Australia", "label": "Australia", "enabled": True},
    ],
    "formats": [
        {"label": ".zip", "enabled": True},
        {"label": ".7z", "enabled": True},
        {"label": ".rar", "enabled": True},
        {"label": ".nes", "enabled": True},
        {"label": ".sfc", "enabled": True},
        {"label": ".smc", "enabled": True},
        {"label": ".gba", "enabled": True},
        {"label": ".nds", "enabled": True},
        {"label": ".3ds", "enabled": True},
        {"label": ".iso", "enabled": True},
        {"label": ".bin", "enabled": True},
        {"label": ".cue", "enabled": True},
        {"label": ".chd", "enabled": True},
        {"label": ".rom", "enabled": False},
    ],
    "prefer_no_intro": True,
    "prefer_verified": True,
    "skip_hacks": False,
    "skip_unlicensed": False,
}


@router.get("/profile")
def get_profile() -> dict:
    raw = get_config("profile")
    if not raw:
        return _DEFAULT_PROFILE
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return _DEFAULT_PROFILE


@router.put("/profile", status_code=200)
def save_profile(payload: dict) -> dict:
    set_config("profile", json.dumps(payload))
    return payload


# ── General Settings ──────────────────────────────────────────────────────────


@router.get("/general")
def get_general() -> dict:
    return {
        "curated_library_path": get_config("curated_library_path", ""),
        "rename_roms": get_config("rename_roms", "true") == "true",
        "auto_upgrade_revisions": get_config("auto_upgrade_revisions", "true") == "true",
    }


@router.put("/general", status_code=200)
def save_general(payload: dict) -> dict:
    path = (payload.get("curated_library_path") or "").strip()
    set_config("curated_library_path", path)
    if "rename_roms" in payload:
        set_config("rename_roms", "true" if payload["rename_roms"] else "false")
    if "auto_upgrade_revisions" in payload:
        set_config("auto_upgrade_revisions", "true" if payload["auto_upgrade_revisions"] else "false")
    return {
        "curated_library_path": path,
        "rename_roms": get_config("rename_roms", "true") == "true",
        "auto_upgrade_revisions": get_config("auto_upgrade_revisions", "true") == "true",
    }
