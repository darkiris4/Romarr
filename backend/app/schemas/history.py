from datetime import datetime

from pydantic import BaseModel

from ..models.history import HistoryEventType
from .game import GameOut


class HistoryItemOut(BaseModel):
    id: int
    game_id: int
    event_type: HistoryEventType
    source_title: str
    indexer: str
    download_client: str
    data: str
    date: datetime
    game: GameOut | None = None

    model_config = {"from_attributes": True}
