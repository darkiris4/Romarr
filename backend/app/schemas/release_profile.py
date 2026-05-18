import json
from datetime import datetime

from pydantic import BaseModel, field_validator


class ReleaseProfileBase(BaseModel):
    name: str
    is_default: bool = False
    region_priority: list[str] = ["USA", "World", "Europe", "Japan"]
    prefer_no_intro: bool = True
    accept_hacks: bool = False
    accept_unlicensed: bool = False
    preferred_formats: list[str] = []


class ReleaseProfileCreate(ReleaseProfileBase):
    pass


class ReleaseProfileUpdate(BaseModel):
    name: str | None = None
    is_default: bool | None = None
    region_priority: list[str] | None = None
    prefer_no_intro: bool | None = None
    accept_hacks: bool | None = None
    accept_unlicensed: bool | None = None
    preferred_formats: list[str] | None = None


class ReleaseProfileOut(BaseModel):
    id: int
    name: str
    is_default: bool
    region_priority: list[str]
    prefer_no_intro: bool
    accept_hacks: bool
    accept_unlicensed: bool
    preferred_formats: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("region_priority", "preferred_formats", mode="before")
    @classmethod
    def parse_json(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v
