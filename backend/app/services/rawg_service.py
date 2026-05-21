"""
RAWG metadata fetcher.
API key stored in app_config DB table (Settings → Metadata); RAWG_API_KEY env var as fallback.
Free tier: up to 20,000 requests/month. No auth required for basic reads, but a key raises limits.
"""

from __future__ import annotations

import json
import logging
import re
import time

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_RAWG_BASE = "https://api.rawg.io/api"
_MIN_INTERVAL = 0.1  # stay well under the free-tier rate limit
_last_request: float = 0.0


def _api_key() -> str:
    from .config_service import get_config

    return get_config("rawg_api_key") or settings.rawg_api_key


def test_credentials() -> tuple[bool, str]:
    key = _api_key()
    if not key:
        return False, "RAWG API key is not configured."
    try:
        resp = httpx.get(
            f"{_RAWG_BASE}/games",
            params={"key": key, "page_size": 1},
            timeout=10,
        )
        if resp.status_code in (401, 403):
            return False, "API key rejected by RAWG — check your key."
        resp.raise_for_status()
        return True, "Connected to RAWG successfully."
    except httpx.HTTPError as exc:
        return False, str(exc)


def _get(path: str, params: dict) -> dict | None:
    global _last_request
    key = _api_key()
    if not key:
        return None
    elapsed = time.monotonic() - _last_request
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _last_request = time.monotonic()
    try:
        resp = httpx.get(
            f"{_RAWG_BASE}/{path.lstrip('/')}",
            params={"key": key, **params},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        logger.warning("RAWG request error (%s): %s", path, exc)
        return None


def _build_metadata(game: dict) -> dict:
    cover_url = game.get("background_image")

    release_year = None
    if released := game.get("released"):
        try:
            release_year = int(str(released)[:4])
        except (ValueError, TypeError):
            pass

    # Prefer Metacritic (0-100) over RAWG rating (0-5 → ×20)
    metacritic = game.get("metacritic")
    rating_raw = game.get("rating")
    if metacritic:
        rating = float(metacritic)
    elif rating_raw:
        rating = round(float(rating_raw) * 20, 1)
    else:
        rating = None

    # Genres are the closest RAWG equivalent to IGDB themes
    genres = [g["name"] for g in (game.get("genres") or []) if isinstance(g, dict)]

    summary = game.get("description_raw") or None
    if summary:
        # Strip any residual HTML tags
        summary = re.sub(r"<[^>]+>", "", summary).strip() or None

    return {
        "rawg_id": game["id"],
        "cover_url": cover_url,
        "release_year": release_year,
        "summary": summary,
        "rating": rating,
        "game_modes": None,
        "themes": json.dumps(genres) if genres else None,
        "similar_games": None,
        "collection_id": None,
        "collection_name": None,
    }


def search_games(query: str) -> list[dict]:
    """Search RAWG for games matching a title. Returns up to 20 results."""
    data = _get("games", {"search": query, "page_size": 20})
    if not data:
        return []

    results = []
    for game in data.get("results", []):
        platform_names = [
            p["platform"]["name"]
            for p in (game.get("platforms") or [])
            if isinstance(p, dict) and isinstance(p.get("platform"), dict)
        ]
        metacritic = game.get("metacritic")
        rating_raw = game.get("rating")
        if metacritic:
            rating = int(metacritic)
        elif rating_raw:
            rating = round(float(rating_raw) * 20)
        else:
            rating = None

        release_year = None
        if released := game.get("released"):
            try:
                release_year = int(str(released)[:4])
            except (ValueError, TypeError):
                pass

        results.append(
            {
                "rawg_id": game["id"],
                "name": game.get("name"),
                "cover_url": game.get("background_image"),
                "release_year": release_year,
                "summary": None,
                "platforms": platform_names,
                "platform_ids": [],
                "rating": rating,
            }
        )
    return results


def fetch_game_metadata(title: str) -> dict | None:
    """Search RAWG for a game by title and return full metadata for the best match."""
    results = search_games(title)
    if not results:
        return None
    return fetch_enrichment_by_id(results[0]["rawg_id"])


def fetch_enrichment_by_id(rawg_id: int) -> dict | None:
    """Fetch full metadata for a known RAWG game ID."""
    data = _get(f"games/{rawg_id}", {})
    if not isinstance(data, dict) or "id" not in data:
        return None
    return _build_metadata(data)
