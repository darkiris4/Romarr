import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.v1.router import router as api_router
from .config import settings
from .database import init_db
from .services.dat_manager import scan_dat_dir
from .services.redact import RedactingFilter
from .services.scheduler import start as start_scheduler
from .services.scheduler import stop as stop_scheduler
from .version import APP_VERSION


def _load_dats():
    from .database import SessionLocal

    db = SessionLocal()
    try:
        results = scan_dat_dir(db)
        loaded = [r for r in results if r["status"] == "loaded"]
        unmatched = [r for r in results if r["status"] == "unmatched"]
        if loaded:
            logger.info(
                "Loaded %d DAT file(s): %s",
                len(loaded),
                ", ".join(f"{r['platform_name']} ({r['entries']} entries)" for r in loaded),
            )
        if unmatched:
            logger.warning(
                "Unmatched DAT file(s) in %s: %s",
                str(settings.dat_dir),
                ", ".join(r["file"] for r in unmatched),
            )
    finally:
        db.close()


from .services.log_service import setup_logging

# Bootstrap logging from env/default before the DB is available.
# The lifespan will reconfigure from the persisted DB setting once init_db() runs.
setup_logging(settings.log_level.lower())

# Keep console output during development
_console = logging.StreamHandler()
_console.setFormatter(logging.Formatter("%(levelname)-5s %(name)s: %(message)s"))
_console.setLevel(logging.DEBUG)
_console.addFilter(RedactingFilter())
logging.getLogger().addHandler(_console)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s", settings.app_name)
    init_db()
    # Reconfigure logging from the persisted DB setting (may differ from env default)
    from .services.config_service import get_config

    setup_logging(get_config("log_level", settings.log_level.lower()))
    _load_dats()
    start_scheduler()
    from .services.event_service import log_event

    log_event("Application", f"Started — {settings.app_name}")
    yield
    stop_scheduler()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=APP_VERSION,
    description="Automated ROM manager for retro games",
    lifespan=lifespan,
    redirect_slashes=False,
)


def parse_origins(value: str) -> list[str]:
    return [o.strip().rstrip("/") for o in value.split(",") if o.strip()]


def configure_cors(app: FastAPI, origins: list[str]) -> None:
    """Enable cross-origin access for the listed origins; no-op for an empty list."""
    if not origins:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def add_security_headers(app: FastAPI, api_prefix: str) -> None:
    """Attach hardening headers to every response and disable caching for API responses."""
    api_path = api_prefix.rstrip("/") + "/"

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
        if request.url.path.startswith(api_path):
            response.headers["Cache-Control"] = "no-store"
        return response


def register_spa(app: FastAPI, dist: Path) -> None:
    """Serve the built frontend from dist, falling back to index.html for client routes."""
    root = dist.resolve()
    app.mount("/assets", StaticFiles(directory=str(dist / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        candidate = (root / full_path).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(root / "index.html")


configure_cors(app, parse_origins(settings.allowed_origins))
add_security_headers(app, settings.api_v1_prefix)

app.include_router(api_router, prefix=settings.api_v1_prefix)

# Serve built frontend in production
_frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    register_spa(app, _frontend_dist)
