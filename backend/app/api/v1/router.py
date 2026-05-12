from fastapi import APIRouter
from . import games, platforms, indexers, download_clients, queue, history, wanted, calendar, system, library

router = APIRouter()

router.include_router(games.router, prefix="/games", tags=["Games"])
router.include_router(platforms.router, prefix="/platforms", tags=["Platforms"])
router.include_router(indexers.router, prefix="/indexers", tags=["Indexers"])
router.include_router(download_clients.router, prefix="/downloadclients", tags=["Download Clients"])
router.include_router(queue.router, prefix="/queue", tags=["Queue"])
router.include_router(history.router, prefix="/history", tags=["History"])
router.include_router(wanted.router, prefix="/wanted", tags=["Wanted"])
router.include_router(calendar.router, prefix="/calendar", tags=["Calendar"])
router.include_router(system.router, prefix="/system", tags=["System"])
router.include_router(library.router, prefix="/library", tags=["Library"])
