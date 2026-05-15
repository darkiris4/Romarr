import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ...config import settings
from ...services.log_service import list_log_files, clear_log_files, get_log_level, setup_logging
from ...services.config_service import get_config, set_config

router = APIRouter()

_VALID_FILENAME = re.compile(r"^romarr[\w.]*\.txt$")


@router.get("/files")
def get_log_files():
    return {
        "log_dir": str(settings.log_dir.resolve()),
        "files": list_log_files(),
    }


@router.get("/download/{filename}")
def download_log(filename: str):
    if not _VALID_FILENAME.match(filename):
        raise HTTPException(status_code=422, detail="Invalid filename")
    path = settings.log_dir / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Log file not found")
    return FileResponse(path, media_type="text/plain", filename=filename)


@router.delete("/files", status_code=204)
def clear_logs():
    clear_log_files()


@router.get("/level")
def get_level():
    return {"level": get_config("log_level", "info")}


class LogLevelPayload(BaseModel):
    level: str


@router.put("/level")
def set_level(payload: LogLevelPayload):
    level = payload.level.lower()
    if level not in ("info", "debug", "trace"):
        raise HTTPException(status_code=422, detail="level must be info, debug, or trace")
    set_config("log_level", level)
    setup_logging(level)
    return {"level": level}
