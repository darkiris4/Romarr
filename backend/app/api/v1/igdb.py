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
        f'fields id, name, first_release_date, cover.image_id, summary, platforms.id, platforms.name, category,'
        f' total_rating, aggregated_rating, rating; '
        f'limit 50;'
    )
    results = _igdb_query(client_id, token, body)

    # Prefer main games (category 0) over ports/remasters/remakes, then oldest first.
    # IGDB returns results by relevance; this re-sorts so the original release
    # surfaces above modern re-releases (e.g. Switch Online ports of N64 titles).
    _PREFERRED_CATEGORIES = {0, 10}  # main_game, expanded_game
    _EXCLUDED_CATEGORIES = {1, 5, 6, 7}  # dlc, mod, episode, season — never ROMs
    results = [g for g in results if g.get("category", 0) not in _EXCLUDED_CATEGORIES]
    results.sort(key=lambda g: (
        0 if g.get("category", 0) in _PREFERRED_CATEGORIES else 1,
        g.get("first_release_date") or float("inf"),
    ))

    out = []
    for game in results:
        cover_url = None
        if cover := game.get("cover"):
            if isinstance(cover, dict) and (img_id := cover.get("image_id")):
                cover_url = f"https://images.igdb.com/igdb/image/upload/t_cover_big/{img_id}.jpg"

        release_year = None
        if ts := game.get("first_release_date"):
            release_year = datetime.fromtimestamp(ts, tz=timezone.utc).year

        platform_names = [
            p["name"] for p in (game.get("platforms") or [])
            if isinstance(p, dict) and p.get("name")
        ]
        platform_ids = [
            p["id"] for p in (game.get("platforms") or [])
            if isinstance(p, dict) and p.get("id")
        ]

        rating = (
            game.get("total_rating")
            or game.get("aggregated_rating")
            or game.get("rating")
        )

        out.append({
            "igdb_id": game["id"],
            "name": game.get("name"),
            "cover_url": cover_url,
            "release_year": release_year,
            "summary": game.get("summary"),
            "platforms": platform_names,
            "platform_ids": platform_ids,
            "rating": round(rating) if rating else None,
        })

    return out
