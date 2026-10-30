"""Helpers for building file names and restricting file operations to managed folders."""

from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

_UNSAFE_CHARS = re.compile(r'[\x00-\x1f\x7f/\\<>:"|?*]')
_MAX_NAME_BYTES = 200


def safe_filename(name: str, fallback: str = "file") -> str:
    """Return ``name`` as a single path component that is safe to create on any platform.

    Path separators, control characters and characters Windows rejects become underscores.
    Names that would be empty, ``.`` or ``..`` are replaced by ``fallback``.
    """
    cleaned = _UNSAFE_CHARS.sub("_", name).strip().rstrip(". ")
    if cleaned in ("", ".", ".."):
        cleaned = fallback
    encoded = cleaned.encode("utf-8")
    if len(encoded) > _MAX_NAME_BYTES:
        cleaned = encoded[:_MAX_NAME_BYTES].decode("utf-8", errors="ignore").rstrip(". ")
    return cleaned or fallback


def is_within(path: str | Path, roots: list[Path]) -> bool:
    """True when ``path`` resolves to a location inside any of ``roots``."""
    try:
        resolved = Path(path).expanduser().resolve()
    except (OSError, RuntimeError):
        return False
    for root in roots:
        try:
            if resolved.is_relative_to(root.expanduser().resolve()):
                return True
        except (OSError, RuntimeError):
            continue
    return False


def managed_roots(db: Session) -> list[Path]:
    """Folders Romarr is allowed to modify: root folders, the curated library and the library."""
    from ..config import settings
    from ..models.root_folder import RootFolder
    from .config_service import get_config

    roots = [Path(folder.path) for folder in db.query(RootFolder).all()]
    curated = get_config("curated_library_path", "").strip()
    if curated:
        roots.append(Path(curated))
    if settings.rom_library_path:
        roots.append(Path(settings.rom_library_path))
    return roots


def is_managed_path(db: Session, path: str | Path) -> bool:
    """True when ``path`` lies inside a folder Romarr manages."""
    return is_within(path, managed_roots(db))
