import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...services.library_scanner import scan_folder, import_roms, scan_start, scan_status
from ...services.dat_manager import scan_dat_dir, dat_status as _dat_status
from ...services.config_service import get_config, set_config
from ...config import settings

router = APIRouter()

_RECENT_FOLDERS_KEY = "recent_scan_folders"
_RECENT_FOLDERS_MAX = 10


class ScanRequest(BaseModel):
    path: str
    platform_hint_id: int | None = None


class ImportRequest(BaseModel):
    path: str
    platform_hint_id: int | None = None
    platform_overrides: dict[str, int] = {}
    skip_existing: bool = True


def _add_recent_folder(path: str):
    existing = json.loads(get_config(_RECENT_FOLDERS_KEY, "[]"))
    folders = [f for f in existing if f["path"] != path]
    folders.insert(0, {"path": path})
    set_config(_RECENT_FOLDERS_KEY, json.dumps(folders[:_RECENT_FOLDERS_MAX]))


@router.post("/scan")
def preview_scan(payload: ScanRequest):
    """Start a background folder scan. Returns immediately; poll /scan/status."""
    _add_recent_folder(payload.path.strip())
    return scan_start(payload.path.strip(), payload.platform_hint_id)


@router.get("/scan/status")
def get_scan_status():
    return scan_status()


@router.get("/scan/recent")
def get_recent_folders():
    return json.loads(get_config(_RECENT_FOLDERS_KEY, "[]"))


@router.post("/import")
def do_import(payload: ImportRequest, db: Session = Depends(get_db)):
    """Scan and create Game records, then kick off a metadata scrape."""
    result = import_roms(
        db,
        payload.path,
        platform_hint_id=payload.platform_hint_id,
        platform_overrides=payload.platform_overrides,
        skip_existing=payload.skip_existing,
    )
    if result.get("created", 0) > 0:
        from ...services.metadata_scraper import scrape_start
        scrape_start()
    return result


@router.get("/dat/status")
def get_dat_status(db: Session = Depends(get_db)):
    """Return DAT load status for every configured platform."""
    return {
        "dat_dir": str(settings.dat_dir),
        "platforms": _dat_status(db),
    }


@router.post("/dat/upload")
async def upload_dat(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Save an uploaded DAT file to data/dats/, auto-create the platform if needed, then reload."""
    if not file.filename or not file.filename.lower().endswith(".dat"):
        raise HTTPException(status_code=422, detail="Only .dat files are accepted")
    settings.dat_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.dat_dir / file.filename
    contents = await file.read()
    dest.write_bytes(contents)

    # First reload attempt
    results = scan_dat_dir(db)
    matched = next((r for r in results if r.get("file") == file.filename), None)

    # If unmatched, auto-create a platform from the DAT header
    platform_created = False
    if not matched or matched.get("status") == "unmatched":
        from ...services.dat_manager import _dat_header_name, _DATE_SUFFIX
        from ...models.platform import Platform
        from .platforms import BUILTIN_PLATFORMS
        import re

        header_name = _dat_header_name(dest)
        no_intro_name = _DATE_SUFFIX.sub("", header_name).strip() if header_name else dest.stem

        # Check built-ins first for full metadata
        builtin = next(
            (b for b in BUILTIN_PLATFORMS if b["no_intro_name"].lower() == no_intro_name.lower()),
            None,
        )
        if builtin:
            p = Platform(**builtin)
        else:
            # Derive friendly name by stripping "Manufacturer - " prefix
            friendly = re.sub(r"^[^-]+ - ", "", no_intro_name, count=1)
            p = Platform(
                name=friendly,
                no_intro_name=no_intro_name,
                folder_name=no_intro_name,
                extensions="",
                enabled=True,
            )

        db.add(p)
        db.commit()
        platform_created = True

        # Reload now that the platform exists
        results = scan_dat_dir(db)
        matched = next((r for r in results if r.get("file") == file.filename), None)

    return {
        "filename": file.filename,
        "size": len(contents),
        "matched_platform": matched.get("platform_name") if matched and matched.get("status") == "loaded" else None,
        "status": matched.get("status", "unmatched") if matched else "unmatched",
        "platform_created": platform_created,
    }


@router.delete("/dat/{filename}", status_code=204)
def delete_dat(filename: str, db: Session = Depends(get_db)):
    """Remove a DAT file from data/dats/ and evict it from the CRC32 index."""
    if not filename.lower().endswith(".dat"):
        raise HTTPException(status_code=422, detail="Invalid filename")
    target = settings.dat_dir / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="DAT file not found")

    # Evict from in-memory index before deleting
    from ...services.dat_manager import match_dat_to_platform, _DAT_INDEX
    from ...models.platform import Platform
    platforms = db.query(Platform).all()
    platform = match_dat_to_platform(target, platforms)
    if platform and platform.id in _DAT_INDEX:
        del _DAT_INDEX[platform.id]

    target.unlink()


@router.post("/dat/reload")
def reload_dats(db: Session = Depends(get_db)):
    """Re-scan data/dats/ and reload all matched DAT files."""
    results = scan_dat_dir(db)
    return {
        "dat_dir": str(settings.dat_dir),
        "loaded": [r for r in results if r["status"] == "loaded"],
        "unmatched": [r for r in results if r["status"] == "unmatched"],
    }
