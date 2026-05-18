import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class DownloadClientType(str, enum.Enum):
    SABNZBD = "sabnzbd"
    QBITTORRENT = "qbittorrent"
    DELUGE = "deluge"
    TRANSMISSION = "transmission"


class DownloadClient(Base):
    __tablename__ = "download_clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    implementation: Mapped[DownloadClientType] = mapped_column(
        Enum(DownloadClientType), nullable=False
    )
    host: Mapped[str] = mapped_column(String, nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    use_ssl: Mapped[bool] = mapped_column(Boolean, default=False)
    url_base: Mapped[str] = mapped_column(String, default="")
    username: Mapped[str] = mapped_column(String, default="")
    password: Mapped[str] = mapped_column(String, default="")
    api_key: Mapped[str] = mapped_column(String, default="")
    category: Mapped[str] = mapped_column(String, default="romarr")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tags: Mapped[str] = mapped_column(String, default="")
    remove_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    remove_failed: Mapped[bool] = mapped_column(Boolean, default=True)
    extra_fields: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
