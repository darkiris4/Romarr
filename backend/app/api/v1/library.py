from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...services.library_scanner import scan_folder, import_roms
from ...services.dat_manager import scan_dat_dir, dat_status as _dat_status
from ...config import settings

router = APIRouter()


class ScanRequest(BaseModel):
    path: str
    platform_hint_id: int | None = None


class ImportRequest(BaseModel):
    path: str
    platform_hint_id: int | None = None
    platform_overrides: dict[str, int] = {}
    skip_existing: bool = True


@router.post("/scan")
def preview_scan(payload: ScanRequest, db: Session = Depends(get_db)):
    """Walk a folder and identify ROMs without writing to the DB."""
    summary = scan_folder(db, payload.path, payload.platform_hint_id)
    return {
        "folder": summary.folder,
        "total_files_seen": summary.total_files_seen,
        "dat_matches": summary.matched_dat,
        "filename_matches": summary.matched_filename,
        "ambiguous": summary.ambiguous,
        "already_imported": summary.already_imported,
        "to_import": summary.to_import,
        "roms": [
            {
                "path": r.path,
                "filename": r.filename,
                "title": r.title,
                "region": r.region,
                "crc32": r.crc32,
                "match_source": r.match_source,
                "confidence": r.confidence,
                "platform_id": r.platform_id,
                "platform_name": r.platform_name,
                "candidate_platforms": r.candidate_platforms,
                "already_exists": r.already_exists,
                "existing_game_id": r.existing_game_id,
            }
            for r in summary.roms
        ],
    }


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


@router.post("/dat/reload")
def reload_dats(db: Session = Depends(get_db)):
    """Re-scan data/dats/ and reload all matched DAT files."""
    results = scan_dat_dir(db)
    return {
        "dat_dir": str(settings.dat_dir),
        "loaded": [r for r in results if r["status"] == "loaded"],
        "unmatched": [r for r in results if r["status"] == "unmatched"],
    }
