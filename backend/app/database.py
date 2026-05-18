from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def _ensure_data_dir():
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)


_ensure_data_dir()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401 — registers all models

    Base.metadata.create_all(bind=engine)
    _migrate()


_IGDB_PLATFORM_IDS: dict[str, int] = {
    "Nintendo - Super Nintendo Entertainment System": 19,
    "Nintendo - Nintendo Entertainment System": 18,
    "Nintendo - Game Boy Advance": 24,
    "Nintendo - Game Boy Color": 22,
    "Nintendo - Game Boy": 33,
    "Nintendo - Nintendo 64": 4,
    "Nintendo - Nintendo DS": 20,
    "Sega - Mega Drive - Genesis": 29,
    "Sega - Master System - Mark III": 64,
    "Sega - Game Gear": 35,
    "Sony - PlayStation": 7,
    "Sony - PlayStation 2": 8,
    "Sony - PlayStation Portable": 38,
    "Atari - 2600": 59,
    "SNK - Neo Geo Pocket Color": 119,
    "Sega - 32X": 30,
    "Nintendo - GameCube": 21,
    "Nintendo - Nintendo GameCube (NPDP Carts)": 21,
    "Nintendo - Wii": 5,
    "Nintendo - Nintendo 3DS": 37,
    "Nintendo - Wii U": 41,
    "Nintendo - Nintendo Switch": 130,
    "Sony - PlayStation 3": 9,
    "Sony - PlayStation 4": 48,
    "Sony - PlayStation Vita": 46,
    "Microsoft - Xbox 360": 12,
    "Sega - Saturn": 32,
    "Sega - Dreamcast": 23,
}


def _migrate():
    """Apply lightweight schema additions that create_all can't handle."""
    _add_column_if_missing("platforms", "igdb_platform_id", "INTEGER")
    _add_column_if_missing("games", "summary", "TEXT")
    _add_column_if_missing("games", "rating", "REAL")
    _add_column_if_missing("games", "game_modes", "TEXT")
    _add_column_if_missing("games", "themes", "TEXT")
    _add_column_if_missing("games", "similar_games", "TEXT")
    _add_column_if_missing("games", "tags", "TEXT")
    _add_column_if_missing("games", "igdb_searched_at", "DATETIME")
    _add_column_if_missing("games", "last_searched_at", "DATETIME")
    _add_column_if_missing("download_clients", "remove_completed", "BOOLEAN DEFAULT 0")
    _add_column_if_missing("download_clients", "remove_failed", "BOOLEAN DEFAULT 1")
    _add_column_if_missing("indexers", "tags", "TEXT DEFAULT ''")
    _add_column_if_missing("download_clients", "tags", "TEXT DEFAULT ''")
    _seed_platforms()
    _seed_igdb_platform_ids()


def _seed_platforms():
    """Upsert built-in platforms — inserts any that are missing, leaves existing rows alone."""
    from .api.v1.platforms import BUILTIN_PLATFORMS
    from .models.platform import Platform

    db = SessionLocal()
    try:
        existing = {p.no_intro_name for p in db.query(Platform).all()}
        for p in BUILTIN_PLATFORMS:
            if p["no_intro_name"] not in existing:
                db.add(Platform(**p))
        db.commit()
    finally:
        db.close()


def _seed_igdb_platform_ids():
    """Back-fill igdb_platform_id for existing platform rows that are still NULL."""
    from sqlalchemy import text

    with engine.connect() as conn:
        for no_intro_name, igdb_id in _IGDB_PLATFORM_IDS.items():
            conn.execute(
                text(
                    "UPDATE platforms SET igdb_platform_id = :igdb_id"
                    " WHERE no_intro_name = :name AND igdb_platform_id IS NULL"
                ),
                {"igdb_id": igdb_id, "name": no_intro_name},
            )
        conn.commit()


def _add_column_if_missing(table: str, column: str, col_type: str):
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))]
        if column not in cols:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
