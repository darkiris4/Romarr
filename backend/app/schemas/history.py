import json
from datetime import datetime

from pydantic import BaseModel, field_validator

from ..models.history import HistoryEventType
from .game import GameOut


class HistoryItemOut(BaseModel):
    id: int
    game_id: int
    event_type: HistoryEventType
    source_title: str
    indexer: str
    download_client: str
    data: dict = {}
    date: datetime
    game: GameOut | None = None

    @field_validator("data", mode="before")
    @classmethod
    def _parse_data(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return {}
        return v or {}

    model_config = {"from_attributes": True}
