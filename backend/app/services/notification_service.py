"""Dispatch event notifications to all configured connections."""

from __future__ import annotations

import json
import logging
import smtplib
import threading
from email.mime.text import MIMEText

import httpx

logger = logging.getLogger(__name__)

_EVENT_LABELS: dict[str, str] = {
    "on_grab": "Grab",
    "on_import": "Import",
    "on_upgrade": "Upgrade",
    "on_rename": "Rename",
    "on_delete": "Delete",
    "on_health_issue": "Health Issue",
    "on_download_failure": "Download Failure",
}

_DISCORD_COLORS: dict[str, int] = {
    "on_grab": 0x7B68EE,
    "on_import": 0x2ECC71,
    "on_upgrade": 0x3498DB,
    "on_rename": 0x95A5A6,
    "on_delete": 0xE74C3C,
    "on_health_issue": 0xF39C12,
    "on_download_failure": 0xE74C3C,
}


def _label(event: str) -> str:
    return _EVENT_LABELS.get(event, event.replace("_", " ").title())


def _send_discord(cfg: dict, event: str, title: str, body: str) -> None:
    url = cfg.get("url", "")
    if not url:
        return
    payload = {
        "embeds": [
            {
                "title": f"Romarr — {_label(event)}",
                "description": f"**{title}**\n{body}" if title else body,
                "color": _DISCORD_COLORS.get(event, 0x7B68EE),
            }
        ]
    }
    with httpx.Client(timeout=10) as client:
        client.post(url, json=payload).raise_for_status()


def _send_slack(cfg: dict, event: str, title: str, body: str) -> None:
    url = cfg.get("url", "")
    if not url:
        return
    text = (
        f"*Romarr — {_label(event)}*\n{title}: {body}"
        if title
        else f"*Romarr — {_label(event)}*\n{body}"
    )
    with httpx.Client(timeout=10) as client:
        client.post(url, json={"text": text}).raise_for_status()


def _send_webhook(cfg: dict, event: str, title: str, body: str) -> None:
    url = cfg.get("url", "")
    if not url:
        return
    payload = {"event": event, "title": title, "message": body, "source": "Romarr"}
    with httpx.Client(timeout=10) as client:
        client.post(url, json=payload).raise_for_status()


def _send_telegram(cfg: dict, event: str, title: str, body: str) -> None:
    token = cfg.get("token", "")
    chat_id = cfg.get("chat_id", "")
    if not token or not chat_id:
        return
    text = (
        f"<b>Romarr — {_label(event)}</b>\n{title}: {body}"
        if title
        else f"<b>Romarr — {_label(event)}</b>\n{body}"
    )
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    with httpx.Client(timeout=10) as client:
        client.post(
            url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        ).raise_for_status()


def _send_ntfy(cfg: dict, event: str, title: str, body: str) -> None:
    base_url = cfg.get("url", "https://ntfy.sh").rstrip("/")
    topic = cfg.get("topic", "")
    if not topic:
        return
    message = f"{title}: {body}" if title else body
    with httpx.Client(timeout=10) as client:
        client.post(
            f"{base_url}/{topic}",
            content=message.encode(),
            headers={"Title": f"Romarr — {_label(event)}"},
        ).raise_for_status()


def _send_email(cfg: dict, event: str, title: str, body: str) -> None:
    from_to = cfg.get("from_to", "")
    smtp_host = cfg.get("smtp_host", "")
    smtp_port = int(cfg.get("smtp_port", 587))
    smtp_user = cfg.get("smtp_user", "")
    smtp_pass = cfg.get("smtp_pass", "")
    if not from_to or not smtp_host:
        return
    subject = f"Romarr — {_label(event)}"
    message = f"{title}: {body}" if title else body
    msg = MIMEText(message)
    msg["Subject"] = subject
    msg["From"] = from_to
    msg["To"] = from_to
    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        if smtp_user:
            server.login(smtp_user, smtp_pass)
        server.sendmail(from_to, [from_to], msg.as_string())


_DISPATCHERS = {
    "discord": _send_discord,
    "slack": _send_slack,
    "webhook": _send_webhook,
    "telegram": _send_telegram,
    "ntfy": _send_ntfy,
    "email": _send_email,
}


def _dispatch_one(conn_type: str, config_json: str, event: str, title: str, body: str) -> None:
    try:
        cfg = json.loads(config_json or "{}")
        fn = _DISPATCHERS.get(conn_type)
        if fn:
            fn(cfg, event, title, body)
            logger.debug("Notification sent via %s for event %s", conn_type, event)
    except Exception as exc:
        logger.warning("Notification failed (%s, %s): %s", conn_type, event, exc)


def notify_event(
    event: str,
    game_title: str = "",
    game_tags: str = "",
    body: str = "",
    db=None,
) -> None:
    """
    Fire matching connections for the given event in background threads.
    Must be called with an active DB session; returns immediately.
    """
    if db is None:
        return

    from ..models.connection import Connection

    connections = db.query(Connection).filter_by(enabled=True).all()

    game_tag_set = {t.strip().lower() for t in (game_tags or "").split(",") if t.strip()}

    targets: list[tuple[str, str]] = []
    for conn in connections:
        if not getattr(conn, event, False):
            continue
        conn_tags = {t.strip().lower() for t in (conn.tags or "").split(",") if t.strip()}
        if conn_tags and not conn_tags.intersection(game_tag_set):
            continue
        targets.append((conn.type, conn.config_json))

    for conn_type, config_json in targets:
        threading.Thread(
            target=_dispatch_one,
            args=(conn_type, config_json, event, game_title, body),
            daemon=True,
        ).start()


def test_connection(conn_type: str, config_json: str) -> tuple[bool, str]:
    """Synchronously fire a test notification. Returns (success, message)."""
    try:
        _dispatch_one(
            conn_type,
            config_json,
            "on_grab",
            "Test Game",
            "This is a test notification from Romarr.",
        )
        return True, "Test notification sent successfully."
    except Exception as exc:
        return False, str(exc)
