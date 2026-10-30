"""Request authentication for the REST API.

Decision order for a protected request: authentication disabled, local bypass,
API key, then the configured scheme (HTTP Basic or session cookie). Requests
authenticated by session cookie are additionally checked for cross-origin
state-changing calls.
"""

from __future__ import annotations

import ipaddress
import logging
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from . import auth_service
from .config_service import get_config

logger = logging.getLogger(__name__)

PUBLIC_PATHS = frozenset({"/health", "/auth/status", "/auth/setup", "/auth/login"})
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

_IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
_IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


def _trusted_proxies() -> list[_IPNetwork]:
    """Parse the configured trusted proxy list, ignoring entries that are not valid."""
    networks: list[_IPNetwork] = []
    for entry in get_config("auth_trusted_proxies", "").split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid trusted proxy entry")
    return networks


def _parse_ip(value: str) -> _IPAddress | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _is_trusted(host: str, proxies: list[_IPNetwork]) -> bool:
    address = _parse_ip(host)
    return address is not None and any(address in network for network in proxies)


def peer_is_trusted_proxy(request: Request, proxies: list[_IPNetwork]) -> bool:
    return request.client is not None and _is_trusted(request.client.host, proxies)


def client_address(request: Request, proxies: list[_IPNetwork]) -> str:
    """Resolve the originating client address.

    X-Forwarded-For is consulted only when the immediate peer is a trusted proxy.
    The header is walked right to left and the first hop that is not itself a
    trusted proxy is the client.
    """
    peer = request.client.host if request.client else ""
    if not proxies or not _is_trusted(peer, proxies):
        return peer
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    for hop in reversed(hops):
        if not _is_trusted(hop, proxies):
            return hop
    return hops[0] if hops else peer


def is_local_address(host: str) -> bool:
    address = _parse_ip(host)
    return address is not None and (address.is_private or address.is_loopback)


def _expected_host(request: Request, proxies: list[_IPNetwork]) -> str:
    if peer_is_trusted_proxy(request, proxies):
        forwarded = request.headers.get("x-forwarded-host")
        if forwarded:
            return forwarded.split(",")[0].strip().lower()
    return request.headers.get("host", "").strip().lower()


def same_origin(request: Request, proxies: list[_IPNetwork]) -> bool:
    """Check that Origin (or Referer when Origin is absent) matches the request host."""
    source = request.headers.get("origin")
    if source is None:
        source = request.headers.get("referer")
    if not source:
        return False
    expected = _expected_host(request, proxies)
    return bool(expected) and urlsplit(source).netloc.lower() == expected


def _unauthorized(basic: bool) -> Response:
    headers = {"WWW-Authenticate": 'Basic realm="Romarr"'} if basic else None
    return JSONResponse({"detail": "Authentication required"}, status_code=401, headers=headers)


def _forbidden() -> Response:
    return JSONResponse({"detail": "Cross-origin request rejected"}, status_code=403)


def _evaluate(request: Request) -> Response | None:
    """Authenticate a protected request, recording the outcome on request.state."""
    request.state.authenticated = False
    request.state.auth_user = None

    mode = auth_service.get_auth_mode()
    if mode == "none":
        request.state.authenticated = True
        return None

    proxies = _trusted_proxies()
    if auth_service.get_auth_required() == "disabled_for_local" and is_local_address(
        client_address(request, proxies)
    ):
        request.state.authenticated = True
        return None

    api_key = request.headers.get("x-api-key") or request.query_params.get("apikey")
    if api_key and auth_service.check_api_key(api_key):
        request.state.authenticated = True
        return None

    if mode == "basic":
        header = request.headers.get("authorization", "")
        if header and auth_service.check_basic(header):
            request.state.authenticated = True
            request.state.auth_user = auth_service.get_username() or None
            return None
        return _unauthorized(basic=True)

    token = request.cookies.get(auth_service.SESSION_COOKIE)
    user = auth_service.verify_session_token(token) if token else None
    if user is None:
        return _unauthorized(basic=False)
    if request.method not in SAFE_METHODS and not same_origin(request, proxies):
        return _forbidden()
    request.state.authenticated = True
    request.state.auth_user = user
    return None


def request_is_authenticated(request: Request) -> bool:
    return bool(getattr(request.state, "authenticated", False))


def add_authentication(app: FastAPI, api_prefix: str) -> None:
    """Require authentication for every request under the API prefix except the public paths."""
    prefix = api_prefix.rstrip("/")
    api_path = prefix + "/"
    public = {prefix + path for path in PUBLIC_PATHS}

    @app.middleware("http")
    async def authentication(request: Request, call_next):
        path = request.url.path
        if not path.startswith(api_path):
            return await call_next(request)
        request.state.authenticated = False
        request.state.auth_user = None
        if request.method == "OPTIONS" or path == prefix + "/health":
            return await call_next(request)
        rejection = await run_in_threadpool(_evaluate, request)
        if rejection is not None and path not in public:
            return rejection
        return await call_next(request)
