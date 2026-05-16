"""Move a completed download into the ROM library under its platform subdirectory."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from ..models.game import Game, GameStatus
from ..models.history import HistoryEventType, HistoryItem
from ..models.queue_item import QueueItem
from ..models.remote_path_mapping import RemotePathMapping
from ..models.root_folder import RootFolder
from .download_service import get_client
from .event_service import log_event
from .library_scanner import _rom_entries

logger = logging.getLogger(__name__)

_ROM_EXTENSIONS = {
    "nes",
    "smc",
    "sfc",
    "smd",
    "bin",
    "gb",
    "gbc",
    "gba",
    "nds",
    "3ds",
    "cia",
    "iso",
    "cso",
    "pbp",
    "pkg",
    "vpk",
    "nsp",
    "xci",
    "nsz",
    "xcz",
    "wbfs",
    "wad",
    "gcm",
    "rvz",
    "wux",
    "wud",
    "cdi",
    "gdi",
    "cue",
    "chd",
    "img",
    "rom",
    "v64",
    "z64",
    "n64",
    "zip",
}


def _apply_remote_path_mapping(db: Session, raw_path: str, client_host: str) -> str:
    """Translate a download-client path to a locally accessible path using configured mappings."""
    mappings = (
        db.query(RemotePathMapping)
        .filter_by(host=client_host)
        .order_by(RemotePathMapping.remote_path.desc())  # longest prefix first
        .all()
    )
    for m in mappings:
        remote = m.remote_path.rstrip("/") + "/"
        if raw_path.startswith(remote) or raw_path == m.remote_path.rstrip("/"):
            suffix = raw_path[len(m.remote_path.rstrip("/")) :]
            local = m.local_path.rstrip("/") + "/" + suffix.lstrip("/")
            return local.rstrip("/") if not suffix else local
    return raw_path


def _find_rom_files(path: Path, platform_exts: set[str] | None) -> list[Path]:
    exts = platform_exts if platform_exts else _ROM_EXTENSIONS
    if path.is_file():
        return [path] if path.suffix.lstrip(".").lower() in exts else []
    return sorted(
        [f for f in path.rglob("*") if f.is_file() and f.suffix.lstrip(".").lower() in exts],
        key=lambda f: f.stat().st_size,
        reverse=True,
    )


def _unique_dest(dest: Path) -> Path:
    """Return dest unchanged if it doesn't exist, otherwise append _1, _2, …"""
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    i = 1
    while True:
        candidate = dest.parent / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


async def import_downloaded_file(db: Session, item: QueueItem) -> dict:
    """
    Retrieve the downloaded file from the client, move it into
    {root_folder}/{platform.folder_name}/, and update the game record.
    """
    game: Game = item.game

    if not item.download_client or not item.download_id:
        raise ValueError("Queue item has no download client or download ID")

    dl_client = get_client(item.download_client)
    raw_path = await dl_client.file_path(item.download_id)
    if not raw_path:
        raise ValueError(
            "Download client did not return a file path — download may still be in progress or was removed"
        )

    mapped_path = _apply_remote_path_mapping(db, raw_path, item.download_client.host)
    if mapped_path != raw_path:
        logger.info("Remote path mapping: '%s' → '%s'", raw_path, mapped_path)

    src = Path(mapped_path)
    if not src.exists():
        detail = f"Path does not exist: {src}"
        if mapped_path != raw_path:
            detail += f" (mapped from {raw_path})"
        else:
            detail += " — configure a Remote Path Mapping in Settings → Download Clients if Romarr and the client use different paths"
        raise ValueError(detail)

    # Narrow file search to platform extensions when known
    platform_exts: set[str] | None = None
    if game.platform and game.platform.extensions:
        platform_exts = {
            e.strip().lower() for e in game.platform.extensions.split(",") if e.strip()
        }

    rom_files = _find_rom_files(src, platform_exts)

    # Stage 2: try the full known-ROM extension list
    if not rom_files:
        rom_files = _find_rom_files(src, None)

    # Stage 3: largest file > 10 MB — handles scene releases packed with
    # non-standard extensions (e.g. .txt used as obfuscation)
    if not rom_files:
        candidates = sorted(
            [
                f
                for f in (src.rglob("*") if src.is_dir() else [src])
                if f.is_file() and f.stat().st_size > 10_000_000
            ],
            key=lambda f: f.stat().st_size,
            reverse=True,
        )
        if candidates:
            logger.warning(
                "No ROM by extension at '%s' — falling back to largest file: %s",
                src,
                candidates[0].name,
            )
            rom_files = [candidates[0]]

    if not rom_files:
        raise ValueError(
            f"No ROM files found at {src}"
            + (
                f" (expected extensions: {', '.join(sorted(platform_exts))})"
                if platform_exts
                else ""
            )
        )

    # Use the largest matching file — most likely the actual game (not a readme, cue sheet, etc.)
    rom_file = rom_files[0]

    # Resolve destination
    root_folder = db.query(RootFolder).first()
    if not root_folder:
        raise ValueError("No root folder configured — add one in Settings → Media Management")

    folder_name = (game.platform.folder_name if game.platform else "Unknown") or "Unknown"
    dest_dir = Path(root_folder.path) / folder_name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = _unique_dest(dest_dir / rom_file.name)

    shutil.move(str(rom_file), str(dest))
    logger.info("Moved '%s' → '%s'", rom_file, dest)

    # Update game record immediately so the UI reflects the import without waiting for CRC32
    game.rom_path = str(dest)
    game.status = GameStatus.IMPORTED

    client_name = item.download_client.name if item.download_client else ""
    indexer_name = item.indexer.name if item.indexer else ""
    game_id = game.id
    game_title = game.title

    db.add(
        HistoryItem(
            game_id=game_id,
            event_type=HistoryEventType.IMPORTED,
            source_title=item.title,
            indexer=indexer_name,
            download_client=client_name,
            data=json.dumps(
                {
                    "download_id": item.download_id or "",
                    "destination": str(dest),
                    "filename": rom_file.name,
                }
            ),
        )
    )
    db.delete(item)
    db.commit()

    log_event("Import", f'Imported "{rom_file.name}" for "{game_title}" → {dest}')

    # CRC32 is computed in the background — large ROMs (10GB+) can take 30-60s on a network share
    def _compute_crc32():
        from ..database import SessionLocal

        try:
            entries = _rom_entries(dest)
            if not entries:
                return
            crc32 = entries[0][0]
            bg_db = SessionLocal()
            try:
                g = bg_db.query(Game).filter_by(id=game_id).first()
                if g:
                    g.checksum_crc32 = crc32
                    bg_db.commit()
                    logger.info("CRC32 computed for '%s': %s", dest.name, crc32)
            finally:
                bg_db.close()
        except Exception as exc:
            logger.warning("Background CRC32 failed for %s: %s", dest, exc)

    import threading

    threading.Thread(target=_compute_crc32, daemon=True).start()

    return {
        "success": True,
        "destination": str(dest),
        "filename": rom_file.name,
        "crc32": None,
        "game_id": game_id,
    }
