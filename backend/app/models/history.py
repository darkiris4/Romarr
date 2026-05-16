import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class HistoryEventType(str, enum.Enum):
    GRABBED = "grabbed"
    DOWNLOAD_COMPLETE = "downloadComplete"
    DOWNLOAD_FAILED = "downloadFailed"
    IMPORT_FAILED = "importFailed"
    IMPORTED = "imported"
    DELETED = "deleted"
    IGNORED = "ignored"


class HistoryItem(Base):
    __tablename__ = "history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False)
    event_type: Mapped[HistoryEventType] = mapped_column(Enum(HistoryEventType), nullable=False)
    source_title: Mapped[str] = mapped_column(String, default="")
    indexer: Mapped[str] = mapped_column(String, default="")
    download_client: Mapped[str] = mapped_column(String, default="")
    data: Mapped[str] = mapped_column(Text, default="{}")
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    game: Mapped["Game"] = relationship("Game", back_populates="history_items")
