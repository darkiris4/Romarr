"""
List plugin interface.

A List plugin provides a set of games to add to the Wanted list.
Create a subpackage under plugins/ that exposes a class named ``Plugin``
that inherits from ``ListPlugin``.

Example directory layout:
    plugins/
        mylist/
            __init__.py   ← exports Plugin = MyListPlugin
            plugin.py
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class WantedItem:
    title: str
    platform_id: int
    igdb_id: int | None = None
    cover_url: str | None = None
    release_year: int | None = None
    region: str = "USA"


class ListPlugin(ABC):
    """Base class for all List plugins."""

    #: Short, unique identifier shown in the UI.
    name: str = ""
    #: One-line description shown in Settings → Lists.
    description: str = ""
    #: JSON Schema for the plugin's configuration dict.
    config_schema: dict = field(default_factory=dict)

    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    async def fetch(self) -> list[WantedItem]:
        """
        Fetch the list of wanted games from the external source.
        Return a list of WantedItem objects.
        """

    def validate_config(self) -> list[str]:
        """Return a list of validation error messages (empty = valid)."""
        return []
