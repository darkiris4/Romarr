import logging
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.download_client import DownloadClient
from ...models.game import Game, GameStatus
from ...models.indexer import Indexer
from ...models.queue_item import QueueItem, QueueStatus
from ...schemas.game import GameCreate, GameOut, GameUpdate
from ...models.blocklist import BlocklistItem
from ...models.history import HistoryEventType, HistoryItem
from ...services.download_service import get_client
from ...services.event_service import log_event
from ...services.indexer_service import search_indexer


class GrabPayload(BaseModel):
    link: str
    title: str
    size: int = 0
    protocol: str
    indexer: str = ""
    indexer_id: int | None = None
    seeders: int | None = None


router = APIRouter()


@router.get("", response_model=list[GameOut])
def list_games(
    status: GameStatus | None = None,
    platform_id: int | None = None,
    monitored: bool | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 10000,
    db: Session = Depends(get_db),
):
    q = db.query(Game).options(joinedload(Game.platform))
    if status:
        q = q.filter(Game.status == status)
    if platform_id:
        q = q.filter(Game.platform_id == platform_id)
    if monitored is not None:
        q = q.filter(Game.monitored == monitored)
    if search:
        q = q.filter(Game.title.ilike(f"%{search}%"))
    return q.offset(skip).limit(limit).all()


@router.post("", response_model=GameOut, status_code=201)
def create_game(payload: GameCreate, db: Session = Depends(get_db)):
    game = Game(**payload.model_dump())
    db.add(game)
    db.commit()
    db.refresh(game)
    return db.query(Game).options(joinedload(Game.platform)).filter_by(id=game.id).one()


class BulkDeletePayload(BaseModel):
    ids: list[int]


class BulkTagPayload(BaseModel):
    ids: list[int]
    tags: str


@router.post("/bulk-delete", status_code=204)
def bulk_delete(payload: BulkDeletePayload, db: Session = Depends(get_db)):
    db.query(Game).filter(Game.id.in_(payload.ids)).delete(synchronize_session=False)
    db.commit()


@router.patch("/bulk-tag")
def bulk_tag(payload: BulkTagPayload, db: Session = Depends(get_db)):
    db.query(Game).filter(Game.id.in_(payload.ids)).update(
        {"tags": payload.tags or None}, synchronize_session=False
    )
    db.commit()
    return {"updated": len(payload.ids)}


@router.get("/{game_id}", response_model=GameOut)
def get_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).options(joinedload(Game.platform)).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    out = GameOut.model_validate(game)
    if game.rom_path:
        try:
            out.file_size = os.path.getsize(game.rom_path)
        except OSError:
            pass
        try:
            from pathlib import Path

            from ...config import settings

            out.relative_rom_path = str(Path(game.rom_path).relative_to(settings.rom_library_path))
        except ValueError:
            out.relative_rom_path = game.rom_path
    return out


@router.put("/{game_id}", response_model=GameOut)
def update_game(game_id: int, payload: GameUpdate, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(game, key, value)
    db.commit()
    return db.query(Game).options(joinedload(Game.platform)).filter_by(id=game_id).one()


@router.delete("/{game_id}", status_code=204)
def delete_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    db.delete(game)
    db.commit()


def _normalize_title(title: str) -> str:
    """Convert No-Intro article-last format to natural search form.
    'Legend of Zelda, The' → 'The Legend of Zelda'
    """
    m = re.match(r"^(.+),\s+(The|A|An)$", title, re.IGNORECASE)
    if m:
        return f"{m.group(2)} {m.group(1)}"
    return title


def _sanitize_query(q: str) -> str:
    """Strip characters that Newznab/Solr backends treat as query syntax."""
    q = re.sub(r'[:\!\?"#]', " ", q)
    return re.sub(r"\s{2,}", " ", q).strip()


# Maps no_intro_name → (query_keyword, release_title_pattern)
# query_keyword: short term appended to the search query to narrow indexer results
# release_title_pattern: regex that identifies this platform in release title strings
_PLATFORM_HINTS: dict[str, tuple[str, str]] = {
    "Nintendo - Nintendo Entertainment System": ("NES", r"\bNES\b|\bFamicom\b"),
    "Nintendo - Super Nintendo Entertainment System": ("SNES", r"\bSNES\b|\bSFC\b"),
    "Nintendo - Nintendo 64": ("N64", r"\bN64\b"),
    "Nintendo - GameCube": ("GameCube", r"\bGCN\b|\bNGC\b|\bGameCube\b"),
    "Nintendo - Nintendo GameCube": ("GameCube", r"\bGCN\b|\bNGC\b|\bGameCube\b"),
    "Nintendo - Wii": ("Wii", r"\bWii\b(?!\s*U)"),
    "Nintendo - Wii U": ("WiiU", r"\bWiiU\b|\bWii\s+U\b"),
    "Nintendo - Nintendo Switch": ("Switch", r"\bSwitch\b|\bNSP\b|\bXCI\b|\bNSW\b"),
    "Nintendo - Game Boy": ("Game Boy", r"\bGame\s*Boy\b(?!\s*(Advance|Color))"),
    "Nintendo - Game Boy Color": ("GBC", r"\bGBC\b|\bGame\s*Boy\s*Color\b"),
    "Nintendo - Game Boy Advance": ("GBA", r"\bGBA\b|\bGame\s*Boy\s*Advance\b"),
    "Nintendo - Nintendo DS": ("NDS", r"\bNDS\b|\bDS(?!i)\b"),
    "Nintendo - Nintendo 3DS": ("3DS", r"\b3DS\b"),
    "Sony - PlayStation": ("PSX", r"\bPSX\b|\bPS1\b"),
    "Sony - PlayStation 2": ("PS2", r"\bPS2\b"),
    "Sony - PlayStation 3": ("PS3", r"\bPS3\b"),
    "Sony - PlayStation 4": ("PS4", r"\bPS4\b"),
    "Sony - PlayStation 5": ("PS5", r"\bPS5\b"),
    "Sony - PlayStation Portable": ("PSP", r"\bPSP\b"),
    "Sony - PlayStation Vita": ("Vita", r"\bVita\b|\bPSVita\b"),
    "Sega - Mega Drive - Genesis": ("Genesis", r"\bGenesis\b|\bMega\s*Drive\b"),
    "Sega - Master System - Mark III": ("SMS", r"\bSMS\b|\bMaster\s*System\b"),
    "Sega - Game Gear": ("Game Gear", r"\bGame\s*Gear\b"),
    "Sega - 32X": ("32X", r"\b32X\b"),
    "Sega - Saturn": ("Saturn", r"\bSaturn\b"),
    "Sega - Dreamcast": ("Dreamcast", r"\bDreamcast\b"),
    "Atari - 2600": ("Atari 2600", r"\bAtari\b|\b2600\b"),
    "SNK - Neo Geo Pocket Color": ("NGPC", r"\bNGPC\b|\bNeo\s*Geo\s*Pocket\b"),
    "Microsoft - Xbox": ("Xbox", r"\bXbox\b|\bXBOX\b"),
    "Microsoft - Xbox 360": ("Xbox 360", r"\bX360\b|\bXbox\s*360\b"),
}

# Pre-compiled per-platform patterns (keyed by no_intro_name)
_PLATFORM_PATTERNS: dict[str, re.Pattern] = {
    key: re.compile(pat, re.IGNORECASE)
    for key, (_, pat) in _PLATFORM_HINTS.items()
}


def _other_platform_re(no_intro_name: str) -> re.Pattern | None:
    """Returns a regex that matches any platform marker EXCEPT the given platform."""
    others = [pat for key, (_, pat) in _PLATFORM_HINTS.items() if key != no_intro_name]
    if not others:
        return None
    return re.compile("|".join(f"(?:{p})" for p in others), re.IGNORECASE)


@router.get("/{game_id}/search")
async def manual_search(
    game_id: int,
    q: str | None = Query(None, description="Override search query"),
    db: Session = Depends(get_db),
):
    game = db.query(Game).options(joinedload(Game.platform)).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    platform_no_intro = game.platform.no_intro_name if game.platform else None
    platform_hint = _PLATFORM_HINTS.get(platform_no_intro) if platform_no_intro else None

    query = q if q else _sanitize_query(_normalize_title(game.title))

    # Grab history for this game keyed by release title
    grabbed: dict[str, str] = {
        h.source_title: h.date.isoformat()
        for h in db.query(HistoryItem)
        .filter(
            HistoryItem.game_id == game_id,
            HistoryItem.event_type == HistoryEventType.GRABBED,
        )
        .all()
    }

    # Blocklist rejections for this game keyed by release title
    blocklisted: dict[str, str] = {
        b.source_title: b.reason
        for b in db.query(BlocklistItem).filter_by(game_id=game_id).all()
    }

    indexers = db.query(Indexer).filter_by(enabled=True).all()
    all_results = []
    indexer_errors: list[dict] = []
    for indexer in indexers:
        try:
            cats = [
                int(c)
                for c in (indexer.categories or "").split(",")
                if c.strip().isdigit()
            ]
            # Default to Newznab category 1000 (Console) so we never get
            # movies/TV back from a general indexer with no categories set.
            results = await search_indexer(indexer, query, categories=cats or [1000])
            all_results.extend(
                [
                    {
                        "title": r.title,
                        "indexer": r.indexer,
                        "indexer_id": indexer.id,
                        "size": r.size,
                        "seeders": r.seeders,
                        "leechers": r.leechers,
                        "protocol": r.protocol,
                        "link": r.link,
                        "publish_date": r.publish_date.isoformat() if r.publish_date else None,
                        "grabbed_at": grabbed.get(r.title),
                        "rejections": [blocklisted[r.title]] if r.title in blocklisted else [],
                    }
                    for r in results
                ]
            )
        except Exception as exc:
            logger.warning("Search failed for indexer '%s': %s", indexer.name, exc)
            indexer_errors.append({"indexer": indexer.name, "error": str(exc)})

    # Cross-platform filter: drop results that name a different console.
    # Only applied when using the auto-generated query (not a manual override).
    if not q and platform_no_intro:
        other_re = _other_platform_re(platform_no_intro)
        if other_re:
            before = len(all_results)
            all_results = [r for r in all_results if not other_re.search(r["title"])]
            removed = before - len(all_results)
            if removed:
                logger.info(
                    "Platform filter removed %d cross-platform result(s) for '%s'",
                    removed, platform_no_intro,
                )

    all_results.sort(key=lambda r: r["seeders"] or 0, reverse=True)
    log_event(
        "Search",
        f"Manual search for \"{game.title}\" (query: \"{query}\") — "
        f"{len(all_results)} result(s) across {len(indexers)} indexer(s)",
    )
    return {"results": all_results, "errors": indexer_errors, "query": query}


@router.post("/{game_id}/grab")
async def grab_release(game_id: int, payload: GrabPayload, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    clients = (
        db.query(DownloadClient).filter_by(enabled=True).order_by(DownloadClient.priority).all()
    )
    if not clients:
        raise HTTPException(status_code=400, detail="No download clients configured")

    client_model = clients[0]
    client = get_client(client_model)

    try:
        download_id = await client.add(payload.link, payload.title)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Download client error: {exc}")

    item = QueueItem(
        game_id=game_id,
        title=payload.title,
        status=QueueStatus.QUEUED,
        size=payload.size,
        download_id=download_id,
        download_client_id=client_model.id,
        indexer_id=payload.indexer_id,
        protocol=payload.protocol,
    )
    db.add(item)
    game.status = GameStatus.GRABBED
    db.commit()
    db.refresh(item)

    log_event(
        "Grab",
        f"Grabbed \"{payload.title}\" for \"{game.title}\" via {client_model.name} "
        f"({payload.protocol}, download_id={download_id})",
    )
    return {"success": True, "download_id": download_id, "queue_item_id": item.id}
