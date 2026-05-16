from datetime import datetime

from pydantic import BaseModel

from ..models.download_client import DownloadClientType


class DownloadClientBase(BaseModel):
    name: str
    implementation: DownloadClientType
    host: str
    port: int
    use_ssl: bool = False
    url_base: str = ""
    username: str = ""
    password: str = ""
    api_key: str = ""
    category: str = "romarr"
    priority: int = 0
    enabled: bool = True


class DownloadClientCreate(DownloadClientBase):
    pass


class DownloadClientUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    use_ssl: bool | None = None
    url_base: str | None = None
    username: str | None = None
    password: str | None = None
    api_key: str | None = None
    category: str | None = None
    priority: int | None = None
    enabled: bool | None = None


class DownloadClientOut(DownloadClientBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DownloadClientTestResult(BaseModel):
    success: bool
    message: str
