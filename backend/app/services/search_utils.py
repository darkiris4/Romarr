"""Shared helpers for building and filtering indexer search queries."""

from __future__ import annotations

import re


def normalize_title(title: str) -> str:
    """Convert No-Intro article-last format: 'Legend of Zelda, The' → 'The Legend of Zelda'."""
    m = re.match(r"^(.+),\s+(The|A|An)$", title, re.IGNORECASE)
    if m:
        return f"{m.group(2)} {m.group(1)}"
    return title


def sanitize_query(q: str) -> str:
    """Strip characters that Newznab/Solr backends treat as query syntax."""
    q = re.sub(r'[:\!\?"#]', " ", q)
    return re.sub(r"\s{2,}", " ", q).strip()


# Maps no_intro_name → (query_keyword, release_title_pattern)
PLATFORM_HINTS: dict[str, tuple[str, str]] = {
    "Nintendo - Nintendo Entertainment System": ("NES", r"\bNES\b|\bFamicom\b"),
    "Nintendo - Super Nintendo Entertainment System": ("SNES", r"\bSNES\b|\bSFC\b"),
    "Nintendo - Nintendo 64": ("N64", r"\bN64\b"),
    "Nintendo - GameCube": ("GameCube", r"\bGCN\b|\bNGC\b|\bGameCube\b"),
    "Nintendo - Nintendo GameCube": ("GameCube", r"\bGCN\b|\bNGC\b|\bGameCube\b"),
    "Nintendo - Wii": ("Wii", r"\bWii\b(?!\s*U)"),
    "Nintendo - Wii U": ("WiiU", r"\bWiiU\b|\bWii\s+U\b"),
    "Nintendo - Nintendo Switch": ("Switch", r"\bSwitch\b|\bNSP\b|\bXCI\b|\bNSW\b"),
    "Nintendo - Game Boy": ("Game Boy", r"\bGame\s*Boy\b(?!\s*(Advance|Color))"),
    "Nintendo - Game Boy Color": ("GBC", r"\bGBC\b|\bGame\s*Boy\s*Color\b"),
    "Nintendo - Game Boy Advance": ("GBA", r"\bGBA\b|\bGame\s*Boy\s*Advance\b"),
    "Nintendo - Nintendo DS": ("NDS", r"\bNDS\b|\bDS(?!i)\b"),
    "Nintendo - Nintendo 3DS": ("3DS", r"\b3DS\b"),
    "Sony - PlayStation": ("PSX", r"\bPSX\b|\bPS1\b"),
    "Sony - PlayStation 2": ("PS2", r"\bPS2\b"),
    "Sony - PlayStation 3": ("PS3", r"\bPS3\b"),
    "Sony - PlayStation 4": ("PS4", r"\bPS4\b"),
    "Sony - PlayStation 5": ("PS5", r"\bPS5\b"),
    "Sony - PlayStation Portable": ("PSP", r"\bPSP\b"),
    "Sony - PlayStation Vita": ("Vita", r"\bVita\b|\bPSVita\b"),
    "Sega - Mega Drive - Genesis": ("Genesis", r"\bGenesis\b|\bMega\s*Drive\b"),
    "Sega - Master System - Mark III": ("SMS", r"\bSMS\b|\bMaster\s*System\b"),
    "Sega - Game Gear": ("Game Gear", r"\bGame\s*Gear\b"),
    "Sega - 32X": ("32X", r"\b32X\b"),
    "Sega - Saturn": ("Saturn", r"\bSaturn\b"),
    "Sega - Dreamcast": ("Dreamcast", r"\bDreamcast\b"),
    "Atari - 2600": ("Atari 2600", r"\bAtari\b|\b2600\b"),
    "SNK - Neo Geo Pocket Color": ("NGPC", r"\bNGPC\b|\bNeo\s*Geo\s*Pocket\b"),
    "Microsoft - Xbox": ("Xbox", r"\bXbox\b|\bXBOX\b"),
    "Microsoft - Xbox 360": ("Xbox 360", r"\bX360\b|\bXbox\s*360\b"),
}

PLATFORM_PATTERNS: dict[str, re.Pattern] = {
    key: re.compile(pat, re.IGNORECASE)
    for key, (_, pat) in PLATFORM_HINTS.items()
}


def other_platform_re(no_intro_name: str) -> re.Pattern | None:
    """Return a regex matching any platform marker *except* the given platform."""
    others = [pat for key, (_, pat) in PLATFORM_HINTS.items() if key != no_intro_name]
    if not others:
        return None
    return re.compile("|".join(f"(?:{p})" for p in others), re.IGNORECASE)
