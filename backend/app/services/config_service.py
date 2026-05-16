from __future__ import annotations

from ..database import SessionLocal
from ..models.app_config import AppConfig


def get_config(key: str, default: str = "") -> str:
    db = SessionLocal()
    try:
        row = db.query(AppConfig).filter_by(key=key).first()
        return row.value if row else default
    finally:
        db.close()


def set_config(key: str, value: str) -> None:
    db = SessionLocal()
    try:
        row = db.query(AppConfig).filter_by(key=key).first()
        if row:
            row.value = value
        else:
            db.add(AppConfig(key=key, value=value))
        db.commit()
    finally:
        db.close()


def get_many(keys: list[str]) -> dict[str, str]:
    db = SessionLocal()
    try:
        rows = db.query(AppConfig).filter(AppConfig.key.in_(keys)).all()
        found = {r.key: r.value for r in rows}
        return {k: found.get(k, "") for k in keys}
    finally:
        db.close()
