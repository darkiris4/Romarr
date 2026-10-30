"""Removal of credentials from text that is logged or returned to a client."""

from __future__ import annotations

import logging
import re

REDACTED = "***"

# key=value pairs in query strings, form bodies and log arguments
_KEY_VALUE = re.compile(
    r"(?i)\b(api[_-]?key|apikey|access[_-]?token|client[_-]?secret|secret|token|password|passwd|"
    r"pwd|key)=([^&\s\"'<>]+)"
)

# "password": "value" style pairs in JSON or dict reprs
_JSON_PAIR = re.compile(
    r"(?i)([\"'](?:api[_-]?key|apikey|access[_-]?token|client[_-]?secret|secret|token|password|"
    r"passwd|smtp_pass|key)[\"']\s*:\s*[\"'])([^\"']*)([\"'])"
)

# user:password@host in URLs
_URL_CREDENTIALS = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)([^/\s:@]+):([^@\s/]+)@")

# https://api.telegram.org/bot<token>/method
_TELEGRAM_BOT = re.compile(r"(?i)(/bot)(\d+:[A-Za-z0-9_-]{20,})")

# Discord and Slack incoming webhooks carry the secret in the path
_DISCORD_WEBHOOK = re.compile(r"(?i)(/api/webhooks/\d+/)([A-Za-z0-9_-]+)")
_SLACK_WEBHOOK = re.compile(r"(?i)(hooks\.slack\.com/services/)([A-Za-z0-9/]+)")

_BEARER = re.compile(r"(?i)\b(bearer\s+)([A-Za-z0-9._~+/=-]+)")


def redact(text: object) -> str:
    """Return text with credentials replaced by ``***``."""
    value = str(text)
    value = _URL_CREDENTIALS.sub(rf"\1{REDACTED}:{REDACTED}@", value)
    value = _KEY_VALUE.sub(rf"\1={REDACTED}", value)
    value = _JSON_PAIR.sub(rf"\1{REDACTED}\3", value)
    value = _TELEGRAM_BOT.sub(rf"\1{REDACTED}", value)
    value = _DISCORD_WEBHOOK.sub(rf"\1{REDACTED}", value)
    value = _SLACK_WEBHOOK.sub(rf"\1{REDACTED}", value)
    return _BEARER.sub(rf"\1{REDACTED}", value)


class RedactingFilter(logging.Filter):
    """Handler filter that scrubs credentials from every record, including tracebacks."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = None
        if record.exc_info and not record.exc_text:
            record.exc_text = logging.Formatter().formatException(record.exc_info)
        if record.exc_text:
            record.exc_text = redact(record.exc_text)
        if record.stack_info:
            record.stack_info = redact(record.stack_info)
        return True
