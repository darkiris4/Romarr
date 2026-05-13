from datetime import datetime, timezone

from fastapi import APIRouter, Query

from ...services.igdb_service import _credentials, _get_token, _igdb_query

router = APIRouter()


@router.get("/search")
def search_igdb(q: str = Query(..., min_length=1)):
    """Search IGDB for games matching a title query. Returns up to 15 candidates."""
    client_id, _ = _credentials()
    token = _get_token()
    if not token:
        return []

    safe_q = q.replace('"', '\\"')
    body = (
        f'search "{safe_q}"; '
        f'fields id, name, first_release_date, cover.image_id, summary, platforms; '
        f'limit 15;'
    )
    results = _igdb_query(client_id, token, body)

    out = []
    for game in results:
        cover_url = None
        if cover := game.get("cover"):
            if isinstance(cover, dict) and (img_id := cover.get("image_id")):
                cover_url = f"https://images.igdb.com/igdb/image/upload/t_cover_big/{img_id}.jpg"

        release_year = None
        if ts := game.get("first_release_date"):
            release_year = datetime.fromtimestamp(ts, tz=timezone.utc).year

        out.append({
            "igdb_id": game["id"],
            "name": game.get("name"),
            "cover_url": cover_url,
            "release_year": release_year,
            "summary": game.get("summary"),
            "igdb_platform_ids": game.get("platforms") or [],
        })

    return out
