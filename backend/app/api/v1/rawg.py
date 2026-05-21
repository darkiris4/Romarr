from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/search")
def search_rawg(q: str = Query(..., min_length=1)):
    """Search RAWG for games matching a title query."""
    from ...services.rawg_service import search_games

    return search_games(q)
