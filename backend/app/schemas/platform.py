from datetime import datetime
from pydantic import BaseModel


class PlatformBase(BaseModel):
    name: str
    no_intro_name: str
    folder_name: str
    extensions: str = ""
    enabled: bool = True
    igdb_platform_id: int | None = None


class PlatformCreate(PlatformBase):
    pass


class PlatformUpdate(BaseModel):
    name: str | None = None
    no_intro_name: str | None = None
    folder_name: str | None = None
    extensions: str | None = None
    enabled: bool | None = None
    igdb_platform_id: int | None = None


class PlatformOut(PlatformBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
