"""
Post-processor: No-Intro renaming, platform folder sorting, DAT checksum verification.

No-Intro naming convention:
  Game Title (Region) (Version).ext
  e.g. Super Mario World (USA).sfc
       Sonic the Hedgehog (USA, Europe).md
       Chrono Trigger (USA).sfc
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..models.game import Game, GameStatus
from ..models.history import HistoryEventType, HistoryItem
from ..models.platform import Platform


@dataclass
class DatEntry:
    name: str
    description: str
    sha1: str
    md5: str
    crc32: str
    size: int


def load_dat_file(dat_path: Path) -> dict[str, DatEntry]:
    """Parse a No-Intro DAT XML file into a sha1 → DatEntry mapping."""
    entries: dict[str, DatEntry] = {}
    try:
        tree = ET.parse(dat_path)
    except (ET.ParseError, FileNotFoundError):
        return entries

    for game_el in tree.findall(".//game"):
        name = game_el.get("name", "")
        description = (game_el.findtext("description") or name).strip()
        for rom_el in game_el.findall("rom"):
            sha1 = (rom_el.get("sha1") or "").lower()
            md5 = (rom_el.get("md5") or "").lower()
            crc = (rom_el.get("crc") or "").lower()
            size = int(rom_el.get("size") or 0)
            if sha1:
                entries[sha1] = DatEntry(
                    name=name,
                    description=description,
                    sha1=sha1,
                    md5=md5,
                    crc32=crc,
                    size=size,
                )
    return entries


def compute_checksums(file_path: Path) -> dict[str, str]:
    sha1 = hashlib.sha1()
    md5 = hashlib.md5()
    crc_val = 0

    import zlib

    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha1.update(chunk)
            md5.update(chunk)
            crc_val = zlib.crc32(chunk, crc_val)

    return {
        "sha1": sha1.hexdigest(),
        "md5": md5.hexdigest(),
        "crc32": format(crc_val & 0xFFFFFFFF, "08x"),
    }


def build_no_intro_filename(title: str, region: str, version: str | None = None, extension: str = "") -> str:
    """
    Build a No-Intro compliant filename.
    e.g. build_no_intro_filename("Chrono Trigger", "USA", ext="sfc")
         → "Chrono Trigger (USA).sfc"
    """
    name = title.strip()
    tags = f"({region})"
    if version:
        tags += f" ({version})"
    filename = f"{name} {tags}"
    if extension:
        ext = extension.lstrip(".")
        filename = f"{filename}.{ext}"
    return filename


def _detect_extension(path: Path) -> str:
    return path.suffix.lstrip(".")


def import_rom(
    db: Session,
    game: Game,
    source_path: Path,
    dat_entries: dict[str, DatEntry] | None = None,
) -> tuple[bool, str]:
    """
    Move a ROM file into the library, optionally verifying against No-Intro DAT.

    Returns (success, message).
    """
    if not source_path.exists():
        return False, f"Source file not found: {source_path}"

    checksums = compute_checksums(source_path)

    # DAT verification
    if dat_entries:
        entry = dat_entries.get(checksums["sha1"])
        if entry is None:
            _record_history(db, game, HistoryEventType.IMPORT_FAILED,
                            source_title=source_path.name,
                            data={"reason": "Checksum not found in DAT", "sha1": checksums["sha1"]})
            return False, "Checksum not found in No-Intro DAT — possible bad dump"

    platform: Platform = game.platform
    ext = _detect_extension(source_path)
    dest_filename = build_no_intro_filename(game.title, game.region, extension=ext)
    library_root = Path(settings.rom_library_path)
    dest_dir = library_root / platform.folder_name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / dest_filename

    shutil.move(str(source_path), str(dest_path))

    game.rom_path = str(dest_path)
    game.checksum_sha1 = checksums["sha1"]
    game.checksum_md5 = checksums["md5"]
    game.checksum_crc32 = checksums["crc32"]
    game.status = GameStatus.IMPORTED

    _record_history(
        db,
        game,
        HistoryEventType.IMPORTED,
        source_title=source_path.name,
        data={"dest": str(dest_path), **checksums},
    )
    db.commit()
    return True, f"Imported to {dest_path}"


def _record_history(
    db: Session,
    game: Game,
    event_type: HistoryEventType,
    source_title: str = "",
    data: dict | None = None,
) -> None:
    item = HistoryItem(
        game_id=game.id,
        event_type=event_type,
        source_title=source_title,
        data=json.dumps(data or {}),
    )
    db.add(item)
