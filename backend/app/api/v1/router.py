from fastapi import APIRouter

from . import (
    blocklist,
    calendar,
    connect,
    download_clients,
    games,
    history,
    igdb,
    indexers,
    library,
    logs,
    platforms,
    profiles,
    queue,
    settings,
    system,
    wanted,
)

router = APIRouter()

router.include_router(games.router, prefix="/games", tags=["Games"])
router.include_router(blocklist.router, prefix="/blocklist", tags=["Blocklist"])
router.include_router(igdb.router, prefix="/igdb", tags=["IGDB"])
router.include_router(platforms.router, prefix="/platforms", tags=["Platforms"])
router.include_router(indexers.router, prefix="/indexers", tags=["Indexers"])
router.include_router(download_clients.router, prefix="/downloadclients", tags=["Download Clients"])
router.include_router(queue.router, prefix="/queue", tags=["Queue"])
router.include_router(history.router, prefix="/history", tags=["History"])
router.include_router(wanted.router, prefix="/wanted", tags=["Wanted"])
router.include_router(calendar.router, prefix="/calendar", tags=["Calendar"])
router.include_router(system.router, prefix="/system", tags=["System"])
router.include_router(library.router, prefix="/library", tags=["Library"])
router.include_router(settings.router, prefix="/settings", tags=["Settings"])
router.include_router(connect.router, prefix="/connect", tags=["Connect"])
router.include_router(logs.router, prefix="/logs", tags=["Logs"])
router.include_router(profiles.router, prefix="/profiles", tags=["Profiles"])
