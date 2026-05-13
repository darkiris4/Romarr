# Romarr

> A Sonarr/Radarr-style automated ROM manager for retro game collections.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange.svg)]()

---

> [!WARNING]
> **Romarr is early-stage software under active development.** Expect breaking changes, missing features, and rough edges. It is not yet recommended for production use. Contributions and bug reports are very welcome.

---

## What is Romarr?

Romarr automates the acquisition, organisation, and metadata enrichment of ROM files for retro gaming. It follows the same workflow as Sonarr and Radarr:

1. Add games to a **Wanted list** (manually or via list integrations)
2. Romarr searches configured **Newznab/Torznab indexers** (or Prowlarr)
3. Releases are sent to a **download client** (qBittorrent, SABnzbd, Transmission)
4. Downloaded files are **post-processed** — renamed to No-Intro standards and sorted into platform folders
5. **IGDB metadata and cover art** are automatically scraped

---

## Features

| Area | What's implemented |
|---|---|
| **Library import** | Scan existing ROM folders; CRC32 matching against No-Intro DAT files (including ZIP-transparent CRC) |
| **DAT support** | No-Intro DAT parsing; platform auto-detection by header name; qualifier prefix matching |
| **Metadata scraper** | IGDB cover art + release year; tiered exact/fuzzy search; Japanese→English title alias map; per-run debug log |
| **Download pipeline** | Indexer search, grab, queue tracking, download client integration, post-processor |
| **Game views** | Table, poster grid, and overview list; console filter dropdown; sticky toolbar; debounced search |
| **Game detail page** | Radarr-style hero with blurred backdrop, inline metadata grid, file information table |
| **Platforms** | 15+ pre-seeded platforms with No-Intro names and IGDB platform IDs |
| **Settings UI** | Media management, platforms, indexers, download clients, list sources, general/IGDB config |
| **Plugin system** | Drop-in list source plugins; IGDB list plugin included |
| **Scheduler** | Background jobs: metadata scraper (6 h), download poller, wanted searcher |
| **System pages** | System status, task scheduler, structured log viewer |

---

## Tech Stack

**Backend** — Python 3.11+
- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/)
- [SQLAlchemy 2](https://www.sqlalchemy.org/) + SQLite
- [APScheduler](https://apscheduler.readthedocs.io/) for background jobs
- [httpx](https://www.python-httpx.org/) for HTTP (IGDB, indexers)

**Frontend** — TypeScript + React 18
- [Vite](https://vitejs.dev/)
- [TanStack Query v5](https://tanstack.com/query/latest)
- [React Router v6](https://reactrouter.com/)
- [Lucide React](https://lucide.dev/) icons

---

## Quick Start (Docker)

```bash
git clone https://github.com/darkiris4/Romarr.git
cd Romarr
cp .env.example .env
# Edit .env — at minimum set ROM_LIBRARY_PATH to your ROM folder
docker compose up -d
```

Open **http://localhost:7878** in your browser.

> **IGDB cover art** requires free Twitch developer credentials. See [IGDB Setup](#igdb-setup) below.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `ROM_LIBRARY_PATH` | `./library` | Path to your ROM library on the host |
| `ROMARR_PORT` | `7878` | Host port for the web UI |
| `IGDB_CLIENT_ID` | _(empty)_ | Twitch app Client ID |
| `IGDB_CLIENT_SECRET` | _(empty)_ | Twitch app Client Secret |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                       # Vite dev server on http://localhost:5173
```

The frontend proxies `/api` requests to `http://localhost:8000` via the Vite config.

---

## IGDB Setup

Cover art and release metadata are sourced from [IGDB](https://www.igdb.com/) (free, no payment required).

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and log in with a Twitch account
2. Click **Register Your Application**
3. Set the OAuth Redirect URL to `http://localhost`
4. Copy the **Client ID** and generate a **Client Secret**
5. In Romarr, go to **Settings → General** and paste both values, then click **Test Connection**

---

## No-Intro DAT Files

Romarr uses [No-Intro](https://no-intro.org/) DAT files for accurate ROM identification by CRC32 checksum.

1. Download DAT files from the No-Intro website (requires a free account)
2. Place them in `backend/data/dats/` (or `/data/dats/` inside the container)
3. Romarr auto-matches DAT files to platforms by their `<header><name>` field on startup

---

## Roadmap

- [x] Global search with library suggestions and IGDB lookup
- [x] Add game flow — IGDB results → confirm (platform/region/monitored)
- [x] Manual search UI — indexer results with one-click grab
- [x] History and activity feed
- [ ] End-to-end download pipeline validation (requires real indexer + download client)
- [ ] Real-time log streaming in the UI
- [ ] Pagination on the games list
- [ ] First-run IGDB setup wizard (banner/modal guiding Twitch app registration)
- [ ] More list source plugins (LaunchBox, ScreenScraper)
- [ ] Deluge download client support
- [ ] User authentication
- [ ] Alembic database migrations (currently uses in-place `ALTER TABLE`)

---

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

**Quick links:**
- [Report a bug](../../issues/new?template=bug_report.md)
- [Request a feature](../../issues/new?template=feature_request.md)
- [Open a PR](../../compare)

---

## License

[GPL v3](LICENSE) © Mike H
