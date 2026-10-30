"""Masking of stored credentials in API responses and recovery of the stored value on update."""

from __future__ import annotations

import json

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

# Keys holding credentials inside a list source's JSON config
LIST_SOURCE_SECRET_KEYS: frozenset[str] = frozenset(
    {"client_secret", "token", "api_key", "password", "secret"}
)


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


def mask_json_config(raw: str | None) -> str | None:
    """JSON object string with its credential fields masked; other input is returned unchanged."""
    try:
        data = json.loads(raw or "")
    except ValueError:
        return raw
    if not isinstance(data, dict):
        return raw
    for key in LIST_SOURCE_SECRET_KEYS:
        if isinstance(data.get(key), str):
            data[key] = mask(data[key])
    return json.dumps(data)


def merge_json_config(new: str | None, stored: str | None) -> str | None:
    """JSON config to save: masked credential fields in ``new`` keep their ``stored`` value."""
    try:
        new_data = json.loads(new or "")
    except ValueError:
        return new
    if not isinstance(new_data, dict):
        return new
    try:
        stored_data = json.loads(stored or "")
    except ValueError:
        stored_data = {}
    if not isinstance(stored_data, dict):
        stored_data = {}
    for key in LIST_SOURCE_SECRET_KEYS:
        if is_masked(new_data.get(key)):
            if key in stored_data:
                new_data[key] = stored_data[key]
            else:
                new_data.pop(key, None)
    return json.dumps(new_data)
