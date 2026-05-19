from datetime import datetime

from pydantic import BaseModel


class PlatformBase(BaseModel):
    name: str
    no_intro_name: str
    folder_name: str
    extensions: str = ""
    short_name: str | None = None
    enabled: bool = True
    igdb_platform_id: int | None = None


class PlatformCreate(PlatformBase):
    release_profile_id: int | None = None


class PlatformUpdate(BaseModel):
    name: str | None = None
    no_intro_name: str | None = None
    folder_name: str | None = None
    extensions: str | None = None
    short_name: str | None = None
    enabled: bool | None = None
    igdb_platform_id: int | None = None
    release_profile_id: int | None = None


class PlatformOut(PlatformBase):
    id: int
    release_profile_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
