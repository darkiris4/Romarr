"""
Download client abstraction layer.

Each client implementation handles: add, get_status, remove.
The scheduler calls poll_all_clients() periodically.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx

from ..models.download_client import DownloadClient, DownloadClientType
from ..models.queue_item import QueueStatus


@dataclass
class ClientStatus:
    download_id: str
    status: QueueStatus
    size: int
    size_downloaded: int
    error: str | None = None
    not_found: bool = False  # True when item is absent from client (vs explicitly reported failed)
    encrypted: bool = False  # SABnzbd detected a password-protected archive


class BaseDownloadClient(ABC):
    def __init__(self, client: DownloadClient):
        self.client = client
        scheme = "https" if client.use_ssl else "http"
        base = client.url_base.strip("/")
        self.base_url = f"{scheme}://{client.host}:{client.port}" + (f"/{base}" if base else "")

    @abstractmethod
    async def add(self, url: str, name: str) -> str:
        """Add download, return download_id."""

    @abstractmethod
    async def status(self, download_id: str) -> ClientStatus:
        """Poll status of a single download."""

    @abstractmethod
    async def remove(self, download_id: str, delete_data: bool = False) -> None:
        """Remove download from client."""

    @abstractmethod
    async def file_path(self, download_id: str) -> str | None:
        """Return the local filesystem path of the downloaded content (file or directory)."""

    @abstractmethod
    async def test(self) -> tuple[bool, str]:
        """Verify connectivity."""


class QBittorrentClient(BaseDownloadClient):
    async def _login(self, client: httpx.AsyncClient) -> None:
        await client.post(
            f"{self.base_url}/api/v2/auth/login",
            data={"username": self.client.username, "password": self.client.password},
        )

    async def add(self, url: str, name: str) -> str:
        async with httpx.AsyncClient(timeout=15) as http:
            await self._login(http)
            resp = await http.post(
                f"{self.base_url}/api/v2/torrents/add",
                data={"urls": url, "category": self.client.category, "savepath": ""},
            )
            resp.raise_for_status()
            # qBittorrent returns the info hash via torrent list after add
            torrents = await http.get(
                f"{self.base_url}/api/v2/torrents/info",
                params={
                    "category": self.client.category,
                    "sort": "added_on",
                    "reverse": "true",
                    "limit": 1,
                },
            )
            data = torrents.json()
            return data[0]["hash"] if data else "unknown"

    async def status(self, download_id: str) -> ClientStatus:
        async with httpx.AsyncClient(timeout=15) as http:
            await self._login(http)
            resp = await http.get(
                f"{self.base_url}/api/v2/torrents/info", params={"hashes": download_id}
            )
            data = resp.json()
        if not data:
            return ClientStatus(
                download_id=download_id,
                status=QueueStatus.FAILED,
                size=0,
                size_downloaded=0,
                not_found=True,
            )
        t = data[0]
        # Full state map sourced from Radarr's QBittorrent.cs (develop branch)
        state_map = {
            # Completed / seeding — all forms mean the download finished
            "uploading": QueueStatus.COMPLETED,
            "stalledUP": QueueStatus.COMPLETED,
            "pausedUP": QueueStatus.COMPLETED,
            "stoppedUP": QueueStatus.COMPLETED,
            "queuedUP": QueueStatus.COMPLETED,
            "forcedUP": QueueStatus.COMPLETED,
            # Active download
            "downloading": QueueStatus.DOWNLOADING,
            "forcedDL": QueueStatus.DOWNLOADING,
            "moving": QueueStatus.DOWNLOADING,
            # Stalled but may resume — treat as downloading, not a failure
            "stalledDL": QueueStatus.DOWNLOADING,
            # Queued / checking states
            "queuedDL": QueueStatus.QUEUED,
            "checkingDL": QueueStatus.QUEUED,
            "checkingUP": QueueStatus.QUEUED,
            "checkingResumeData": QueueStatus.QUEUED,
            "metaDL": QueueStatus.QUEUED,
            "forcedMetaDL": QueueStatus.QUEUED,
            # Paused
            "pausedDL": QueueStatus.PAUSED,
            "stoppedDL": QueueStatus.PAUSED,
            # Explicit failures
            "error": QueueStatus.FAILED,
            "missingFiles": QueueStatus.FAILED,
        }
        return ClientStatus(
            download_id=download_id,
            status=state_map.get(t["state"], QueueStatus.DOWNLOADING),
            size=t["size"],
            size_downloaded=t["completed"],
        )

    async def remove(self, download_id: str, delete_data: bool = False) -> None:
        async with httpx.AsyncClient(timeout=15) as http:
            await self._login(http)
            await http.post(
                f"{self.base_url}/api/v2/torrents/delete",
                data={"hashes": download_id, "deleteFiles": str(delete_data).lower()},
            )

    async def file_path(self, download_id: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as http:
            await self._login(http)
            resp = await http.get(
                f"{self.base_url}/api/v2/torrents/info", params={"hashes": download_id}
            )
            data = resp.json()
        if not data:
            return None
        t = data[0]
        # content_path = full path to file (single) or root dir (multi); added in Web API v2.8.4
        return t.get("content_path") or (
            t.get("save_path", "").rstrip("/") + "/" + t.get("name", "")
        )

    async def test(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                await self._login(http)
                resp = await http.get(f"{self.base_url}/api/v2/app/version")
                return True, f"qBittorrent {resp.text.strip()}"
        except Exception as exc:
            return False, str(exc)


class SABnzbdClient(BaseDownloadClient):
    @property
    def _api_url(self) -> str:
        return f"{self.base_url}/sabnzbd/api"

    async def add(self, url: str, name: str) -> str:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.get(
                self._api_url,
                params={
                    "mode": "addurl",
                    "name": url,
                    "apikey": self.client.api_key,
                    "cat": self.client.category,
                    "output": "json",
                },
            )
            data = resp.json()
        nzo_ids = data.get("nzo_ids") or []
        if not nzo_ids:
            raise ValueError(f"SABnzbd did not return an nzo_id (response: {data})")
        return nzo_ids[0]

    # Full queue status map sourced from Radarr's Sabnzbd.cs (develop branch)
    _QUEUE_STATUS_MAP = {
        "Downloading": QueueStatus.DOWNLOADING,
        "Verifying": QueueStatus.DOWNLOADING,
        "Repairing": QueueStatus.DOWNLOADING,
        "Extracting": QueueStatus.DOWNLOADING,
        "Moving": QueueStatus.DOWNLOADING,
        "Queued": QueueStatus.QUEUED,
        "Grabbing": QueueStatus.QUEUED,
        "Propagating": QueueStatus.QUEUED,
        "Completed": QueueStatus.COMPLETED,
        "Failed": QueueStatus.FAILED,
        "Paused": QueueStatus.PAUSED,
    }

    async def status(self, download_id: str) -> ClientStatus:
        async with httpx.AsyncClient(timeout=15) as http:
            # Check active queue first
            resp = await http.get(
                self._api_url,
                params={"mode": "queue", "apikey": self.client.api_key, "output": "json"},
            )
            data = resp.json()
            for slot in data.get("queue", {}).get("slots", []):
                if slot.get("nzo_id") == download_id:
                    size = int(float(slot.get("mb", 0)) * 1024 * 1024)
                    left = int(float(slot.get("mbleft", 0)) * 1024 * 1024)
                    # SABnzbd marks password-protected archives with an "ENCRYPTED /" prefix
                    title = slot.get("filename", "") or slot.get("cat", "")
                    encrypted = title.startswith("ENCRYPTED /")
                    return ClientStatus(
                        download_id=download_id,
                        status=self._QUEUE_STATUS_MAP.get(
                            slot.get("status", ""), QueueStatus.DOWNLOADING
                        ),
                        size=size,
                        size_downloaded=size - left,
                        encrypted=encrypted,
                    )

            # Not in active queue — check history.
            # SABnzbd moves items to history during post-processing (Extracting,
            # Verifying, Moving, etc.) before they are truly complete.
            # Radarr pattern: only treat history items as COMPLETED when the status
            # is explicitly "Completed"; anything else is still in progress.
            hist = await http.get(
                self._api_url,
                params={
                    "mode": "history",
                    "apikey": self.client.api_key,
                    "output": "json",
                    "limit": 100,
                },
            )
            for slot in hist.json().get("history", {}).get("slots", []):
                if slot.get("nzo_id") == download_id:
                    hist_status = slot.get("status", "")
                    size = int(float(slot.get("mb", 0)) * 1024 * 1024)
                    if hist_status == "Failed":
                        return ClientStatus(
                            download_id=download_id,
                            status=QueueStatus.FAILED,
                            size=size,
                            size_downloaded=size,
                            error=slot.get("fail_message") or None,
                        )
                    if hist_status == "Completed":
                        return ClientStatus(
                            download_id=download_id,
                            status=QueueStatus.COMPLETED,
                            size=size,
                            size_downloaded=size,
                        )
                    # Post-processing in progress (Extracting, Verifying, Repairing,
                    # Moving, Running, etc.) — still not ready for import.
                    return ClientStatus(
                        download_id=download_id,
                        status=QueueStatus.DOWNLOADING,
                        size=size,
                        size_downloaded=size,
                    )

        # Gone from both queue and history — may be a transient gap (auto-clean, API error)
        return ClientStatus(
            download_id=download_id,
            status=QueueStatus.FAILED,
            size=0,
            size_downloaded=0,
            not_found=True,
        )

    async def remove(self, download_id: str, delete_data: bool = False) -> None:
        async with httpx.AsyncClient(timeout=15) as http:
            await http.get(
                self._api_url,
                params={
                    "mode": "queue",
                    "name": "delete",
                    "id": download_id,
                    "del_files": "1" if delete_data else "0",
                    "apikey": self.client.api_key,
                    "output": "json",
                },
            )

    async def file_path(self, download_id: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.get(
                self._api_url,
                params={
                    "mode": "history",
                    "apikey": self.client.api_key,
                    "output": "json",
                    "limit": 100,
                },
            )
            for slot in resp.json().get("history", {}).get("slots", []):
                if slot.get("nzo_id") == download_id:
                    return slot.get("storage")
        return None

    async def test(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                resp = await http.get(
                    self._api_url,
                    params={"mode": "version", "apikey": self.client.api_key, "output": "json"},
                )
                data = resp.json()
            return True, f"SABnzbd {data.get('version', '')}"
        except Exception as exc:
            return False, str(exc)


class TransmissionClient(BaseDownloadClient):
    _session_id: str = ""

    async def _rpc(self, http: httpx.AsyncClient, method: str, arguments: dict) -> dict:
        payload = {"method": method, "arguments": arguments}
        headers = {"X-Transmission-Session-Id": self._session_id}
        resp = await http.post(
            f"{self.base_url}/transmission/rpc",
            json=payload,
            headers=headers,
            auth=(self.client.username, self.client.password),
        )
        if resp.status_code == 409:
            self._session_id = resp.headers.get("X-Transmission-Session-Id", "")
            resp = await http.post(
                f"{self.base_url}/transmission/rpc",
                json=payload,
                headers={"X-Transmission-Session-Id": self._session_id},
                auth=(self.client.username, self.client.password),
            )
        return resp.json()

    async def add(self, url: str, name: str) -> str:
        async with httpx.AsyncClient(timeout=30) as http:
            result = await self._rpc(http, "torrent-add", {"filename": url, "download-dir": ""})
        torrent = result.get("arguments", {}).get("torrent-added") or result.get(
            "arguments", {}
        ).get("torrent-duplicate", {})
        return str(torrent.get("id", "0"))

    async def status(self, download_id: str) -> ClientStatus:
        async with httpx.AsyncClient(timeout=15) as http:
            result = await self._rpc(
                http,
                "torrent-get",
                {
                    "ids": [int(download_id)],
                    "fields": ["id", "status", "totalSize", "downloadedEver"],
                },
            )
        torrents = result.get("arguments", {}).get("torrents", [])
        if not torrents:
            return ClientStatus(
                download_id=download_id,
                status=QueueStatus.FAILED,
                size=0,
                size_downloaded=0,
                not_found=True,
            )
        t = torrents[0]
        status_map = {
            0: QueueStatus.PAUSED,
            1: QueueStatus.QUEUED,
            2: QueueStatus.DOWNLOADING,
            3: QueueStatus.QUEUED,
            4: QueueStatus.COMPLETED,
            5: QueueStatus.QUEUED,
            6: QueueStatus.DOWNLOADING,
        }
        return ClientStatus(
            download_id=download_id,
            status=status_map.get(t.get("status", 0), QueueStatus.DOWNLOADING),
            size=t.get("totalSize", 0),
            size_downloaded=t.get("downloadedEver", 0),
        )

    async def remove(self, download_id: str, delete_data: bool = False) -> None:
        async with httpx.AsyncClient(timeout=15) as http:
            await self._rpc(
                http,
                "torrent-remove",
                {"ids": [int(download_id)], "delete-local-data": delete_data},
            )

    async def file_path(self, download_id: str) -> str | None:
        async with httpx.AsyncClient(timeout=15) as http:
            result = await self._rpc(
                http,
                "torrent-get",
                {"ids": [int(download_id)], "fields": ["downloadDir", "name"]},
            )
        torrents = result.get("arguments", {}).get("torrents", [])
        if not torrents:
            return None
        t = torrents[0]
        download_dir = t.get("downloadDir", "").rstrip("/")
        name = t.get("name", "")
        return f"{download_dir}/{name}" if download_dir and name else None

    async def test(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                result = await self._rpc(http, "session-get", {})
            version = result.get("arguments", {}).get("version", "unknown")
            return True, f"Transmission {version}"
        except Exception as exc:
            return False, str(exc)


def get_client(model: DownloadClient) -> BaseDownloadClient:
    mapping = {
        DownloadClientType.QBITTORRENT: QBittorrentClient,
        DownloadClientType.SABNZBD: SABnzbdClient,
        DownloadClientType.TRANSMISSION: TransmissionClient,
    }
    cls = mapping.get(model.implementation)
    if cls is None:
        raise NotImplementedError(f"Client '{model.implementation}' not yet implemented")
    return cls(model)
