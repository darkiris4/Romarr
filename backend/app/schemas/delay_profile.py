from datetime import datetime

from pydantic import BaseModel


class DelayProfileBase(BaseModel):
    name: str
    is_default: bool = False
    preferred_protocol: str = "any"
    usenet_delay: int = 0
    torrent_delay: int = 0
    bypass_if_only_one: bool = True
    tags: str = ""


class DelayProfileCreate(DelayProfileBase):
    pass


class DelayProfileUpdate(BaseModel):
    name: str | None = None
    is_default: bool | None = None
    preferred_protocol: str | None = None
    usenet_delay: int | None = None
    torrent_delay: int | None = None
    bypass_if_only_one: bool | None = None
    tags: str | None = None


class DelayProfileOut(DelayProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
