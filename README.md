# Romarr

> Automated ROM manager for retro games — a Sonarr/Radarr-style experience for your ROM collection.

Romarr monitors a **Wanted list**, searches **Newznab/Torznab indexers** (or Prowlarr), hands releases to a **download client**, and post-processes them into a No-Intro–named library organised by platform.

---

## Features

| Feature | Detail |
|---|---|
| **Wanted list** | Populated manually or via List plugins (IGDB included) |
| **Indexers** | Newznab + Torznab; Prowlarr-compatible proxy support |
| **Download clients** | qBittorrent, SABnzbd, Transmission |
| **Post-processor** | No-Intro standard renaming, platform folder sorting, optional DAT checksum verification |
| **State tracking** | `wanted → grabbed → downloading → imported / failed` |
| **Plugin system** | Drop-in List plugins; IGDB is the first example |
| ***arr-style UI** | Dark theme, sidebar nav, queue, history, settings sections |

---

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# Edit .env — set ROM_LIBRARY_PATH and optionally IGDB credentials
docker compose up -d
```

Open **http://localhost:7878** in your browser.

Default port is `7878` (configurable via `ROMARR_PORT` in `.env`).

---

## Development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --reload
```

API available at `http://localhost:8000`  
OpenAPI docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI available at `http://localhost:3000` (proxies `/api` to the backend).

---

## Configuration

All settings are persisted in the database and configurable through **Settings** in the UI.

| Section | What it controls |
|---|---|
| **Media Management** | Library path, No-Intro renaming, DAT verification |
| **Platforms** | Which platforms are managed, file extensions, folder names |
| **Indexers** | Newznab/Torznab endpoints (or Prowlarr) |
| **Download Clients** | qBittorrent / SABnzbd / Transmission connection details |
| **Lists** | Plugin-based Wanted list sources |
| **General** | App name, log level |

### Prowlarr Integration

Point an indexer at your Prowlarr instance instead of configuring individual indexers:

1. In Prowlarr, go to **Settings → Apps** and add Romarr (or note your Prowlarr API key).
2. In Romarr → **Settings → Indexers**, add a Torznab indexer with:
   - **URL**: `http://prowlarr:9696/<indexer-id>/api` (for a specific indexer)
   - **API Key**: your Prowlarr API key

---

## No-Intro Library Layout

```
/library/
├── Nintendo - Super Nintendo Entertainment System/
│   ├── Chrono Trigger (USA).sfc
│   └── Super Mario World (USA).sfc
├── Nintendo - Game Boy Advance/
│   └── Castlevania - Aria of Sorrow (USA).gba
└── Sega - Mega Drive - Genesis/
    └── Sonic the Hedgehog (USA, Europe).md
```

Folder names follow the **No-Intro naming convention** exactly so they can be imported directly into RetroArch, EmulationStation, or Pegasus.

---

## Writing a List Plugin

Create a directory under `backend/plugins/<your-plugin>/`:

```python
# backend/plugins/mywishlist/__init__.py
from .plugin import MyWishlistPlugin as Plugin

# backend/plugins/mywishlist/plugin.py
from plugins.base import ListPlugin, WantedItem

class MyWishlistPlugin(ListPlugin):
    name = "mywishlist"
    description = "Import from my custom wishlist source"

    async def fetch(self) -> list[WantedItem]:
        # return a list of WantedItem objects
        return [
            WantedItem(title="Chrono Trigger", platform_id=1, release_year=1995),
        ]
```

Romarr auto-discovers plugins at startup. The plugin will appear in **Settings → Lists**.

---

## Architecture

```
backend/
  app/
    models/      — SQLAlchemy ORM models
    schemas/     — Pydantic request/response schemas
    api/v1/      — FastAPI route handlers
    services/    — Indexer search, download client abstraction, post-processor, scheduler
  plugins/       — List plugin interface + IGDB example

frontend/
  src/
    api/         — Axios wrappers for each backend resource
    components/  — Shared UI components (Layout, StatusBadge, etc.)
    pages/       — One directory per major UI section
    types/       — TypeScript interfaces mirroring backend schemas
```

---

## Roadmap

- [ ] Deluge download client
- [ ] No-Intro DAT file management UI (upload / auto-update)
- [ ] Manual grab from search results
- [ ] Multi-region support with region priority ordering
- [ ] RetroAchievements list plugin
- [ ] IGDB cover art auto-fetch on game add
- [ ] Notification webhooks (Discord, Slack, Pushover)

---

## License

MIT — see [LICENSE](LICENSE).
