import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.game import Game, GameStatus
from ...schemas.game import GameCreate, GameOut, GameUpdate
from ...services.indexer_service import search_indexer
from ...models.indexer import Indexer

router = APIRouter()


@router.get("", response_model=list[GameOut])
def list_games(
    status: GameStatus | None = None,
    platform_id: int | None = None,
    monitored: bool | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 200,
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


@router.post("/{game_id}/search")
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
                    "size": r.size,
                    "seeders": r.seeders,
                    "protocol": r.protocol,
                    "link": r.link,
                }
                for r in results
            ])
        except Exception:
            pass
    return {"results": all_results}
