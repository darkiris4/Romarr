import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class GameStatus(str, enum.Enum):
    WANTED = "wanted"
    GRABBED = "grabbed"
    DOWNLOADING = "downloading"
    IMPORTED = "imported"
    FAILED = "failed"


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id"), nullable=False)
    status: Mapped[GameStatus] = mapped_column(Enum(GameStatus), default=GameStatus.WANTED)
    igdb_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String, nullable=True)
    release_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    region: Mapped[str] = mapped_column(String, default="USA")
    monitored: Mapped[bool] = mapped_column(Boolean, default=True)
    rom_path: Mapped[str | None] = mapped_column(String, nullable=True)
    checksum_sha1: Mapped[str | None] = mapped_column(String, nullable=True)
    checksum_md5: Mapped[str | None] = mapped_column(String, nullable=True)
    checksum_crc32: Mapped[str | None] = mapped_column(String, nullable=True)
    summary: Mapped[str | None] = mapped_column(String, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    game_modes: Mapped[str | None] = mapped_column(String, nullable=True)
    themes: Mapped[str | None] = mapped_column(String, nullable=True)
    similar_games: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[str | None] = mapped_column(String, nullable=True)
    igdb_searched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_searched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    platform: Mapped["Platform"] = relationship("Platform", back_populates="games")
    queue_items: Mapped[list["QueueItem"]] = relationship("QueueItem", back_populates="game")
    history_items: Mapped[list["HistoryItem"]] = relationship("HistoryItem", back_populates="game")
