from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from ..database import Base


class AppEvent(Base):
    __tablename__ = "app_events"

    id         = Column(Integer, primary_key=True, index=True)
    component  = Column(String, nullable=False)
    message    = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
