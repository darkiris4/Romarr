from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from ...database import get_db
from ...models.game import Game
from ...schemas.game import GameOut

router = APIRouter()


@router.get("", response_model=list[GameOut])
def get_calendar(
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
):
    """Return games with a release date in [start, end] (year-based)."""
    return (
        db.query(Game)
        .options(joinedload(Game.platform))
        .filter(
            Game.release_year >= start.year,
            Game.release_year <= end.year,
        )
        .order_by(Game.release_year, Game.title)
        .all()
    )
