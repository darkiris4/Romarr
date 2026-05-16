from datetime import datetime

from pydantic import BaseModel, computed_field

from ..models.queue_item import QueueStatus
from .game import GameOut


class QueueItemOut(BaseModel):
    id: int
    game_id: int
    title: str
    status: QueueStatus
    size: int
    size_downloaded: int
    download_id: str | None
    download_client_id: int | None
    indexer_id: int | None
    protocol: str
    added_at: datetime
    estimated_completion: datetime | None
    error_message: str | None
    game: GameOut | None = None

    @computed_field
    @property
    def progress(self) -> float:
        if self.size == 0:
            return 0.0
        return round(self.size_downloaded / self.size * 100, 1)

    model_config = {"from_attributes": True}
