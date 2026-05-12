"""
DAT file manager.

Drop No-Intro DAT files into  data/dats/  and Romarr auto-matches them
to platforms by the DAT's <header><name> field (or the filename as fallback).

No-Intro DAT files are named like:
  Nintendo - Super Nintendo Entertainment System (20231101-045738).dat

That prefix before the date matches the platform's no_intro_name exactly.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..models.platform import Platform
from .library_scanner import load_dat_for_platform, _DAT_INDEX

# Strip trailing " (date-time)" from DAT names / filenames
_DATE_SUFFIX = re.compile(r"\s*\(\d{8}[-\d]*\)\s*$")


def _dat_header_name(dat_path: Path) -> str | None:
    """Read the <header><name> from a No-Intro DAT file."""
    try:
        for event, elem in ET.iterparse(dat_path, events=("end",)):
            if elem.tag == "name":
                return elem.text
            if elem.tag == "header":
                break
    except ET.ParseError:
        pass
    return None


def _normalise(s: str) -> str:
    return _DATE_SUFFIX.sub("", s).strip().lower()


def match_dat_to_platform(dat_path: Path, platforms: list[Platform]) -> Platform | None:
    """
    Try to match a DAT file to a platform.
    Checks the DAT's <header><name> first, then the filename stem.
    """
    candidates = [_dat_header_name(dat_path), dat_path.stem]
    platform_map = {_normalise(p.no_intro_name): p for p in platforms}

    for candidate in candidates:
        if not candidate:
            continue
        normalised = _normalise(candidate)
        # Exact match
        if normalised in platform_map:
            return platform_map[normalised]
        # Prefix match: DAT name may have extra format qualifiers like
        # "(BigEndian)" or "(Headered)" not present in the stored no_intro_name.
        for pname, platform in platform_map.items():
            if normalised.startswith(pname + " "):
                return platform

    return None


def scan_dat_dir(db: Session) -> list[dict]:
    """
    Walk data/dats/, match each .dat file to a platform, load it into
    the in-memory CRC32 index, and return a status list.
    """
    dat_dir = settings.dat_dir
    dat_dir.mkdir(parents=True, exist_ok=True)

    platforms = db.query(Platform).all()
    results = []

    for dat_path in sorted(dat_dir.glob("*.dat")):
        platform = match_dat_to_platform(dat_path, platforms)
        if platform is None:
            results.append({
                "file": dat_path.name,
                "status": "unmatched",
                "platform_id": None,
                "platform_name": None,
                "entries": 0,
            })
            continue

        count = load_dat_for_platform(platform.id, dat_path)
        results.append({
            "file": dat_path.name,
            "status": "loaded",
            "platform_id": platform.id,
            "platform_name": platform.name,
            "entries": count,
        })

    return results


def dat_status(db: Session) -> list[dict]:
    """
    Combine loaded DAT index info with unloaded DAT files on disk
    and platforms that have no DAT at all.
    """
    dat_dir = settings.dat_dir
    dat_dir.mkdir(parents=True, exist_ok=True)

    platforms = {p.id: p for p in db.query(Platform).all()}
    loaded = {pid: len(idx) for pid, idx in _DAT_INDEX.items()}

    # Files present on disk
    disk_files: dict[int, str] = {}
    for dat_path in dat_dir.glob("*.dat"):
        platform = match_dat_to_platform(dat_path, list(platforms.values()))
        if platform:
            disk_files[platform.id] = dat_path.name

    rows = []
    for pid, platform in sorted(platforms.items(), key=lambda x: x[1].name):
        rows.append({
            "platform_id": pid,
            "platform_name": platform.name,
            "dat_file": disk_files.get(pid),
            "loaded": pid in loaded,
            "entries": loaded.get(pid, 0),
        })
    return rows
