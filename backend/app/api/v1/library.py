import asyncio
import io
import json
import re
import zipfile
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from ...config import settings
from ...database import get_db
from ...models.game import Game
from ...services.config_service import get_config, set_config
from ...services.dat_manager import dat_status as _dat_status
from ...services.dat_manager import scan_dat_dir
from ...services.event_service import log_event
from ...services.library_scanner import import_start as _import_start
from ...services.library_scanner import import_status as _import_status
from ...services.library_scanner import scan_start, scan_status

router = APIRouter()

_RECENT_FOLDERS_KEY = "recent_scan_folders"
_RECENT_FOLDERS_MAX = 10

# Characters RetroArch replaces with underscores when resolving thumbnail paths.
_RETROARCH_UNSAFE = re.compile(r'[&*/:"<>?\\|]')

# ── RetroArch export background task state ────────────────────────────────────
_export_state: dict[str, Any] = {
    "running": False,
    "done": False,
    "error": None,
    "stage": "idle",  # idle | fetching | building | done
    "fetched": 0,
    "total": 0,
}
_export_result: bytes | None = None


class ScanRequest(BaseModel):
    path: str
    platform_hint_id: int | None = None


class ImportRequest(BaseModel):
    path: str
    platform_hint_id: int | None = None
    platform_overrides: dict[str, int] = {}
    skip_existing: bool = True
    selected_keys: list[str] | None = None  # "path::inner_filename" per ROM entry
    copy_to_curated: bool = False


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


@router.delete("/scan/recent")
def delete_recent_folder(path: str):
    existing = json.loads(get_config(_RECENT_FOLDERS_KEY, "[]"))
    folders = [f for f in existing if f["path"] != path]
    set_config(_RECENT_FOLDERS_KEY, json.dumps(folders))
    return {"ok": True}


@router.get("/import/status")
def get_import_status():
    return _import_status()


@router.post("/import")
def do_import(payload: ImportRequest):
    """Start a background ROM import. Returns immediately; poll /import/status."""
    curated_path: str | None = None
    if payload.copy_to_curated:
        curated_path = get_config("curated_library_path", "").strip() or None
    return _import_start(
        payload.path,
        platform_hint_id=payload.platform_hint_id,
        platform_overrides=payload.platform_overrides,
        skip_existing=payload.skip_existing,
        selected_keys=set(payload.selected_keys) if payload.selected_keys is not None else None,
        curated_path=curated_path,
    )


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
        import re

        from ...models.platform import Platform
        from ...services.dat_manager import _DATE_SUFFIX, _dat_header_name
        from .platforms import BUILTIN_PLATFORMS

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

    platform_name = (
        matched.get("platform_name") if matched and matched.get("status") == "loaded" else None
    )
    log_event(
        "DAT",
        f'Uploaded "{file.filename}"'
        + (f" → {platform_name}" if platform_name else " (unmatched)")
        + (" — platform created" if platform_created else ""),
    )
    return {
        "filename": file.filename,
        "size": len(contents),
        "matched_platform": platform_name,
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
    from ...models.platform import Platform
    from ...services.dat_manager import _DAT_INDEX, match_dat_to_platform

    platforms = db.query(Platform).all()
    platform = match_dat_to_platform(target, platforms)
    if platform and platform.id in _DAT_INDEX:
        del _DAT_INDEX[platform.id]

    log_event("DAT", f'Deleted "{filename}"')
    target.unlink()


@router.post("/deduplicate")
def deduplicate_library(db: Session = Depends(get_db)):
    """Find and remove duplicate Game records (CRC32 and title+platform passes)."""
    from ...services.library_scanner import deduplicate_games

    return deduplicate_games(db)


@router.post("/dat/reload")
def reload_dats(db: Session = Depends(get_db)):
    """Re-scan data/dats/ and reload all matched DAT files."""
    results = scan_dat_dir(db)
    return {
        "dat_dir": str(settings.dat_dir),
        "loaded": [r for r in results if r["status"] == "loaded"],
        "unmatched": [r for r in results if r["status"] == "unmatched"],
    }


def _build_zip(
    platform_items: dict[str, list[dict]],
    cover_results: list[tuple[str, str, str, bytes | None]],
) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for platform_name, items in platform_items.items():
            lpl = {
                "version": "1.5",
                "default_core_path": "",
                "default_core_name": "",
                "label_display_mode": 0,
                "right_thumbnail_mode": 0,
                "left_thumbnail_mode": 0,
                "sort_mode": 0,
                "items": items,
            }
            zf.writestr(f"playlists/{platform_name}.lpl", json.dumps(lpl, indent=2))
        for platform_name, sanitized_stem, ext, data in cover_results:
            if data is None:
                continue
            zf.writestr(
                f"thumbnails/{platform_name}/Named_Boxarts/{sanitized_stem}{ext}",
                data,
            )
    return buf.getvalue()


async def _run_export(
    platform_items: dict[str, list[dict]],
    cover_tasks: list[tuple[str, str, str, str]],
) -> None:
    global _export_result
    sem = asyncio.Semaphore(32)

    async def _fetch(client: httpx.AsyncClient, task: tuple[str, str, str, str]):
        platform_name, sanitized_stem, cover_url, ext = task
        async with sem:
            try:
                r = await client.get(cover_url, timeout=15, follow_redirects=True)
                r.raise_for_status()
                data: bytes | None = r.content
            except Exception:
                data = None
        _export_state["fetched"] += 1
        return platform_name, sanitized_stem, ext, data

    try:
        async with httpx.AsyncClient() as client:
            cover_results = await asyncio.gather(*[_fetch(client, t) for t in cover_tasks])

        _export_state["stage"] = "building"

        # ZIP assembly is CPU-bound; run in a thread to keep the event loop free
        # for other requests during what can be a long operation.
        loop = asyncio.get_event_loop()
        zip_bytes = await loop.run_in_executor(
            None, _build_zip, platform_items, list(cover_results)
        )

        _export_result = zip_bytes
        _export_state.update({"running": False, "done": True, "stage": "done", "error": None})
    except Exception as exc:
        _export_state.update({"running": False, "done": False, "stage": "idle", "error": str(exc)})


@router.post("/retroarch-export/start")
async def start_retroarch_export(
    path_prefix: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """
    Start a background export job.  Returns immediately; poll /retroarch-export/status
    for progress, then download from /retroarch-export/download when done.

    If an export is already running, returns the current state without starting a new one.
    """
    if _export_state["running"]:
        return dict(_export_state)

    curated_root_str = get_config("curated_library_path", "").strip()
    if not curated_root_str:
        raise HTTPException(status_code=400, detail="Curated library path is not configured")

    curated_root = Path(curated_root_str).expanduser().resolve()
    if not curated_root.exists():
        raise HTTPException(status_code=404, detail="Curated library path does not exist")

    stem_to_info: dict[str, tuple[str | None, str | None]] = {
        Path(g.rom_path).stem: (g.checksum_crc32, g.cover_url)
        for g in db.query(Game.rom_path, Game.checksum_crc32, Game.cover_url)
        .filter(Game.rom_path.isnot(None))
        .all()
    }

    effective_prefix = path_prefix.strip().rstrip("/\\") or str(curated_root)
    platform_items: dict[str, list[dict]] = {}
    cover_tasks: list[tuple[str, str, str, str]] = []

    for platform_dir in sorted(curated_root.iterdir()):
        if not platform_dir.is_dir():
            continue
        platform_name = platform_dir.name
        items = []
        for rom_file in sorted(platform_dir.iterdir()):
            if not rom_file.is_file():
                continue
            rel = rom_file.relative_to(curated_root)
            rom_path_str = f"{effective_prefix}/{rel.as_posix()}"
            stem = rom_file.stem
            label = stem
            crc_raw, cover_url = stem_to_info.get(stem, (None, None))
            crc32 = f"{crc_raw}|crc" if crc_raw else "DETECT"
            items.append(
                {
                    "path": rom_path_str,
                    "label": label,
                    "core_path": "DETECT",
                    "core_name": "DETECT",
                    "crc32": crc32,
                    "db_name": f"{platform_name}.lpl",
                }
            )
            if cover_url:
                sanitized = _RETROARCH_UNSAFE.sub("_", label)
                ext = Path(cover_url).suffix or ".jpg"
                cover_tasks.append((platform_name, sanitized, cover_url, ext))
        if items:
            platform_items[platform_name] = items

    if not platform_items:
        raise HTTPException(status_code=404, detail="No platforms found in curated library")

    _export_state.update(
        {
            "running": True,
            "done": False,
            "error": None,
            "stage": "fetching",
            "fetched": 0,
            "total": len(cover_tasks),
        }
    )

    asyncio.create_task(_run_export(platform_items, cover_tasks))
    return dict(_export_state)


@router.get("/retroarch-export/status")
def get_retroarch_export_status():
    return dict(_export_state)


@router.get("/retroarch-export/download")
def download_retroarch_export():
    if not _export_state["done"] or _export_result is None:
        raise HTTPException(status_code=400, detail="Export not ready — start an export first")
    return StreamingResponse(
        io.BytesIO(_export_result),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="retroarch-export.zip"'},
    )
