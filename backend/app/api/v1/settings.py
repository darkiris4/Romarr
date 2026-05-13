import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ...database import get_db
from ...models.root_folder import RootFolder

router = APIRouter()


class RootFolderCreate(BaseModel):
    path: str


def _folder_info(path: str) -> dict:
    p = Path(path)
    if p.exists() and p.is_dir():
        usage = shutil.disk_usage(path)
        free_gb = usage.free / 1024 ** 3
        free_str = f"{free_gb:.1f} GB" if free_gb >= 1 else f"{usage.free / 1024 ** 2:.0f} MB"
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
    return [
        {"id": f.id, "path": f.path, **_folder_info(f.path)}
        for f in folders
    ]


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
