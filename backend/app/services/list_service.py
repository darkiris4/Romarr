"""
List plugin service: loads and runs registered List plugins.
Plugins are discovered from the backend/plugins/ directory.
"""

from __future__ import annotations

import importlib
import logging
import pkgutil
from pathlib import Path

from sqlalchemy.orm import Session

from ..models.game import Game, GameStatus
from ..models.list_source import ListSource

logger = logging.getLogger(__name__)

_PLUGINS_PACKAGE = "plugins"


def discover_plugins() -> dict[str, type]:
    """Return {plugin_name: ListPlugin class} for all installed plugins."""
    from plugins.base import ListPlugin  # noqa

    found: dict[str, type] = {}
    plugins_dir = Path(__file__).parent.parent.parent / "plugins"

    for finder, name, is_pkg in pkgutil.iter_modules([str(plugins_dir)]):
        if not is_pkg:
            continue
        try:
            mod = importlib.import_module(f"plugins.{name}")
            plugin_cls = getattr(mod, "Plugin", None)
            if plugin_cls and issubclass(plugin_cls, ListPlugin):
                found[name] = plugin_cls
        except Exception as exc:
            logger.warning("Failed to load plugin '%s': %s", name, exc)
    return found


async def sync_list_source(db: Session, source: ListSource) -> int:
    """Run a list plugin sync, adding new wanted games. Returns count added."""
    plugins = discover_plugins()
    plugin_cls = plugins.get(source.plugin)
    if plugin_cls is None:
        raise ValueError(f"Unknown plugin: {source.plugin}")

    import json

    config = json.loads(source.config or "{}")
    plugin = plugin_cls(config)
    items = await plugin.fetch()

    added = 0
    for item in items:
        existing = db.query(Game).filter_by(title=item.title, platform_id=item.platform_id).first()
        if not existing:
            game = Game(
                title=item.title,
                platform_id=item.platform_id,
                igdb_id=item.igdb_id,
                cover_url=item.cover_url,
                release_year=item.release_year,
                region=item.region or "USA",
                status=GameStatus.WANTED,
            )
            db.add(game)
            added += 1
    db.commit()
    return added
