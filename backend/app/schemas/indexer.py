from datetime import datetime
from pydantic import BaseModel
from ..models.indexer import IndexerProtocol


class IndexerBase(BaseModel):
    name: str
    protocol: IndexerProtocol
    url: str
    api_key: str = ""
    categories: str = ""
    priority: int = 25
    enabled: bool = True
    prowlarr_id: int | None = None


class IndexerCreate(IndexerBase):
    pass


class IndexerUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    api_key: str | None = None
    categories: str | None = None
    priority: int | None = None
    enabled: bool | None = None
    prowlarr_id: int | None = None


class IndexerOut(IndexerBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IndexerTestResult(BaseModel):
    success: bool
    message: str
