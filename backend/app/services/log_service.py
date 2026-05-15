"""
Rolling log file management.

Files written to <data_dir>/logs/:
  romarr.txt            — current standard log (INFO+)
  romarr.0.txt          — most recent backup
  romarr.N.txt          — up to 50 backups (51 total)

When log_level = "debug":
  romarr.debug.txt, romarr.debug.0.txt, …  (DEBUG+)

When log_level = "trace":
  romarr.trace.txt, romarr.trace.0.txt, …  (TRACE+)
"""

from __future__ import annotations

import logging
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

from ..config import settings

# Custom TRACE level (below DEBUG=10)
TRACE_LEVEL = 5
logging.addLevelName(TRACE_LEVEL, "TRACE")

_LOG_FMT = "%(asctime)s [%(levelname)-5s] %(name)s: %(message)s"
_DATE_FMT = "%Y-%m-%d %H:%M:%S"
_MAX_BYTES = 1_048_576   # 1 MB per file
_BACKUP_COUNT = 50       # 50 backups + 1 current = 51 total

_handlers: list[RotatingFileHandler] = []
_lock = threading.Lock()
_current_level = "info"


def _make_namer(log_dir: Path, stem: str):
    """
    Transforms Python's default ".N" suffix naming into "stem.{N-1}.txt".
    e.g.  romarr.txt.1 → romarr.0.txt
          romarr.debug.txt.1 → romarr.debug.0.txt
    """
    def namer(default_name: str) -> str:
        p = Path(default_name)
        n = int(p.suffix.lstrip(".")) - 1
        return str(log_dir / f"{stem}.{n}.txt")
    return namer


def setup_logging(log_level: str = "info") -> None:
    """Configure (or reconfigure) file-based rotating log handlers."""
    global _handlers, _current_level

    log_dir = settings.log_dir
    log_dir.mkdir(parents=True, exist_ok=True)

    with _lock:
        root = logging.getLogger()
        for h in _handlers:
            root.removeHandler(h)
            h.close()
        _handlers = []

        fmt = logging.Formatter(_LOG_FMT, datefmt=_DATE_FMT)
        level = log_level.lower()

        def _add(stem: str, min_level: int) -> None:
            h = RotatingFileHandler(
                log_dir / f"{stem}.txt",
                maxBytes=_MAX_BYTES,
                backupCount=_BACKUP_COUNT,
                encoding="utf-8",
            )
            h.namer = _make_namer(log_dir, stem)
            h.setLevel(min_level)
            h.setFormatter(fmt)
            root.addHandler(h)
            _handlers.append(h)

        # Root captures everything; individual handlers filter by level
        root.setLevel(TRACE_LEVEL)

        _add("romarr", logging.INFO)
        if level in ("debug", "trace"):
            _add("romarr.debug", logging.DEBUG)
        if level == "trace":
            _add("romarr.trace", TRACE_LEVEL)

        _current_level = level


def get_log_level() -> str:
    return _current_level


def list_log_files() -> list[dict]:
    log_dir = settings.log_dir
    if not log_dir.exists():
        return []

    files = []
    for f in log_dir.glob("romarr*.txt"):
        stat = f.stat()
        name = f.name
        if ".trace" in name:
            log_type = "trace"
        elif ".debug" in name:
            log_type = "debug"
        else:
            log_type = "standard"
        files.append({
            "filename": name,
            "size": stat.st_size,
            "last_modified": stat.st_mtime,
            "log_type": log_type,
        })

    return sorted(files, key=lambda x: x["last_modified"], reverse=True)


def clear_log_files() -> None:
    """Close all handlers, delete every log file, then reinitialize."""
    log_dir = settings.log_dir

    # First pass: close open file handles
    setup_logging(_current_level)

    # Delete all log files
    if log_dir.exists():
        for f in log_dir.glob("romarr*.txt"):
            f.unlink(missing_ok=True)

    # Second pass: reopen handlers to fresh (empty) files
    setup_logging(_current_level)
