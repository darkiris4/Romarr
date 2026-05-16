from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class BlocklistItem(Base):
    __tablename__ = "blocklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False)
    source_title: Mapped[str] = mapped_column(String, nullable=False)
    indexer: Mapped[str] = mapped_column(String, default="")
    protocol: Mapped[str] = mapped_column(String, default="")
    reason: Mapped[str] = mapped_column(String, default="manual")
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    game: Mapped["Game"] = relationship("Game")
