"""Masking of stored credentials in API responses and recovery of the stored value on update."""

from __future__ import annotations

MASK = "********"

# Notification connection config keys that hold credentials, by connection type
CONNECTION_SECRET_KEYS: dict[str, frozenset[str]] = {
    "discord": frozenset({"url"}),
    "slack": frozenset({"url"}),
    "webhook": frozenset({"url"}),
    "telegram": frozenset({"token"}),
    "email": frozenset({"smtp_pass"}),
    "ntfy": frozenset({"topic"}),
}


def mask(value: str | None) -> str:
    """The placeholder for a non-empty secret, or an empty string when nothing is stored."""
    return MASK if value else ""


def is_masked(value: str | None) -> bool:
    """True when ``value`` is the placeholder returned by :func:`mask`."""
    return value == MASK


def mask_config(config: dict, conn_type: str) -> dict:
    """Copy of a connection config with its credential fields masked."""
    secret_keys = CONNECTION_SECRET_KEYS.get(conn_type, frozenset())
    return {
        k: (mask(v) if k in secret_keys and isinstance(v, str) else v) for k, v in config.items()
    }


def merge_config(new: dict, stored: dict, conn_type: str) -> dict:
    """Config to save: masked credential fields in ``new`` keep their ``stored`` value."""
    secret_keys = CONNECTION_SECRET_KEYS.get(conn_type, frozenset())
    merged = dict(new)
    for key in secret_keys:
        if is_masked(merged.get(key)):
            if key in stored:
                merged[key] = stored[key]
            else:
                merged.pop(key, None)
    return merged
