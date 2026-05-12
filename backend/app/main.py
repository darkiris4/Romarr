import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import settings
from .database import init_db
from .api.v1.router import router as api_router
from .services.scheduler import start as start_scheduler, stop as stop_scheduler
from .services.dat_manager import scan_dat_dir


def _load_dats():
    from .database import SessionLocal
    db = SessionLocal()
    try:
        results = scan_dat_dir(db)
        loaded = [r for r in results if r["status"] == "loaded"]
        unmatched = [r for r in results if r["status"] == "unmatched"]
        if loaded:
            logger.info("Loaded %d DAT file(s): %s", len(loaded),
                        ", ".join(f"{r['platform_name']} ({r['entries']} entries)" for r in loaded))
        if unmatched:
            logger.warning("Unmatched DAT file(s) in %s: %s",
                           str(settings.dat_dir),
                           ", ".join(r["file"] for r in unmatched))
    finally:
        db.close()

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s", settings.app_name)
    init_db()
    _load_dats()
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Automated ROM manager for retro games",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)

# Serve built frontend in production
_frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
