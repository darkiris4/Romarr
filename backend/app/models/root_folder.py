from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RootFolder(Base):
    __tablename__ = "root_folders"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
