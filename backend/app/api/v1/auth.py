import ipaddress
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ...services import auth_service
from ...services.config_service import get_config, set_config
from ...services.event_service import log_event

router = APIRouter()

_COMPONENT = "Authentication"
_BAD_LOGIN = "Invalid username or password"


def _request_is_authenticated(request: Request) -> bool:
    try:
        from ...services.auth_middleware import request_is_authenticated
    except ImportError:
        return bool(getattr(request.state, "authenticated", False))
    return request_is_authenticated(request)


def require_auth(request: Request) -> None:
    if not _request_is_authenticated(request):
        raise HTTPException(status_code=401, detail="Authentication required")


class SetupBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8)


class LoginBody(BaseModel):
    username: str
    password: str
    remember: bool = False


class SettingsBody(BaseModel):
    mode: Literal["forms", "basic", "none"]
    required: Literal["enabled", "disabled_for_local"]
    username: str = Field(max_length=64)
    trusted_proxies: str = ""


class PasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


def _status(request: Request, authenticated: bool | None = None) -> dict:
    if authenticated is None:
        authenticated = _request_is_authenticated(request)
    return {
        "setup_required": auth_service.setup_required(),
        "authenticated": authenticated,
        "mode": auth_service.get_auth_mode(),
        "username": auth_service.get_username() if authenticated else None,
    }


def _is_secure(request: Request) -> bool:
    return request.url.scheme == "https"


def _issue_session(request: Request, response: Response, username: str, remember: bool) -> None:
    token = auth_service.create_session_token(username, remember)
    auth_service.set_session_cookie(response, token, remember, _is_secure(request))


def _normalise_proxies(value: str) -> str:
    entries = [e.strip() for e in value.split(",") if e.strip()]
    for entry in entries:
        try:
            ipaddress.ip_network(entry, strict=False)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid trusted proxy: {entry}")
    return ",".join(entries)


def _settings_payload() -> dict:
    return {
        "mode": auth_service.get_auth_mode(),
        "required": auth_service.get_auth_required(),
        "username": auth_service.get_username(),
        "api_key": auth_service.get_api_key(),
        "trusted_proxies": get_config("auth_trusted_proxies", ""),
    }


@router.get("/status")
def get_status(request: Request):
    return _status(request)


@router.post("/setup")
def setup(body: SetupBody, request: Request, response: Response):
    if not auth_service.setup_required():
        raise HTTPException(status_code=409, detail="Authentication is already configured")
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Username cannot be empty")
    auth_service.set_credentials(username, body.password)
    _issue_session(request, response, username, False)
    log_event(_COMPONENT, f"Administrator account created for '{username}'")
    return _status(request, authenticated=True)


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    if not auth_service.check_credentials(body.username, body.password):
        log_event(_COMPONENT, f"Failed login attempt for '{body.username[:64]}'")
        raise HTTPException(status_code=401, detail=_BAD_LOGIN)
    _issue_session(request, response, body.username, body.remember)
    return _status(request, authenticated=True)


@router.post("/logout", status_code=204)
def logout(response: Response):
    auth_service.clear_session_cookie(response)
    response.status_code = 204
    return response


@router.get("/settings", dependencies=[Depends(require_auth)])
def get_settings():
    return _settings_payload()


@router.put("/settings", dependencies=[Depends(require_auth)])
def update_settings(body: SettingsBody):
    needs_credentials = auth_service.setup_required()
    if needs_credentials and body.mode in ("forms", "basic"):
        raise HTTPException(
            status_code=400, detail="Create an administrator account before enabling authentication"
        )
    proxies = _normalise_proxies(body.trusted_proxies)
    username = body.username.strip()
    if not needs_credentials and not username:
        raise HTTPException(status_code=422, detail="Username cannot be empty")
    set_config("auth_mode", body.mode)
    set_config("auth_required", body.required)
    set_config("auth_trusted_proxies", proxies)
    if not needs_credentials:
        set_config("auth_username", username)
    log_event(_COMPONENT, f"Settings changed: mode={body.mode}, required={body.required}")
    return _settings_payload()


@router.post("/password", status_code=204, dependencies=[Depends(require_auth)])
def change_password(body: PasswordBody, request: Request, response: Response):
    username = auth_service.get_username()
    if not auth_service.check_credentials(username, body.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    auth_service.set_credentials(username, body.new_password)
    _issue_session(request, response, username, False)
    log_event(_COMPONENT, "Password changed")
    response.status_code = 204
    return response


@router.post("/apikey/reset", dependencies=[Depends(require_auth)])
def reset_api_key():
    key = auth_service.reset_api_key()
    log_event(_COMPONENT, "API key reset")
    return {"api_key": key}
