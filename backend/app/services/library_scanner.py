"""
Hash-first library scanner.

Identification priority:
  1. CRC32 lookup against any loaded No-Intro DAT files  →  exact match
  2. Fuzzy title match against existing Game records      →  likely match
  3. Filename stem after stripping common junk            →  best-guess

Folder structure and filenames are completely ignored for identification.
The only thing that matters is the file content hash and/or the
human-readable part of the filename.
"""

from __future__ import annotations

import logging
import re
import threading
import zipfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── In-process scan state ────────────────────────────────────────────────────

_scan_state: dict[str, Any] = {
    "running": False,
    "folder": None,
    "total": 0,
    "processed": 0,
    "done": False,
    "error": None,
    "result": None,
}
_scan_lock = threading.Lock()

_import_state: dict[str, Any] = {
    "running": False,
    "done": False,
    "error": None,
    "result": None,
}
_import_lock = threading.Lock()


def import_status() -> dict:
    with _import_lock:
        return dict(_import_state)


def scan_status() -> dict:
    with _scan_lock:
        return dict(_scan_state)


def scan_start(folder_path: str, platform_hint_id: int | None = None) -> dict:
    """Start a folder scan in a background thread. Returns immediately."""
    p = Path(folder_path).expanduser().resolve()
    if not p.exists():
        return {"error": f"Path not found: {folder_path}"}
    if not p.is_dir():
        return {"error": f"Not a directory: {folder_path}"}

    with _scan_lock:
        if _scan_state["running"]:
            return {"already_running": True}
        _scan_state.update(
            {
                "running": True,
                "folder": folder_path,
                "done": False,
                "error": None,
                "result": None,
                "total": 0,
                "processed": 0,
            }
        )

    from ..database import SessionLocal

    def _worker():
        from .event_service import log_event

        db = SessionLocal()
        try:
            log_event("LibraryScanner", f"Scan started: {folder_path}")
            summary = scan_folder(
                db,
                folder_path,
                platform_hint_id,
                progress_state=_scan_state,
                progress_lock=_scan_lock,
            )
            with _scan_lock:
                _scan_state.update(
                    {"running": False, "done": True, "result": _summary_to_dict(summary)}
                )
            log_event(
                "LibraryScanner",
                f"Scan complete: {summary.total_files_seen} files, {summary.matched_dat} DAT matches, {summary.matched_filename} filename matches",
            )
        except Exception as exc:
            with _scan_lock:
                _scan_state.update({"running": False, "done": True, "error": str(exc)})
            log_event("LibraryScanner", f"Scan failed: {exc}")
        finally:
            db.close()

    threading.Thread(target=_worker, daemon=True).start()
    return {"started": True}


def _summary_to_dict(summary: ScanSummary) -> dict:
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


from ..models.game import Game, GameStatus
from ..models.platform import Platform
from .post_processor import load_dat_file

# ── Filename cleaning ────────────────────────────────────────────────────────

# Tags to strip when falling back to filename-based title guessing
_STRIP_TAGS = re.compile(
    r"\s*[\(\[]["
    r"Uu]nknown|[Bb]eta|[Dd]emo|[Pp]rototype|[Pp]roto|[Ss]ample"
    r"|[Rr]ev\s*[\dA-Za-z]+|[Vv]\d[\d.]*"
    r"|[A-Za-z]{2,3}(?:,\s*[A-Za-z]{2,3})*"  # region codes: USA, Europe, JP ...
    r"|!\]?|T[+-]\w+"
    r"[\)\]]",
    re.VERBOSE,
)

_PAREN_BLOCK = re.compile(r"\s*[\(\[].*?[\)\]]")


def _clean_title(stem: str) -> tuple[str, str]:
    """
    Return (cleaned_title, region) from a filename stem.
    Tries No-Intro format first, then strips all tags and returns 'Unknown' region.
    """
    # No-Intro: "Title (Region) ..."
    m = re.match(r"^(?P<title>.+?)\s+\((?P<region>[A-Za-z ,]+)\)", stem)
    if m:
        return m.group("title").strip(), m.group("region").strip()
    # Strip everything in parens/brackets and hope for the best
    title = _PAREN_BLOCK.sub("", stem).strip(" .-_")
    return title or stem, "Unknown"


# ── CRC32 ────────────────────────────────────────────────────────────────────


def _crc32_raw(path: Path, chunk: int = 1 << 20) -> str:
    val = 0
    with open(path, "rb") as f:
        while data := f.read(chunk):
            val = zlib.crc32(data, val)
    return format(val & 0xFFFFFFFF, "08x")


def _rom_entries(path: Path) -> list[tuple[str, str, str]]:
    """
    Return [(crc32_hex, effective_ext, display_name), ...] for a ROM file.

    For ZIPs every inner file becomes its own entry so multi-region archives
    (e.g. a single ZIP containing USA, Europe, and Japan variants) are each
    identified separately.  The ZIP central-directory CRC32 is the CRC of
    the uncompressed content — exactly what No-Intro records.
    Non-ZIP files return a single entry using the file's own name.
    """
    ext = path.suffix.lstrip(".").lower()
    if ext == "zip":
        try:
            with zipfile.ZipFile(path, "r") as zf:
                members = [m for m in zf.infolist() if not m.filename.endswith("/")]
                if members:
                    entries = []
                    for m in members:
                        inner_ext = Path(m.filename).suffix.lstrip(".").lower()
                        crc = format(m.CRC & 0xFFFFFFFF, "08x")
                        entries.append((crc, inner_ext, m.filename))
                    return entries
        except zipfile.BadZipFile:
            pass
    return [(_crc32_raw(path), ext, path.name)]


# ── DAT index (loaded once per process, keyed by platform id) ────────────────

_DAT_INDEX: dict[int, dict[str, DatROM]] = {}


@dataclass
class DatROM:
    title: str
    region: str
    crc32: str
    sha1: str
    md5: str
    platform_id: int


def load_dat_for_platform(platform_id: int, dat_path: Path) -> int:
    """Index a No-Intro DAT file for a platform. Returns number of entries loaded."""
    entries = load_dat_file(dat_path)  # keyed by sha1
    index: dict[str, DatROM] = {}
    for entry in entries.values():
        # Build a CRC32-keyed index for fast scan lookups
        if entry.crc32:
            region = _extract_region(entry.name)
            index[entry.crc32] = DatROM(
                title=_strip_region_tags(entry.name),
                region=region,
                crc32=entry.crc32,
                sha1=entry.sha1,
                md5=entry.md5,
                platform_id=platform_id,
            )
    _DAT_INDEX[platform_id] = index
    return len(index)


def _extract_region(name: str) -> str:
    m = re.search(r"\(([A-Za-z ,]+)\)", name)
    return m.group(1) if m else "Unknown"


def _strip_region_tags(name: str) -> str:
    return _PAREN_BLOCK.sub("", name).strip(" .-")


def lookup_crc32(crc: str) -> DatROM | None:
    """Search all loaded DAT indexes for a CRC32."""
    for index in _DAT_INDEX.values():
        hit = index.get(crc)
        if hit:
            return hit
    return None


# ── Extension → platform map ─────────────────────────────────────────────────


def _ext_map(platforms: list[Platform]) -> dict[str, list[Platform]]:
    idx: dict[str, list[Platform]] = {}
    for p in platforms:
        for ext in p.extensions.split(","):
            e = ext.strip().lower()
            if e:
                idx.setdefault(e, []).append(p)
    return idx


# ── Scan result ──────────────────────────────────────────────────────────────

MatchSource = Literal["dat", "filename", "unmatched"]


@dataclass
class ScannedROM:
    path: str
    filename: str
    extension: str
    crc32: str

    # Identification result
    title: str
    region: str
    match_source: MatchSource  # how we identified it
    confidence: float  # 0.0–1.0

    # Platform
    platform_id: int | None  # None = ambiguous / unknown
    platform_name: str | None
    candidate_platforms: list[dict]  # [{id, name}] when ambiguous

    # DB state
    already_exists: bool = False
    existing_game_id: int | None = None


@dataclass
class ScanSummary:
    folder: str
    total_files_seen: int = 0
    roms: list[ScannedROM] = field(default_factory=list)

    @property
    def matched_dat(self) -> int:
        return sum(1 for r in self.roms if r.match_source == "dat")

    @property
    def matched_filename(self) -> int:
        return sum(1 for r in self.roms if r.match_source == "filename")

    @property
    def ambiguous(self) -> int:
        return sum(1 for r in self.roms if r.platform_id is None)

    @property
    def already_imported(self) -> int:
        return sum(1 for r in self.roms if r.already_exists)

    @property
    def to_import(self) -> int:
        return sum(1 for r in self.roms if not r.already_exists and r.platform_id is not None)


# ── Main scan entry point ─────────────────────────────────────────────────────


def scan_folder(
    db: Session,
    folder_path: str,
    platform_hint_id: int | None = None,
    progress_state: dict | None = None,
    progress_lock: threading.Lock | None = None,
) -> ScanSummary:
    """
    Walk folder_path recursively.  For each ROM file:
      1. Compute CRC32 and check DAT index            → dat match
      2. Fall back to filename parsing                → filename match
      3. Determine platform via DAT / extension / hint
    Returns a ScanSummary without touching the database.
    """
    root = Path(folder_path).expanduser().resolve()
    platforms = db.query(Platform).filter_by(enabled=True).all()
    ext_map = _ext_map(platforms)
    platform_by_id = {p.id: p for p in platforms}
    hint_platform = platform_by_id.get(platform_hint_id) if platform_hint_id else None

    summary = ScanSummary(folder=str(root))

    if not root.exists():
        return summary

    all_exts = set(ext_map.keys()) | {"zip"}

    # Pre-count files for progress reporting
    all_files = [p for p in sorted(root.rglob("*")) if p.is_file()]
    if progress_state is not None and progress_lock is not None:
        with progress_lock:
            progress_state["total"] = len(all_files)

    for path in all_files:
        summary.total_files_seen += 1
        if progress_state is not None and progress_lock is not None:
            with progress_lock:
                progress_state["processed"] = summary.total_files_seen

        ext = path.suffix.lstrip(".").lower()
        if ext not in all_exts and hint_platform is None:
            continue  # not a recognized ROM extension

        for crc, effective_ext, display_name in _rom_entries(path):
            # ── 1. DAT lookup ──────────────────────────────────────────────────
            dat_hit = lookup_crc32(crc)
            if dat_hit:
                platform = platform_by_id.get(dat_hit.platform_id)
                rom = ScannedROM(
                    path=str(path),
                    filename=display_name,
                    extension=effective_ext,
                    crc32=crc,
                    title=dat_hit.title,
                    region=dat_hit.region,
                    match_source="dat",
                    confidence=1.0,
                    platform_id=dat_hit.platform_id if platform else None,
                    platform_name=platform.name if platform else f"Platform #{dat_hit.platform_id}",
                    candidate_platforms=[],
                )
            else:
                # ── 2. Filename fallback ───────────────────────────────────────
                title, region = _clean_title(Path(display_name).stem)

                # Determine platform from hint > extension candidates
                candidates = ext_map.get(effective_ext, [])
                if hint_platform:
                    resolved = hint_platform
                    candidate_list: list[dict] = []
                elif len(candidates) == 1:
                    resolved = candidates[0]
                    candidate_list = []
                else:
                    resolved = None
                    candidate_list = [{"id": p.id, "name": p.name} for p in candidates]

                rom = ScannedROM(
                    path=str(path),
                    filename=display_name,
                    extension=effective_ext,
                    crc32=crc,
                    title=title,
                    region=region,
                    match_source="filename" if resolved else "unmatched",
                    confidence=0.6 if resolved else 0.0,
                    platform_id=resolved.id if resolved else None,
                    platform_name=resolved.name if resolved else None,
                    candidate_platforms=candidate_list,
                )

            # ── 3. DB existence check ──────────────────────────────────────────
            # CRC32 is checked first — it's content-based and never lies.
            # Title+platform is the fallback for filename-only matches.
            existing = None
            if rom.crc32:
                existing = db.query(Game).filter_by(checksum_crc32=rom.crc32).first()
            if not existing and rom.platform_id:
                existing = (
                    db.query(Game)
                    .filter(Game.title == rom.title, Game.platform_id == rom.platform_id)
                    .first()
                )
            if existing:
                rom.already_exists = True
                rom.existing_game_id = existing.id

            summary.roms.append(rom)

    return summary


# ── Import ────────────────────────────────────────────────────────────────────


def import_roms(
    db: Session,
    folder_path: str,
    platform_hint_id: int | None = None,
    platform_overrides: dict[str, int] | None = None,
    skip_existing: bool = True,
    selected_keys: set[str] | None = None,
) -> dict:
    """
    Scan and create/update Game records.

    platform_overrides: {rom_path: platform_id} — lets the UI assign platforms
                        to ambiguous files before confirming.
    selected_keys: set of "path::filename" strings identifying exactly which
                   inner ROM entries to import (handles multi-ROM ZIPs correctly).
    """
    summary = scan_folder(db, folder_path, platform_hint_id)
    overrides = platform_overrides or {}
    platform_by_id = {p.id: p for p in db.query(Platform).all()}

    created = updated = skipped_existing = skipped_ambiguous = 0

    for rom in summary.roms:
        if selected_keys is not None:
            key = f"{rom.path}::{rom.filename}"
            if key not in selected_keys:
                continue

        # Apply manual override if provided
        if rom.path in overrides:
            rom.platform_id = overrides[rom.path]
            p = platform_by_id.get(rom.platform_id)
            rom.platform_name = p.name if p else None

        if rom.platform_id is None:
            skipped_ambiguous += 1
            continue

        if rom.already_exists:
            if skip_existing:
                skipped_existing += 1
            else:
                game = db.query(Game).filter_by(id=rom.existing_game_id).first()
                if game and not game.rom_path:
                    game.rom_path = rom.path
                    game.checksum_crc32 = rom.crc32
                    if rom.match_source == "dat":
                        game.status = GameStatus.IMPORTED
                    updated += 1
            continue

        # Hard dedup guards — catch any case the scan-time check missed
        # (e.g. both inner files of a multi-ROM ZIP resolved to the same title,
        # or title changed between DAT reloads, or concurrent imports).
        if rom.crc32:
            if db.query(Game).filter_by(checksum_crc32=rom.crc32).first():
                skipped_existing += 1
                continue
        if rom.title and rom.platform_id:
            if db.query(Game).filter_by(title=rom.title, platform_id=rom.platform_id).first():
                skipped_existing += 1
                continue

        game = Game(
            title=rom.title,
            platform_id=rom.platform_id,
            region=rom.region,
            status=GameStatus.IMPORTED,
            rom_path=rom.path,
            checksum_crc32=rom.crc32,
            monitored=True,
        )
        db.add(game)
        created += 1

    db.commit()

    result = {
        "scanned": summary.total_files_seen,
        "created": created,
        "updated": updated,
        "skipped_existing": skipped_existing,
        "skipped_ambiguous": skipped_ambiguous,
        "dat_matches": summary.matched_dat,
        "filename_matches": summary.matched_filename,
    }
    logger.info(
        "Import complete — folder=%s created=%d updated=%d "
        "skipped_existing=%d skipped_ambiguous=%d dat=%d filename=%d",
        folder_path,
        created,
        updated,
        skipped_existing,
        skipped_ambiguous,
        summary.matched_dat,
        summary.matched_filename,
    )
    if skipped_ambiguous:
        ambiguous_files = [r.filename for r in summary.roms if r.platform_id is None]
        logger.warning(
            "Skipped %d ambiguous ROMs (no platform match): %s",
            skipped_ambiguous,
            ambiguous_files[:20],
        )
    return result


def deduplicate_games(db: Session) -> dict:
    """
    Remove duplicate Game records in two passes:
      1. CRC32 duplicates — exact same ROM content, different DB rows.
      2. Title+platform duplicates — same clean title on same platform
         (happens when a multi-ROM ZIP contains two inner files that both
         resolve to the same No-Intro title via the DAT).
    In each group the record with the richest metadata is kept.
    """
    from sqlalchemy import func

    def _score(g: Game) -> int:
        return (
            (1 if g.igdb_id else 0)
            + (1 if g.cover_url else 0)
            + (1 if g.summary else 0)
            + (1 if g.rating is not None else 0)
        )

    removed = 0

    # Pass 1: CRC32 duplicates
    crc_dupes = (
        db.query(Game.checksum_crc32)
        .filter(Game.checksum_crc32.isnot(None))
        .group_by(Game.checksum_crc32)
        .having(func.count(Game.id) > 1)
        .all()
    )
    for (crc32,) in crc_dupes:
        games = db.query(Game).filter_by(checksum_crc32=crc32).all()
        games.sort(key=_score, reverse=True)
        for dup in games[1:]:
            db.delete(dup)
            removed += 1

    # Pass 2: title+platform duplicates (different CRC32, same game)
    title_dupes = (
        db.query(Game.title, Game.platform_id)
        .filter(Game.platform_id.isnot(None))
        .group_by(Game.title, Game.platform_id)
        .having(func.count(Game.id) > 1)
        .all()
    )
    for title, platform_id in title_dupes:
        games = db.query(Game).filter_by(title=title, platform_id=platform_id).all()
        games.sort(key=_score, reverse=True)
        for dup in games[1:]:
            db.delete(dup)
            removed += 1

    if removed:
        db.commit()

    return {"duplicate_groups": len(crc_dupes) + len(title_dupes), "removed": removed}


def import_start(
    folder_path: str,
    platform_hint_id: int | None = None,
    platform_overrides: dict[str, int] | None = None,
    skip_existing: bool = True,
    selected_keys: set[str] | None = None,
) -> dict:
    """Start a ROM import in a background thread. Returns immediately."""
    with _import_lock:
        if _import_state["running"]:
            return {"already_running": True}
        _import_state.update({"running": True, "done": False, "error": None, "result": None})

    from ..database import SessionLocal

    def _worker():
        from .event_service import log_event

        db = SessionLocal()
        try:
            log_event("LibraryImport", f"Import started: {folder_path}")
            result = import_roms(
                db,
                folder_path,
                platform_hint_id=platform_hint_id,
                platform_overrides=platform_overrides,
                skip_existing=skip_existing,
                selected_keys=selected_keys,
            )
            log_event(
                "LibraryImport",
                f"Import complete: {result.get('created', 0)} created, {result.get('updated', 0)} updated, {result.get('skipped_existing', 0)} skipped",
            )
            if result.get("created", 0) > 0:
                from .metadata_scraper import scrape_start

                scrape_start()
            with _import_lock:
                _import_state.update({"running": False, "done": True, "result": result})
        except Exception as exc:
            log_event("LibraryImport", f"Import failed: {exc}")
            with _import_lock:
                _import_state.update({"running": False, "done": True, "error": str(exc)})
        finally:
            db.close()

    threading.Thread(target=_worker, daemon=True).start()
    return {"started": True}
