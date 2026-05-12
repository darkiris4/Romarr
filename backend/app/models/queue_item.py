import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class QueueStatus(str, enum.Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"
    IMPORT_PENDING = "importPending"


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[QueueStatus] = mapped_column(
        Enum(QueueStatus), default=QueueStatus.QUEUED
    )
    size: Mapped[int] = mapped_column(Integer, default=0)
    size_downloaded: Mapped[int] = mapped_column(Integer, default=0)
    download_id: Mapped[str | None] = mapped_column(String, nullable=True)
    download_client_id: Mapped[int | None] = mapped_column(
        ForeignKey("download_clients.id"), nullable=True
    )
    indexer_id: Mapped[int | None] = mapped_column(
        ForeignKey("indexers.id"), nullable=True
    )
    protocol: Mapped[str] = mapped_column(String, default="torrent")
    indexer_flags: Mapped[str] = mapped_column(String, default="")
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    estimated_completion: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    game: Mapped["Game"] = relationship("Game", back_populates="queue_items")
    download_client: Mapped["DownloadClient | None"] = relationship("DownloadClient")
    indexer: Mapped["Indexer | None"] = relationship("Indexer")
