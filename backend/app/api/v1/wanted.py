import re

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.game import Game, GameStatus
from ...schemas.game import GameOut

router = APIRouter()

_REV_RE = re.compile(r"\(Rev\s+([A-Z0-9]+)\)", re.IGNORECASE)


def _rev_score(title: str) -> int:
    """Return a numeric revision level for sorting (0 = original, 1 = Rev A/1, ...)."""
    m = _REV_RE.search(title)
    if not m:
        return 0
    v = m.group(1)
    if v.isalpha():
        return ord(v.upper()) - ord("A") + 1
    try:
        return int(v)
    except ValueError:
        return 0


def _base_title(full_title: str) -> str:
    """Strip all parenthetical tags (region, rev, etc.) for comparison."""
    return re.sub(r"\s*\([^)]*\)", "", full_title).strip().lower()


@router.get("/missing", response_model=list[GameOut])
def wanted_missing(db: Session = Depends(get_db)):
    return (
        db.query(Game)
        .options(joinedload(Game.platform))
        .filter(Game.status == GameStatus.WANTED, Game.monitored == True)
        .order_by(Game.title)
        .all()
    )


@router.get("/failed", response_model=list[GameOut])
def wanted_failed(db: Session = Depends(get_db)):
    return (
        db.query(Game)
        .options(joinedload(Game.platform))
        .filter(Game.status == GameStatus.FAILED)
        .order_by(Game.title)
        .all()
    )


@router.get("/revision-unmet", response_model=list[dict])
def wanted_revision_unmet(db: Session = Depends(get_db)):
    """Return imported games where a newer No-Intro revision exists in the loaded DAT."""
    from ...services.library_scanner import _DAT_INDEX

    imported = (
        db.query(Game)
        .options(joinedload(Game.platform))
        .filter(Game.status == GameStatus.IMPORTED, Game.checksum_crc32.isnot(None))
        .order_by(Game.title)
        .all()
    )

    results = []
    for game in imported:
        pid = game.platform_id
        if pid not in _DAT_INDEX:
            continue
        platform_index = _DAT_INDEX[pid]
        current_rom = platform_index.get(game.checksum_crc32)
        if not current_rom:
            continue
        base = _base_title(getattr(current_rom, "full_title", current_rom.title))
        current_rev = _rev_score(getattr(current_rom, "full_title", current_rom.title))
        best_rev = current_rev
        best_rom = None
        for rom in platform_index.values():
            if rom.crc32 == game.checksum_crc32:
                continue
            if _base_title(getattr(rom, "full_title", rom.title)) == base:
                rv = _rev_score(getattr(rom, "full_title", rom.title))
                if rv > best_rev:
                    best_rev = rv
                    best_rom = rom
        if best_rom:
            results.append(
                {
                    "id": game.id,
                    "title": game.title,
                    "platform": game.platform.name if game.platform else None,
                    "platform_id": game.platform_id,
                    "region": game.region,
                    "cover_url": game.cover_url,
                    "current_revision": getattr(current_rom, "full_title", current_rom.title),
                    "latest_revision": getattr(best_rom, "full_title", best_rom.title),
                    "added_at": game.added_at.isoformat(),
                }
            )
    return results
