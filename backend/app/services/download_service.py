"""
Download client abstraction layer.

Each client implementation handles: add, get_status, remove.
The scheduler calls poll_all_clients() periodically.
"""

from __future__ import annotations

import json
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
                params={"category": self.client.category, "sort": "added_on", "reverse": "true", "limit": 1},
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
            return ClientStatus(download_id=download_id, status=QueueStatus.FAILED, size=0, size_downloaded=0)
        t = data[0]
        state_map = {
            "downloading": QueueStatus.DOWNLOADING,
            "stalledDL": QueueStatus.DOWNLOADING,
            "uploading": QueueStatus.COMPLETED,
            "stalledUP": QueueStatus.COMPLETED,
            "pausedDL": QueueStatus.PAUSED,
            "error": QueueStatus.FAILED,
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
        return data.get("nzo_ids", ["unknown"])[0]

    async def status(self, download_id: str) -> ClientStatus:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.get(
                self._api_url,
                params={"mode": "queue", "apikey": self.client.api_key, "output": "json"},
            )
            data = resp.json()
        for slot in data.get("queue", {}).get("slots", []):
            if slot["nzo_id"] == download_id:
                status_map = {
                    "Downloading": QueueStatus.DOWNLOADING,
                    "Completed": QueueStatus.COMPLETED,
                    "Failed": QueueStatus.FAILED,
                    "Paused": QueueStatus.PAUSED,
                }
                size = int(float(slot.get("mb", 0)) * 1024 * 1024)
                left = int(float(slot.get("mbleft", 0)) * 1024 * 1024)
                return ClientStatus(
                    download_id=download_id,
                    status=status_map.get(slot.get("status", ""), QueueStatus.DOWNLOADING),
                    size=size,
                    size_downloaded=size - left,
                )
        return ClientStatus(download_id=download_id, status=QueueStatus.COMPLETED, size=0, size_downloaded=0)

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
        torrent = result.get("arguments", {}).get("torrent-added") or result.get("arguments", {}).get("torrent-duplicate", {})
        return str(torrent.get("id", "0"))

    async def status(self, download_id: str) -> ClientStatus:
        async with httpx.AsyncClient(timeout=15) as http:
            result = await self._rpc(
                http,
                "torrent-get",
                {"ids": [int(download_id)], "fields": ["id", "status", "totalSize", "downloadedEver"]},
            )
        torrents = result.get("arguments", {}).get("torrents", [])
        if not torrents:
            return ClientStatus(download_id=download_id, status=QueueStatus.FAILED, size=0, size_downloaded=0)
        t = torrents[0]
        status_map = {0: QueueStatus.PAUSED, 1: QueueStatus.QUEUED, 2: QueueStatus.DOWNLOADING,
                      3: QueueStatus.QUEUED, 4: QueueStatus.COMPLETED, 5: QueueStatus.QUEUED, 6: QueueStatus.DOWNLOADING}
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
