from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RemotePathMapping(Base):
    __tablename__ = "remote_path_mappings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    host: Mapped[str] = mapped_column(String, nullable=False)
    remote_path: Mapped[str] = mapped_column(String, nullable=False)
    local_path: Mapped[str] = mapped_column(String, nullable=False)
