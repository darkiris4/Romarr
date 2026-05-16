# <img src="frontend/public/favicon.png" alt="" width="36" style="vertical-align:middle;" /> Romarr

> A Sonarr/Radarr-style automated ROM manager for retro game collections.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange.svg)]()
[![CI](https://github.com/darkiris4/Romarr/actions/workflows/ci.yml/badge.svg)](https://github.com/darkiris4/Romarr/actions/workflows/ci.yml)

---

> [!WARNING]
> **Romarr is early-stage software under active development.** Expect breaking changes, missing features, and rough edges. It is not yet recommended for production use. Contributions and bug reports are very welcome.

---

## What is Romarr?

Romarr automates the management, organisation, and metadata enrichment of ROM files for retro gaming. It follows the same workflow as Sonarr and Radarr:

1. Add games to a **Wanted list** (manually or via list integrations)
2. Romarr searches configured **Newznab/Torznab indexers** (or Prowlarr)
3. Releases are sent to a **download client** (qBittorrent, SABnzbd, Transmission)
4. Downloaded files are **post-processed** — renamed to No-Intro standards and sorted into platform folders
5. **IGDB metadata and cover art** are automatically scraped

---

## Features

| Area | What's implemented |
|---|---|
| **Library import** | Scan existing ROM folders; progress bar; recent folders list; CRC32 matching against No-Intro DATs (ZIP-transparent); multi-ROM ZIP support (each inner file importable separately); stackable filters (DAT match, region, type, new-only) |
| **DAT management** | Drag-and-drop upload via Settings → Platforms; auto-creates platform on upload; version/date display; per-row delete; manual placement in `data/dats/` also supported |
| **Metadata scraper** | IGDB cover art, summary, rating, game modes, themes, similar games; tiered exact/fuzzy search; Japanese→English title alias map; batched enrichment (50/request); 30-day retry skip for unmatched titles |
| **Download pipeline** | Indexer search, grab, queue tracking, download client integration (qBittorrent, SABnzbd, Transmission), post-processor |
| **Game views** | Table, poster grid, and overview list; multi-dimension filter (platform, status, region, missing metadata); 8 sort options; active filter count |
| **Game detail page** | Radarr-style hero with blurred backdrop, inline metadata grid, file info, similar games row |
| **Platforms** | 15+ pre-seeded platforms with No-Intro names and IGDB platform IDs |
| **Settings UI** | Media management, platforms (with DAT management), indexers, download clients, list sources, general/IGDB config, profiles (region priority) |
| **Plugin system** | Drop-in list source plugins; IGDB list plugin included |
| **Scheduler** | Background jobs: metadata scraper (6 h), download poller (30 s), wanted searcher (15 min), health check (6 h), backup (7 days), deduplication (24 h) |
| **System pages** | Status (health checks, disk space, about), Tasks (scheduled + queue), Events log, Backup (create/download/restore/delete) |

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

**Option A — UI upload (recommended):** Go to **Settings → Platforms**, drag-and-drop one or more `.dat` files onto the upload zone. Romarr auto-matches to existing platforms or creates a new one.

**Option B — manual placement:** Copy DAT files into `backend/data/dats/` (or `/data/dats/` inside the container) and restart. Romarr matches by the `<header><name>` field on startup.

---

## Roadmap

- [x] Global search with library suggestions and IGDB lookup
- [x] Add game flow — IGDB results → confirm (platform/region/monitored)
- [x] Manual search UI — indexer results with one-click grab
- [x] History and activity feed
- [x] DAT upload UI with auto-platform creation
- [x] System pages — Status, Tasks, Events, Backup
- [x] CI pipeline (Ruff + ESLint + Prettier + tsc)
- [ ] End-to-end download pipeline validation (requires real indexer + download client)
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

## Legal

> [!IMPORTANT]
> Romarr is a tool for managing and enriching a ROM collection. Users are solely responsible for ensuring they have the legal right to possess any ROM files used with this software. The authors do not condone copyright infringement.

## License

[GPL v3](LICENSE) © Mike H
