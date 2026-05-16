from datetime import datetime

from pydantic import BaseModel


class GameMinimal(BaseModel):
    id: int
    title: str
    model_config = {"from_attributes": True}


class BlocklistOut(BaseModel):
    id: int
    game_id: int
    game: GameMinimal | None = None
    source_title: str
    indexer: str
    protocol: str
    reason: str
    added_at: datetime
    model_config = {"from_attributes": True}


class BlocklistCreate(BaseModel):
    game_id: int
    source_title: str
    indexer: str = ""
    protocol: str = ""
    reason: str = "manual"
