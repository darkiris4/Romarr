from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Connection(Base):
    __tablename__ = "connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    tags: Mapped[str] = mapped_column(String, default="")
    on_grab: Mapped[bool] = mapped_column(Boolean, default=True)
    on_import: Mapped[bool] = mapped_column(Boolean, default=True)
    on_upgrade: Mapped[bool] = mapped_column(Boolean, default=True)
    on_rename: Mapped[bool] = mapped_column(Boolean, default=False)
    on_delete: Mapped[bool] = mapped_column(Boolean, default=False)
    on_health_issue: Mapped[bool] = mapped_column(Boolean, default=True)
    on_download_failure: Mapped[bool] = mapped_column(Boolean, default=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
