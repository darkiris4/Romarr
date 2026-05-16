import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.blocklist import BlocklistItem
from ...models.download_client import DownloadClient
from ...models.game import Game, GameStatus
from ...models.history import HistoryEventType, HistoryItem
from ...models.indexer import Indexer
from ...models.queue_item import QueueItem, QueueStatus
from ...schemas.game import GameCreate, GameOut, GameUpdate
from ...services.download_service import get_client
from ...services.event_service import log_event
from ...services.indexer_service import search_indexer
from ...services.search_utils import (
    normalize_title,
    other_platform_re,
    sanitize_query,
)


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
    full = db.query(Game).options(joinedload(Game.platform)).filter_by(id=game.id).one()
    platform_name = full.platform.name if full.platform else "Unknown"
    log_event("Library", f"Added \"{game.title}\" ({platform_name})")
    return full


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
    updates = payload.model_dump(exclude_none=True)
    if "monitored" in updates and updates["monitored"] != game.monitored:
        state = "Monitored" if updates["monitored"] else "Unmonitored"
        log_event("Library", f"\"{game.title}\" set to {state}")
    for key, value in updates.items():
        setattr(game, key, value)
    db.commit()
    return db.query(Game).options(joinedload(Game.platform)).filter_by(id=game_id).one()


@router.delete("/{game_id}", status_code=204)
def delete_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    log_event("Library", f"Deleted \"{game.title}\"")
    db.delete(game)
    db.commit()




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

    query = q if q else sanitize_query(normalize_title(game.title))

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
            results = await search_indexer(indexer, query, categories=cats or None)
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
        other_re = other_platform_re(platform_no_intro)
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
    db.add(HistoryItem(
        game_id=game_id,
        event_type=HistoryEventType.GRABBED,
        source_title=payload.title,
        indexer=payload.indexer,
        download_client=client_model.name,
        data=json.dumps({
            "download_id": download_id,
            "protocol": payload.protocol,
            "size": payload.size,
            "indexer_id": payload.indexer_id,
        }),
    ))
    game.status = GameStatus.GRABBED
    db.commit()
    db.refresh(item)

    log_event(
        "Grab",
        f"Grabbed \"{payload.title}\" for \"{game.title}\" via {client_model.name} "
        f"({payload.protocol}, download_id={download_id})",
    )
    return {"success": True, "download_id": download_id, "queue_item_id": item.id}
