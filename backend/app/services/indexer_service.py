"""
Newznab/Torznab indexer service.

Prowlarr compatibility: point the indexer URL at your Prowlarr instance
(e.g. http://prowlarr:9696/<prowlarr_indexer_id>/api) and Romarr will use
the same Newznab/Torznab protocol transparently.
"""

import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from ..models.indexer import Indexer, IndexerProtocol

logger = logging.getLogger(__name__)

# Patterns that conclusively identify a video/TV release rather than a ROM
_VIDEO_RE = re.compile(
    r"""
    \b(
        \d{3,4}p           |   # 720p, 1080p, 2160p
        4K | UHD            |
        Blu-?Ray | BDRIP    |
        WEB-?DL | WEBRip    |
        HDTV | PDTV         |
        DVDRip | DVDScr     |
        x26[45] | HEVC      |
        H\.26[45]           |
        XviD | DivX         |
        S\d{1,2}E\d{1,2}        # S01E03 TV episode pattern
    )\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Patterns that identify a music/audio release rather than a ROM
_AUDIO_RE = re.compile(
    r"""
    \b(
        MP3 | FLAC | AAC | OGG | OPUS | WMA | ALAC |   # audio codecs
        OST | Soundtrack                             |   # soundtrack labels
        WEB-MP3 | WEB-FLAC | CD-MP3                 |   # scene audio formats
        \d+kbps | \d+K-MP3                          |   # bitrate markers
        Discography | Album | EP \b | Single \b     |   # release types
        Vinyl | Cassette                                 # physical formats
    )\b
    |
    ^VA-                    # "VA-" (Various Artists) prefix used in scene music releases
    |
    -\d{4}-[A-Z0-9]+$      # scene music tag: -YYYY-GROUP at end (e.g. -2017-DDASMP3)
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _looks_like_video(title: str) -> bool:
    return bool(_VIDEO_RE.search(title))


def _looks_like_audio(title: str) -> bool:
    return bool(_AUDIO_RE.search(title))


@dataclass
class SearchResult:
    title: str
    link: str
    size: int
    indexer: str
    protocol: str
    publish_date: datetime | None = None
    categories: list[int] = field(default_factory=list)
    info_hash: str | None = None
    seeders: int | None = None
    leechers: int | None = None
    grabs: int | None = None


async def search_indexer(
    indexer: Indexer,
    query: str,
    categories: list[int] | None = None,
    limit: int = 100,
) -> list[SearchResult]:
    params: dict = {
        "t": "search",
        "q": query,
        "apikey": indexer.api_key,
        "limit": limit,
        "encoding": "xml",
    }
    if categories:
        params["cat"] = ",".join(str(c) for c in categories)

    url = f"{indexer.url.rstrip('/')}/api"
    logger.info("Searching indexer '%s': GET %s params=%s", indexer.name, url, params)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()

    logger.info("Indexer '%s' response (%d): %s", indexer.name, resp.status_code, resp.text[:800])
    results = _parse_newznab_xml(resp.text, indexer.name, indexer.protocol)
    before = len(results)
    results = [
        r for r in results if not _looks_like_video(r.title) and not _looks_like_audio(r.title)
    ]
    filtered = before - len(results)
    if filtered:
        logger.info("Filtered %d non-ROM result(s) from indexer '%s'", filtered, indexer.name)
    return results


async def test_indexer(indexer: Indexer) -> tuple[bool, str]:
    params = {"t": "caps", "apikey": indexer.api_key}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{indexer.url.rstrip('/')}/api", params=params)
            resp.raise_for_status()
        return True, "Connection successful"
    except httpx.HTTPStatusError as exc:
        return False, f"HTTP {exc.response.status_code}"
    except Exception as exc:
        return False, str(exc)


def _parse_newznab_xml(
    xml_text: str, indexer_name: str, protocol: IndexerProtocol
) -> list[SearchResult]:
    ns = {
        "newznab": "http://www.newznab.com/DTD/2010/feeds/attributes/",
        "torznab": "http://torznab.com/schemas/2015/feed",
    }
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        logger.warning("Failed to parse XML response: %s", xml_text[:300])
        return []

    # Newznab/Torznab error element — surface as exception so callers can report it
    error_el = root.find(".//error")
    if error_el is not None:
        code = error_el.get("code", "?")
        desc = error_el.get("description", "unknown error")
        raise ValueError(f"Indexer returned error {code}: {desc}")

    results: list[SearchResult] = []
    for item in root.findall(".//item"):
        title = _text(item, "title")
        link = _text(item, "link") or _text(item, "enclosure", attr="url") or ""
        size = int(_attr_value(item, "size", ns) or _enclosure_length(item) or 0)
        info_hash = _attr_value(item, "infohash", ns)
        seeders_raw = _attr_value(item, "seeders", ns)
        leechers_raw = _attr_value(item, "leechers", ns)
        grabs_raw = _attr_value(item, "grabs", ns)
        pub_date_str = _text(item, "pubDate")

        try:
            pub_date = (
                datetime.strptime(pub_date_str, "%a, %d %b %Y %H:%M:%S %z")
                if pub_date_str
                else None
            )
        except ValueError:
            pub_date = None

        results.append(
            SearchResult(
                title=title or "",
                link=link,
                size=size,
                indexer=indexer_name,
                protocol=protocol.value,
                publish_date=pub_date,
                info_hash=info_hash,
                seeders=int(seeders_raw) if seeders_raw else None,
                leechers=int(leechers_raw) if leechers_raw else None,
                grabs=int(grabs_raw) if grabs_raw else None,
            )
        )
    return results


def _text(element: ET.Element, tag: str, attr: str | None = None) -> str | None:
    child = element.find(tag)
    if child is None:
        return None
    if attr:
        return child.get(attr)
    return child.text


def _attr_value(item: ET.Element, name: str, ns: dict) -> str | None:
    for prefix in ("newznab", "torznab"):
        el = item.find(f"{prefix}:attr[@name='{name}']", ns)
        if el is not None:
            return el.get("value")
    return None


def _enclosure_length(item: ET.Element) -> str | None:
    enc = item.find("enclosure")
    if enc is not None:
        return enc.get("length")
    return None
