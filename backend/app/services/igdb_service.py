"""
IGDB metadata fetcher.
Credentials are read from the app_config DB table first; env vars (settings)
are used as a fallback so existing .env configurations keep working.
"""

from __future__ import annotations

import logging
import re
import time

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_token_cache: dict = {"token": None, "expires_at": 0.0, "client_id": ""}


def _credentials() -> tuple[str, str]:
    """Return (client_id, client_secret) from DB config, falling back to env."""
    from .config_service import get_many
    db = get_many(["igdb_client_id", "igdb_client_secret"])
    client_id = db["igdb_client_id"] or settings.igdb_client_id
    client_secret = db["igdb_client_secret"] or settings.igdb_client_secret
    return client_id, client_secret


def _get_token() -> str | None:
    client_id, client_secret = _credentials()
    if not client_id or not client_secret:
        return None
    now = time.time()
    # Invalidate cache if client_id changed (credentials were updated)
    if (
        _token_cache["token"]
        and _token_cache["client_id"] == client_id
        and now < _token_cache["expires_at"] - 60
    ):
        return _token_cache["token"]
    try:
        resp = httpx.post(
            "https://id.twitch.tv/oauth2/token",
            params={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
            },
            timeout=10,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("IGDB auth failed: %s", exc)
        return None
    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data["expires_in"]
    _token_cache["client_id"] = client_id
    return _token_cache["token"]


def test_credentials() -> tuple[bool, str]:
    """Try to get a token and return (ok, message)."""
    client_id, client_secret = _credentials()
    if not client_id or not client_secret:
        return False, "Client ID and Client Secret are not configured."
    token = _get_token()
    if token:
        return True, "Connected to IGDB successfully."
    return False, "Authentication failed — check your Client ID and Secret."


_ARTICLE_SUFFIX = re.compile(r"^(.+),\s*(The|A|An)$", re.IGNORECASE)
_ROMAN = {"VIII": "8", "VII": "7", "VI": "6", "IV": "4", "IX": "9",
          "III": "3", "II": "2", "V": "5", "X": "10"}
_ROMAN_RE = re.compile(r"\b(VIII|VII|VI|IV|IX|III|II|V|X)\b")

# No-Intro title → IGDB English title.
# Covers three cases: Japanese localizations, European regional names, and No-Intro
# compound-word formatting (removes spaces that IGDB preserves).
_TITLE_ALIASES: dict[str, str] = {
    # European name (TMHT) → US/IGDB name (TMNT)
    "Teenage Mutant Hero Turtles - Fall of the Foot Clan":   "Teenage Mutant Ninja Turtles: Fall of the Foot Clan",
    "Teenage Mutant Hero Turtles II - Back from the Sewers": "Teenage Mutant Ninja Turtles II: Back from the Sewers",
    "Teenage Mutant Hero Turtles III - Radical Rescue":      "Teenage Mutant Ninja Turtles III: Radical Rescue",

    # No-Intro removes spaces in compound proper nouns
    "BattleCity":              "Battle City",
    "SolarStriker":            "Solar Striker",
    "SpaceStation Silicon Valley": "Space Station Silicon Valley",
    "Ninjawarriors":           "The Ninja Warriors Again",

    # Japanese NES titles → English IGDB titles
    "Ninja Ryuuken Den":         "Ninja Gaiden",
    "Konamic Sports in Seoul":   "Konami Sports in Seoul",
    "Bart no Survival Camp":     "Bart Simpsons' Escape from Camp Deadly",

    # Japanese SNES titles → English IGDB titles
    "Akumajou Dracula XX":         "Castlevania: Dracula X",
    "Hoshi no Kirby Super Deluxe": "Kirby Super Star",

    # Japanese GB/GBC titles → English IGDB titles
    "Kirby no Kirakira Kids":              "Kirby's Star Stacker",
    "Stranded Kids":                       "Survival Kids",
    "Estpolis Denki - Yomigaeru Densetsu": "Lufia: The Legend Returns",
    "Bokujou Monogatari 2 GB":             "Harvest Moon 2 GBC",
    "Bokujou Monogatari 3 GB - Boy Meets Girl": "Harvest Moon 3 GBC",
    "Pocket Monsters Eun":                 "Pokemon Silver",
    "Pocket Monsters Geum":                "Pokemon Gold",
    "Pokemon Card GB 2 - GR Dan Sanjou!":  "Pokemon Card GB2: The GR Dan Joins In!",

    # Japanese N64 titles → English IGDB titles
    "Banjo to Kazooie no Daibouken 2": "Banjo-Tooie",

    # Japanese GBA titles → English IGDB titles
    "Hobbit no Bouken - Lord of the Rings - Hajimari no Monogatari": "The Hobbit",
    "Yu-Gi-Oh! Duel Monsters GX - Mezase Duel King!": "Yu-Gi-Oh! GX Duel Academy",
}


def _normalise_title(title: str) -> str:
    """
    Canonical title form for IGDB lookup:
      - "Addams Family, The"  → "The Addams Family"
      - "Mega Man II"         → "Mega Man 2"
    """
    m = _ARTICLE_SUFFIX.match(title)
    if m:
        title = f"{m.group(2)} {m.group(1)}"
    title = _ROMAN_RE.sub(lambda x: _ROMAN[x.group()], title)
    return title


def _title_variants(title: str) -> list[str]:
    """
    Return title forms to try in order: alias first, then normalised original.
    Handles article suffixes, Roman numerals, No-Intro subtitle separators,
    and known Japanese/regional→English title aliases.
    """
    seen: list[str] = []

    def _add(t: str) -> None:
        if t not in seen:
            seen.append(t)

    def _expand(t: str) -> None:
        _add(t)
        if " - " in t:
            _add(t.replace(" - ", ": ", 1))
            _add(t.split(" - ")[0].strip())

    # Alias is tried first (already in IGDB-ready form)
    if alias := _TITLE_ALIASES.get(title):
        _expand(alias)

    # Normalised original (article flip + Roman numerals)
    _expand(_normalise_title(title))

    return seen


def _igdb_query(client_id: str, token: str, body: str) -> list:
    try:
        resp = httpx.post(
            "https://api.igdb.com/v4/games",
            headers={"Client-ID": client_id, "Authorization": f"Bearer {token}"},
            content=body.encode(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        logger.warning("IGDB request error: %s", exc)
        return []


def _run_tiered_search(title: str, igdb_platform_id: int | None) -> tuple[list, list[dict]]:
    """
    Execute the tiered IGDB search and return (results, query_log).
    query_log is a list of {body, hit} dicts for debug inspection.
    """
    client_id, _ = _credentials()
    token = _get_token()
    if not token:
        return [], []

    fields = "fields id, name, first_release_date, cover.image_id;"
    plat = f"& platforms = ({igdb_platform_id})" if igdb_platform_id else ""
    plat_clause = f"where platforms = ({igdb_platform_id});" if igdb_platform_id else ""

    query_log: list[dict] = []
    results = []
    for variant in _title_variants(title):
        safe = variant.replace('"', '\\"')
        attempts = [
            f'{fields} where name = "{safe}" {plat}; limit 1;',
            f'{fields} where name = "{safe}"; limit 1;',
            *(
                [f'search "{safe}"; {fields} {plat_clause} limit 1;']
                if igdb_platform_id else []
            ),
            f'search "{safe}"; {fields} limit 1;',
        ]
        for body in attempts:
            results = _igdb_query(client_id, token, body)
            query_log.append({"body": body, "hit": bool(results),
                               "match": results[0].get("name") if results else None})
            if results:
                break
        if results:
            break

    return results, query_log


def _build_metadata(results: list) -> dict | None:
    if not results:
        return None
    game = results[0]
    cover_url = None
    if cover := game.get("cover"):
        if isinstance(cover, dict):
            if image_id := cover.get("image_id"):
                cover_url = f"https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg"
    release_year = None
    if ts := game.get("first_release_date"):
        from datetime import datetime, timezone
        release_year = datetime.fromtimestamp(ts, tz=timezone.utc).year
    return {"igdb_id": game["id"], "cover_url": cover_url, "release_year": release_year}


def fetch_game_metadata(title: str, igdb_platform_id: int | None = None) -> dict | None:
    """Search IGDB for a game by title (+ optional platform scope)."""
    results, _ = _run_tiered_search(title, igdb_platform_id)
    return _build_metadata(results)


def fetch_game_metadata_debug(
    title: str, igdb_platform_id: int | None = None
) -> tuple[dict | None, list[dict]]:
    """Like fetch_game_metadata but also returns the full query log for debugging."""
    results, query_log = _run_tiered_search(title, igdb_platform_id)
    return _build_metadata(results), query_log
