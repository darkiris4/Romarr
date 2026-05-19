"""
Tests for the revision-upgrade logic in library_scanner.

These tests are self-contained: they create an in-memory SQLite database,
seed it with fake Game rows, and call import_roms() with pre-built scan
results to verify that revisions are upgraded, skipped, or created correctly.

Run with:
    cd backend && source .venv/bin/activate
    pytest tests/test_revision_upgrade.py -v
"""

import os
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# ── Bootstrap a throw-away DB ─────────────────────────────────────────────────


@pytest.fixture()
def db_engine(tmp_path):
    """In-memory SQLite engine with the full Romarr schema."""
    db_url = f"sqlite:///{tmp_path}/test.db"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    # Patch settings so the app uses our test DB
    with patch.dict(os.environ, {"DATABASE_URL": db_url}):
        from app.database import Base
        Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(db_engine):
    with Session(db_engine) as session:
        yield session


@pytest.fixture()
def platform(db):
    from app.models.platform import Platform

    p = Platform(
        name="Nintendo - Nintendo Entertainment System",
        no_intro_name="Nintendo - Nintendo Entertainment System",
        folder_name="NES",
        extensions="nes,zip",
        enabled=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_zip(directory: Path, inner_name: str, content: bytes = b"FAKECONTENT") -> Path:
    """Create a single-file ZIP and return its path."""
    zip_path = directory / f"{inner_name}.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr(inner_name, content)
    return zip_path


def _game(db, title: str, platform_id: int, rom_path: str, crc32: str = None):
    from app.models.game import Game, GameStatus

    g = Game(
        title=title,
        platform_id=platform_id,
        status=GameStatus.IMPORTED,
        rom_path=rom_path,
        checksum_crc32=crc32,
        monitored=True,
        region="World",
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


# ── _parse_revision unit tests ─────────────────────────────────────────────────


def test_parse_revision_no_tag():
    from app.services.library_scanner import _parse_revision
    assert _parse_revision("Super Mario Bros. (World).nes") == 0


def test_parse_revision_rev1():
    from app.services.library_scanner import _parse_revision
    assert _parse_revision("Super Mario Bros. (World) (Rev 1).nes") == 1


def test_parse_revision_rev2():
    from app.services.library_scanner import _parse_revision
    assert _parse_revision("Mega Man (USA) (Rev 2).nes") == 2


def test_parse_revision_case_insensitive():
    from app.services.library_scanner import _parse_revision
    assert _parse_revision("Game (Rev 1).nes") == _parse_revision("Game (rev 1).nes")


def test_parse_revision_zip_no_tag():
    from app.services.library_scanner import _parse_revision
    assert _parse_revision("Super Mario Bros. (World).zip") == 0


# ── import_roms integration tests ─────────────────────────────────────────────


def test_upgrade_enabled_replaces_older_revision(db, platform, tmp_path):
    """Rev 1 imported when Rev 0 already exists → game updated, no duplicate created."""
    from app.models.game import Game
    from app.services.library_scanner import import_roms

    # Seed Rev 0
    rev0_zip = _make_zip(tmp_path, "Super Mario Bros. (World).nes", b"REV0DATA")
    existing = _game(db, "Super Mario Bros.", platform.id, str(rev0_zip), crc32="aabbcc00")

    # Create Rev 1 file
    rev1_zip = _make_zip(tmp_path, "Super Mario Bros. (World) (Rev 1).nes", b"REV1DATA")

    with patch("app.services.config_service.get_config") as mock_cfg, \
         patch("app.services.library_scanner.scan_folder") as mock_scan, \
         patch("app.services.library_scanner._try_rename_to_canonical", side_effect=lambda p, _: p):

        mock_cfg.side_effect = lambda key, default="": (
            "true" if key == "auto_upgrade_revisions" else default
        )

        mock_scan.return_value = _make_scan_summary(
            tmp_path,
            roms=[
                dict(
                    path=str(rev1_zip),
                    filename="Super Mario Bros. (World) (Rev 1).nes",
                    title="Super Mario Bros.",
                    platform_id=platform.id,
                    crc32="aabbcc01",
                    already_exists=True,
                    existing_game_id=existing.id,
                )
            ],
        )

        result = import_roms(db, str(tmp_path))

    assert result["upgraded"] == 1
    assert result["created"] == 0
    assert result["skipped_existing"] == 0

    db.refresh(existing)
    assert str(rev1_zip) in existing.rom_path
    assert existing.checksum_crc32 == "aabbcc01"
    assert db.query(Game).filter_by(platform_id=platform.id).count() == 1


def test_upgrade_enabled_skips_older_revision(db, platform, tmp_path):
    """Rev 0 imported when Rev 1 already exists → skipped."""
    from app.services.library_scanner import import_roms

    rev1_zip = _make_zip(tmp_path, "Super Mario Bros. (World) (Rev 1).nes", b"REV1DATA")
    existing = _game(db, "Super Mario Bros.", platform.id, str(rev1_zip), crc32="aabbcc01")

    rev0_zip = _make_zip(tmp_path, "Super Mario Bros. (World).nes", b"REV0DATA")

    with patch("app.services.config_service.get_config") as mock_cfg, \
         patch("app.services.library_scanner.scan_folder") as mock_scan, \
         patch("app.services.library_scanner._try_rename_to_canonical", side_effect=lambda p, _: p):

        mock_cfg.side_effect = lambda key, default="": (
            "true" if key == "auto_upgrade_revisions" else default
        )

        mock_scan.return_value = _make_scan_summary(
            tmp_path,
            roms=[
                dict(
                    path=str(rev0_zip),
                    filename="Super Mario Bros. (World).nes",
                    title="Super Mario Bros.",
                    platform_id=platform.id,
                    crc32="aabbcc00",
                    already_exists=True,
                    existing_game_id=existing.id,
                )
            ],
        )

        result = import_roms(db, str(tmp_path))

    assert result["upgraded"] == 0
    assert result["skipped_existing"] == 1

    db.refresh(existing)
    assert existing.checksum_crc32 == "aabbcc01"  # unchanged


def test_upgrade_disabled_skips_all_duplicates(db, platform, tmp_path):
    """With auto_upgrade_revisions=false, higher revisions are still skipped."""
    from app.services.library_scanner import import_roms

    rev0_zip = _make_zip(tmp_path, "Super Mario Bros. (World).nes", b"REV0DATA")
    existing = _game(db, "Super Mario Bros.", platform.id, str(rev0_zip), crc32="aabbcc00")

    rev1_zip = _make_zip(tmp_path, "Super Mario Bros. (World) (Rev 1).nes", b"REV1DATA")

    with patch("app.services.config_service.get_config") as mock_cfg, \
         patch("app.services.library_scanner.scan_folder") as mock_scan, \
         patch("app.services.library_scanner._try_rename_to_canonical", side_effect=lambda p, _: p):

        mock_cfg.side_effect = lambda key, default="": (
            "false" if key == "auto_upgrade_revisions" else default
        )

        mock_scan.return_value = _make_scan_summary(
            tmp_path,
            roms=[
                dict(
                    path=str(rev1_zip),
                    filename="Super Mario Bros. (World) (Rev 1).nes",
                    title="Super Mario Bros.",
                    platform_id=platform.id,
                    crc32="aabbcc01",
                    already_exists=True,
                    existing_game_id=existing.id,
                )
            ],
        )

        result = import_roms(db, str(tmp_path))

    assert result["upgraded"] == 0
    assert result["skipped_existing"] == 1

    db.refresh(existing)
    assert existing.checksum_crc32 == "aabbcc00"  # unchanged


def test_multi_zip_selects_higher_revision(db, platform, tmp_path):
    """
    Multi-ROM ZIP with Rev 0 and Rev 1 inner files: hard dedup guard should
    upgrade to Rev 1 when the first (Rev 0) was created in the same session.
    """
    from app.models.game import Game
    from app.services.library_scanner import import_roms

    # Both inner files live in the same ZIP
    multi_zip = tmp_path / "NES Collection.zip"
    with zipfile.ZipFile(multi_zip, "w") as zf:
        zf.writestr("Super Mario Bros. (World).nes", b"REV0DATA")
        zf.writestr("Super Mario Bros. (World) (Rev 1).nes", b"REV1DATA")

    with patch("app.services.config_service.get_config") as mock_cfg, \
         patch("app.services.library_scanner.scan_folder") as mock_scan, \
         patch("app.services.library_scanner._try_rename_to_canonical", side_effect=lambda p, _: p):

        mock_cfg.side_effect = lambda key, default="": (
            "true" if key == "auto_upgrade_revisions" else default
        )

        # Scan surfaces both inner files; neither exists yet in DB
        mock_scan.return_value = _make_scan_summary(
            tmp_path,
            roms=[
                dict(
                    path=str(multi_zip),
                    filename="Super Mario Bros. (World).nes",
                    title="Super Mario Bros.",
                    platform_id=platform.id,
                    crc32="aabbcc00",
                    already_exists=False,
                ),
                dict(
                    path=str(multi_zip),
                    filename="Super Mario Bros. (World) (Rev 1).nes",
                    title="Super Mario Bros.",
                    platform_id=platform.id,
                    crc32="aabbcc01",
                    already_exists=False,
                ),
            ],
        )

        result = import_roms(db, str(tmp_path))

    # One game created (Rev 0), one upgraded to Rev 1
    assert result["created"] == 1
    assert result["upgraded"] == 1

    games = db.query(Game).filter_by(platform_id=platform.id).all()
    assert len(games) == 1
    assert games[0].checksum_crc32 == "aabbcc01"


# ── Scan summary factory ──────────────────────────────────────────────────────


def _make_scan_summary(folder, roms: list[dict]):
    """Build a minimal ScanSummary-like object for mocking scan_folder()."""
    from app.services.library_scanner import ScannedROM, ScanSummary

    summary = ScanSummary(folder=str(folder), total_files_seen=len(roms))
    for r in roms:
        summary.roms.append(
            ScannedROM(
                path=r["path"],
                filename=r["filename"],
                extension="nes",
                crc32=r.get("crc32"),
                title=r["title"],
                region="World",
                match_source="dat",
                confidence=1.0,
                platform_id=r["platform_id"],
                platform_name="Nintendo - Nintendo Entertainment System",
                candidate_platforms=[],
                already_exists=r.get("already_exists", False),
                existing_game_id=r.get("existing_game_id"),
            )
        )
    return summary
