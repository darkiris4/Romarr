"""
IGDB List Plugin.

Fetches a user's game collection or a custom game list from IGDB (via Twitch API).

Required config keys:
    client_id      — Twitch application Client ID
    client_secret  — Twitch application Client Secret
    platform_map   — dict mapping IGDB platform ID → Romarr platform_id
                     e.g. {"18": 1, "19": 2}  (18=SNES, 19=N64 in IGDB)

Optional config keys:
    game_ids       — list of specific IGDB game IDs to import
    collection_id  — IGDB collection ID to import
    min_rating     — only import games with IGDB rating ≥ this value (0–100)
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..base import ListPlugin, WantedItem

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_IGDB_API = "https://api.igdb.com/v4"

# IGDB platform IDs for common retro platforms
IGDB_PLATFORM_NAMES: dict[int, str] = {
    18: "Super Nintendo Entertainment System",
    19: "Nintendo 64",
    21: "Nintendo Entertainment System",
    22: "Game Boy Color",
    24: "Game Boy Advance",
    33: "Game Boy",
    35: "Sega Game Gear",
    29: "Sega Mega Drive / Genesis",
    64: "PlayStation",
    8: "PlayStation 2",
    38: "PlayStation Portable",
}


class IGDBListPlugin(ListPlugin):
    name = "igdb"
    description = "Import a game list or collection from IGDB"
    config_schema = {
        "type": "object",
        "properties": {
            "client_id": {"type": "string", "title": "Twitch Client ID"},
            "client_secret": {"type": "string", "title": "Twitch Client Secret"},
            "platform_map": {"type": "object", "title": "IGDB Platform ID → Romarr Platform ID"},
            "game_ids": {"type": "array", "items": {"type": "integer"}, "title": "Game IDs"},
            "min_rating": {"type": "number", "title": "Minimum Rating (0–100)"},
        },
        "required": ["client_id", "client_secret"],
    }

    async def fetch(self) -> list[WantedItem]:
        token = await self._get_token()
        headers = {
            "Client-ID": self.config["client_id"],
            "Authorization": f"Bearer {token}",
        }
        platform_map: dict[str, int] = self.config.get("platform_map", {})
        min_rating: float = self.config.get("min_rating", 0)
        game_ids: list[int] = self.config.get("game_ids", [])

        if not game_ids:
            logger.warning("IGDB plugin: no game_ids configured, nothing to fetch")
            return []

        ids_str = ",".join(str(i) for i in game_ids)
        body = (
            f"fields id,name,cover.url,first_release_date,platforms,rating; "
            f"where id = ({ids_str}); limit 500;"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_IGDB_API}/games",
                headers=headers,
                content=body,
            )
            resp.raise_for_status()
            games = resp.json()

        items: list[WantedItem] = []
        for game in games:
            if min_rating and game.get("rating", 0) < min_rating:
                continue

            for igdb_platform_id in game.get("platforms", []):
                romarr_platform_id = platform_map.get(str(igdb_platform_id))
                if romarr_platform_id is None:
                    continue

                cover_url = None
                if game.get("cover"):
                    raw = game["cover"].get("url", "")
                    cover_url = raw.replace("t_thumb", "t_cover_big")
                    if cover_url.startswith("//"):
                        cover_url = "https:" + cover_url

                release_year = None
                if game.get("first_release_date"):
                    from datetime import datetime, timezone

                    release_year = datetime.fromtimestamp(
                        game["first_release_date"], tz=timezone.utc
                    ).year

                items.append(
                    WantedItem(
                        title=game["name"],
                        platform_id=romarr_platform_id,
                        igdb_id=game["id"],
                        cover_url=cover_url,
                        release_year=release_year,
                    )
                )
        return items

    async def _get_token(self) -> str:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _TOKEN_URL,
                params={
                    "client_id": self.config["client_id"],
                    "client_secret": self.config["client_secret"],
                    "grant_type": "client_credentials",
                },
            )
            resp.raise_for_status()
        return resp.json()["access_token"]

    def validate_config(self) -> list[str]:
        errors = []
        if not self.config.get("client_id"):
            errors.append("client_id is required")
        if not self.config.get("client_secret"):
            errors.append("client_secret is required")
        return errors
