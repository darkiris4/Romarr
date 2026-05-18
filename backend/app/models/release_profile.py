from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ReleaseProfile(Base):
    __tablename__ = "release_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    region_priority: Mapped[str] = mapped_column(String, default='["USA","World","Europe","Japan"]')
    prefer_no_intro: Mapped[bool] = mapped_column(Boolean, default=True)
    accept_hacks: Mapped[bool] = mapped_column(Boolean, default=False)
    accept_unlicensed: Mapped[bool] = mapped_column(Boolean, default=False)
    preferred_formats: Mapped[str] = mapped_column(String, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
