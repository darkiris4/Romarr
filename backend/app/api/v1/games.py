import os

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.download_client import DownloadClient
from ...models.game import Game, GameStatus
from ...models.queue_item import QueueItem, QueueStatus
from ...schemas.game import GameCreate, GameOut, GameUpdate
from ...services.download_service import get_client
from ...services.indexer_service import search_indexer
from ...models.indexer import Indexer


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


@router.get("/{game_id}/search")
async def manual_search(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    indexers = db.query(Indexer).filter_by(enabled=True).all()
    all_results = []
    for indexer in indexers:
        try:
            results = await search_indexer(indexer, game.title)
            all_results.extend([
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
                }
                for r in results
            ])
        except Exception:
            pass
    all_results.sort(key=lambda r: (r["seeders"] or 0), reverse=True)
    return {"results": all_results}


@router.post("/{game_id}/grab")
async def grab_release(game_id: int, payload: GrabPayload, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    clients = (
        db.query(DownloadClient)
        .filter_by(enabled=True)
        .order_by(DownloadClient.priority)
        .all()
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

    return {"success": True, "download_id": download_id, "queue_item_id": item.id}
