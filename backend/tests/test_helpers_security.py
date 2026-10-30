"""Unit tests for the redaction, path and secret-mask helpers."""

import logging
from pathlib import Path

import pytest

from app.services.paths import is_within, safe_filename
from app.services.redact import REDACTED, RedactingFilter, redact
from app.services.secret_mask import MASK, is_masked, mask, mask_config, merge_config

# ── redact ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text, secret",
    [
        ("GET https://idx.example/api?t=search&apikey=abc123def&q=mario", "abc123def"),
        ("params={'apikey': 'abc123def', 'q': 'x'}", "abc123def"),
        (
            "POST https://id.twitch.tv/oauth2/token?client_id=1&client_secret=s3cr3tvalue",
            "s3cr3tvalue",
        ),
        ('{"password": "hunter2hunter2"}', "hunter2hunter2"),
        ("http://user:p4ssw0rd@host:8080/path", "p4ssw0rd"),
        (
            "https://api.telegram.org/bot123456789:AAF-abcdefghijklmnopqrstuvwxyz/sendMessage",
            "AAF-abc",
        ),
        ("https://discord.com/api/webhooks/1234567890/AbCdEf_gh-ijKlMn", "AbCdEf_gh-ijKlMn"),
        ("https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX", "XXXXXXXXXXXX"),
        ("Authorization: Bearer eyJhbGciOi.payload.sig", "eyJhbGciOi"),
        ("Client error '401' for url 'https://x/api?key=topsecretkey'", "topsecretkey"),
    ],
)
def test_redact_removes_secret(text, secret):
    result = redact(text)
    assert secret not in result
    assert REDACTED in result


def test_redact_keeps_ordinary_text():
    text = "Searching indexer 'Prowlarr': GET http://prowlarr:9696/1/api q=Super Mario"
    assert redact(text) == text


def test_redact_does_not_touch_similar_words():
    assert redact("monkey=banana") == "monkey=banana"


def test_filter_scrubs_message_args_and_traceback():
    logger = logging.getLogger("redact-test")
    logger.propagate = False
    stream_records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record):
            stream_records.append(record)

    handler = Capture()
    handler.addFilter(RedactingFilter())
    logger.addHandler(handler)
    try:
        try:
            raise ValueError("failed https://x/api?apikey=leakedvalue1")
        except ValueError:
            logger.error("auth %s", "client_secret=leakedvalue2", exc_info=True)
    finally:
        logger.removeHandler(handler)

    record = stream_records[0]
    assert "leakedvalue2" not in record.getMessage()
    assert "leakedvalue1" not in record.exc_text


# ── safe_filename ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Super Mario Bros. (World)", "Super Mario Bros. (World)"),
        ("Sonic & Knuckles (USA, Europe)", "Sonic & Knuckles (USA, Europe)"),
        ("../../etc/passwd", ".._.._etc_passwd"),
        ("a/b\\c", "a_b_c"),
        ("..", "file"),
        (".", "file"),
        ("", "file"),
        ("name.", "name"),
        ("bad:name?", "bad_name_"),
    ],
)
def test_safe_filename(name, expected):
    assert safe_filename(name) == expected


def test_safe_filename_is_single_component():
    assert "/" not in safe_filename("x/../../y") and "\\" not in safe_filename("x\\..\\y")


def test_safe_filename_limits_length():
    assert len(safe_filename("é" * 500).encode()) <= 200


# ── is_within ─────────────────────────────────────────────────────────────────


def test_is_within_accepts_child(tmp_path):
    (tmp_path / "a").mkdir()
    assert is_within(tmp_path / "a" / "rom.nes", [tmp_path])


def test_is_within_rejects_outside(tmp_path):
    other = tmp_path.parent / (tmp_path.name + "-other")
    assert not is_within(other / "rom.nes", [tmp_path])


def test_is_within_rejects_dotdot_escape(tmp_path):
    assert not is_within(tmp_path / ".." / "etc" / "passwd", [tmp_path])


def test_is_within_rejects_symlink_escape(tmp_path):
    outside = tmp_path.parent / (tmp_path.name + "-target")
    outside.mkdir()
    link = tmp_path / "link"
    link.symlink_to(outside)
    assert not is_within(link / "rom.nes", [tmp_path])


def test_is_within_empty_roots():
    assert not is_within(Path("/tmp/x"), [])


# ── secret_mask ───────────────────────────────────────────────────────────────


def test_mask_and_is_masked():
    assert mask("secret") == MASK
    assert mask("") == ""
    assert mask(None) == ""
    assert is_masked(MASK)
    assert not is_masked("secret")


def test_mask_config_masks_only_secret_keys():
    cfg = {"url": "https://discord.com/api/webhooks/1/abc", "name": "x"}
    masked = mask_config(cfg, "discord")
    assert masked["url"] == MASK and masked["name"] == "x"
    assert mask_config({"url": "https://ntfy.sh", "topic": "t"}, "ntfy") == {
        "url": "https://ntfy.sh",
        "topic": MASK,
    }


def test_merge_config_keeps_stored_value_for_masked_field():
    stored = {"token": "real-token", "chat_id": "1"}
    new = {"token": MASK, "chat_id": "2"}
    assert merge_config(new, stored, "telegram") == {"token": "real-token", "chat_id": "2"}


def test_merge_config_accepts_new_value():
    assert merge_config({"token": "new"}, {"token": "old"}, "telegram") == {"token": "new"}


def test_merge_config_drops_mask_without_stored_value():
    assert merge_config({"token": MASK}, {}, "telegram") == {}
