from datetime import datetime

from pydantic import BaseModel, computed_field, field_serializer

from ..models.download_client import DownloadClientType
from ..services.secret_mask import mask


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
    remove_completed: bool = False
    remove_failed: bool = True
    tags: str = ""


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
    remove_completed: bool | None = None
    remove_failed: bool | None = None
    tags: str | None = None


class DownloadClientOut(DownloadClientBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("password", "api_key")
    def _mask_secret(self, value: str) -> str:
        return mask(value)

    @computed_field
    @property
    def has_password(self) -> bool:
        return bool(self.password)

    @computed_field
    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key)


class DownloadClientTestResult(BaseModel):
    success: bool
    message: str
