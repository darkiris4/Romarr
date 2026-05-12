from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.game import Game, GameStatus
from ...schemas.game import GameOut

router = APIRouter()


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
