from datetime import datetime
from pydantic import BaseModel
from ..models.game import GameStatus
from .platform import PlatformOut


class GameBase(BaseModel):
    title: str
    platform_id: int
    region: str = "USA"
    igdb_id: int | None = None
    cover_url: str | None = None
    release_year: int | None = None
    monitored: bool = True


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    title: str | None = None
    platform_id: int | None = None
    region: str | None = None
    igdb_id: int | None = None
    cover_url: str | None = None
    release_year: int | None = None
    monitored: bool | None = None
    status: GameStatus | None = None


class GameOut(GameBase):
    id: int
    status: GameStatus
    rom_path: str | None
    checksum_sha1: str | None
    checksum_md5: str | None
    checksum_crc32: str | None
    file_size: int | None = None
    relative_rom_path: str | None = None
    summary: str | None = None
    rating: float | None = None
    game_modes: str | None = None
    themes: str | None = None
    similar_games: str | None = None
    platform: PlatformOut | None = None
    added_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
