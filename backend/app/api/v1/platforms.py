from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.platform import Platform
from ...schemas.platform import PlatformCreate, PlatformOut, PlatformUpdate

router = APIRouter()

BUILTIN_PLATFORMS = [
    {"name": "Super Nintendo Entertainment System", "no_intro_name": "Nintendo - Super Nintendo Entertainment System", "folder_name": "Nintendo - Super Nintendo Entertainment System", "extensions": "sfc,smc", "igdb_platform_id": 19},
    {"name": "Nintendo Entertainment System",       "no_intro_name": "Nintendo - Nintendo Entertainment System",       "folder_name": "Nintendo - Nintendo Entertainment System",       "extensions": "nes",        "igdb_platform_id": 18},
    {"name": "Game Boy Advance",                    "no_intro_name": "Nintendo - Game Boy Advance",                    "folder_name": "Nintendo - Game Boy Advance",                    "extensions": "gba",        "igdb_platform_id": 24},
    {"name": "Game Boy Color",                      "no_intro_name": "Nintendo - Game Boy Color",                      "folder_name": "Nintendo - Game Boy Color",                      "extensions": "gbc",        "igdb_platform_id": 22},
    {"name": "Game Boy",                            "no_intro_name": "Nintendo - Game Boy",                            "folder_name": "Nintendo - Game Boy",                            "extensions": "gb",         "igdb_platform_id": 33},
    {"name": "Nintendo 64",                         "no_intro_name": "Nintendo - Nintendo 64",                         "folder_name": "Nintendo - Nintendo 64",                         "extensions": "z64,n64,v64","igdb_platform_id": 4},
    {"name": "Nintendo DS",                         "no_intro_name": "Nintendo - Nintendo DS",                         "folder_name": "Nintendo - Nintendo DS",                         "extensions": "nds",        "igdb_platform_id": 20},
    {"name": "Sega Mega Drive / Genesis",           "no_intro_name": "Sega - Mega Drive - Genesis",                    "folder_name": "Sega - Mega Drive - Genesis",                    "extensions": "md,bin,gen", "igdb_platform_id": 29},
    {"name": "Sega Master System",                  "no_intro_name": "Sega - Master System - Mark III",                "folder_name": "Sega - Master System - Mark III",                "extensions": "sms",        "igdb_platform_id": 64},
    {"name": "Sega Game Gear",                      "no_intro_name": "Sega - Game Gear",                               "folder_name": "Sega - Game Gear",                               "extensions": "gg",         "igdb_platform_id": 35},
    {"name": "PlayStation",                         "no_intro_name": "Sony - PlayStation",                             "folder_name": "Sony - PlayStation",                             "extensions": "cue,bin,iso,chd", "igdb_platform_id": 7},
    {"name": "PlayStation 2",                       "no_intro_name": "Sony - PlayStation 2",                           "folder_name": "Sony - PlayStation 2",                           "extensions": "iso,chd",    "igdb_platform_id": 8},
    {"name": "PlayStation Portable",               "no_intro_name": "Sony - PlayStation Portable",                   "folder_name": "Sony - PlayStation Portable",                   "extensions": "iso,cso,pbp","igdb_platform_id": 38},
    {"name": "Atari 2600",                          "no_intro_name": "Atari - 2600",                                   "folder_name": "Atari - 2600",                                   "extensions": "a26,bin",        "igdb_platform_id": 59},
    {"name": "Neo Geo Pocket Color",               "no_intro_name": "SNK - Neo Geo Pocket Color",                    "folder_name": "SNK - Neo Geo Pocket Color",                    "extensions": "ngc",            "igdb_platform_id": 119},
    {"name": "Sega 32X",                            "no_intro_name": "Sega - 32X",                                     "folder_name": "Sega - 32X",                                     "extensions": "32x",            "igdb_platform_id": 30},
    {"name": "Nintendo GameCube",                  "no_intro_name": "Nintendo - GameCube",                            "folder_name": "Nintendo - GameCube",                            "extensions": "rvz,iso,gcm,gcz","igdb_platform_id": 21},
    {"name": "Nintendo Wii",                        "no_intro_name": "Nintendo - Wii",                                 "folder_name": "Nintendo - Wii",                                 "extensions": "wbfs,rvz,wia,iso","igdb_platform_id": 5},
    {"name": "Nintendo GameCube (NPDP)",           "no_intro_name": "Nintendo - Nintendo GameCube (NPDP Carts)",     "folder_name": "Nintendo - Nintendo GameCube",                   "extensions": "rvz,iso,gcm",    "igdb_platform_id": 21},
]


@router.get("", response_model=list[PlatformOut])
def list_platforms(db: Session = Depends(get_db)):
    return db.query(Platform).all()


@router.get("/builtin")
def list_builtin():
    return BUILTIN_PLATFORMS


@router.post("", response_model=PlatformOut, status_code=201)
def create_platform(payload: PlatformCreate, db: Session = Depends(get_db)):
    platform = Platform(**payload.model_dump())
    db.add(platform)
    db.commit()
    db.refresh(platform)
    return platform


@router.put("/{platform_id}", response_model=PlatformOut)
def update_platform(platform_id: int, payload: PlatformUpdate, db: Session = Depends(get_db)):
    platform = db.query(Platform).filter_by(id=platform_id).first()
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(platform, key, value)
    db.commit()
    db.refresh(platform)
    return platform


@router.delete("/{platform_id}", status_code=204)
def delete_platform(platform_id: int, db: Session = Depends(get_db)):
    platform = db.query(Platform).filter_by(id=platform_id).first()
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    db.delete(platform)
    db.commit()
