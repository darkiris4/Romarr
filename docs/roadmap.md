# Romarr — Radarr Parity Roadmap

Generated from a deep-dive comparison of Radarr v5 against Romarr. The goal is maximum Radarr parity while keeping focus on ROMs over movies. Custom Formats are explicitly out of scope.

---

## ROM-specific translations of Radarr concepts

| Radarr | Romarr equivalent | Notes |
|---|---|---|
| Quality Profile | **Release Profile** | Prefer verified No-Intro dumps, region priority, accept hacks/translations, file format preference |
| Cutoff Unmet | **Revision Unmet** | Have Rev 1, latest No-Intro DAT shows Rev 2 exists |
| Delay Profile | **Delay Profile** | Direct carry-over — wait X hours/days for a verified dump before grabbing |
| Collections | **Series** | Franchise grouping (Mario, Zelda, Final Fantasy) |
| Custom Formats | Out of scope | — |
| Trakt/IMDb lists | N/A | No ROM equivalent |
| Cast/Crew | N/A | No ROM equivalent |

---

## Stage 1 — Close the honesty gaps ✅ Complete

> Branch: `feat/arr-parity-stage-1` — merged, tested
>
> Fix what the UI implies works but doesn't, and close critical UX gaps affecting daily use.

### 1. Notifications backend
The `ConnectPage` settings UI is complete but entirely stub — no backend routes or service layer.

**Implement:**
- `backend/app/services/notification_service.py` — dispatches events to all configured connections
- Providers: Discord (embed), Generic Webhook (JSON), Ntfy, Telegram, Slack
- Event triggers: `on_grab`, `on_import`, `on_health_issue`, `on_download_failure`
- `/api/v1/connect` CRUD routes (frontend already expects these)
- Tag filtering: only fire a connection if the game has a matching tag, or the connection has no tags set

### 2. Game editor modal
Game detail page is entirely read-only.

**Implement:**
- Edit modal on game detail: monitored toggle, platform, region, tags, root folder path
- `PUT /api/v1/games/{id}` partial update endpoint
- Accessible from game detail page and bulk action toolbar

### 3. Bulk actions expansion
Currently only delete + re-tag (2 actions).

**Implement:**
- Monitor / Unmonitor selected
- Search selected (trigger indexer search for each)
- Change platform for all selected

### 4. Tags → indexers, download clients, notifications
Tags are free-text decorations with no functional effect.

**Implement:**
- Add `tags` field to Indexer and DownloadClient models, schemas, and settings UI
- When searching/grabbing: prefer indexers/clients whose tags overlap game tags; fall back to untagged ones if no match
- Wire tag filter in the notification backend (connection fires only if game tag matches, or connection has no tags)

### 5. Wanted — last searched timestamp
No visibility into when a game was last searched or why it's still missing.

**Implement:**
- Add `last_searched_at` column to Game model
- Scheduler records it on each search attempt
- Wanted page shows "last searched X days ago" per row with force-retry button

---

## Stage 2 — Release & Delay Profiles ✅ Complete

> Branch: `feat/arr-parity-stage-2` — merged, tested
>
> The biggest conceptual gap. Without profiles, Romarr grabs indiscriminately.

**Profile scoping: per-platform default + per-game override** (mirrors Radarr exactly)

### Release Profiles
Replace the current single global region priority + release toggles with assignable profiles.

**Per-profile configuration:**
- Region priority order (drag-reorder)
- Prefer No-Intro verified dumps (yes/no)
- Accept hacks & fan translations (yes/no)
- Accept unlicensed (yes/no)
- Preferred file formats/extensions

**Assignment:**
- Platform settings: default release profile for all games on that platform
- Game editor modal: per-game override
- Bulk action: assign profile to selected games

### Delay Profiles
Direct Radarr carry-over.

**Per-profile configuration:**
- Preferred protocol (Usenet first / Torrent first / No preference)
- Usenet delay (minutes; 0 = grab immediately)
- Torrent delay (minutes; 0 = grab immediately)
- Bypass delay if only one result available
- Tags (which games this profile applies to; empty = default for all untagged)

### Revision Unmet (Wanted)
Second tab in the Wanted section — ROM-specific equivalent of Radarr's Cutoff Unmet.

**Logic:** Game has an imported ROM whose CRC32 doesn't match the *latest* entry for that title in the No-Intro DAT (i.e. a newer revision exists). Show these games so the user can trigger a re-search.

---

## Stage 3 — Library UX parity ✅ Complete

> Branch: `feat/arr-parity-stage-3` — merged, tested
>
> Polish and power-user features that make the library feel as capable as Radarr's.

| Item | Detail | Status |
|---|---|---|
| **Sort indicators** | Clear column header arrows for active sort + direction | ✅ Done |
| **Poster hover actions** | Quick-access search, edit, delete on poster grid items | ✅ Done |
| **Revision Unmet retry** | Navigate to game + auto-open manual search; tab description subtitle | ✅ Done |
| **Witty loading screen** | LoadingScreen on History, Queue, Wanted, GameDetail pages | ✅ Done |
| **Custom filter presets** | Save current filter state with a name; selectable from filter menu | ✅ Done |
| **Jump bar** | Alphabetical quick-nav rail when sorted by title | ✅ Done |
| **Column chooser** | Show/hide and drag-reorder columns in table view; persisted per user | ✅ Done |
| **Virtual scroll** | @tanstack/react-virtual — eliminates DOM bottleneck on large libraries | ✅ Done |

---

## Stage 4 — Automation & discovery

> Branch: `feat/arr-parity-stage-4` — not started
>
> Completing the arr automation loop: list sources that actually populate Wanted, franchise browsing, and closing the torrent pipeline gap.

### 1. Import lists (backend implementation)

The `ListSourcesPage` settings UI and plugin scaffold exist but the scheduled fetch does nothing — `search_wanted` only searches for games already in the DB, it doesn't pull from list sources.

**Implement:**
- `scheduler.py` — add `sync_lists` job (every 6h); calls `ListPlugin.fetch()` for each enabled source; upserts results into `games` table with `status = wanted` and `monitored = True`
- Dedup against existing library by IGDB ID before inserting
- IGDB watchlist plugin: user provides a list slug or game IDs; fetch via IGDB API
- Settings → List Sources: show `last_synced_at` per source and a manual "Sync Now" trigger button
- `GET /list-sources` and `POST /list-sources/{id}/sync` endpoints

### 2. Series / franchise grouping

IGDB returns `franchises` (array of IDs) and `collection` (series ID) in enrichment data; neither is currently stored.

**Implement:**
- Add `franchise_ids` (JSON array) and `collection_id` (int, nullable) columns to `Game` model via `_add_column_if_missing()`
- Fetch and store these fields in `fetch_enrichment_batch()` in `igdb_service.py`
- Game detail page — add "More in this series" section below similar games; same horizontal scroll card row style; queries locally for games sharing `collection_id`
- Franchise browsing: clicking a franchise name navigates to `/?collection=X` which pre-filters the games list (client-side, no new route needed)

### 3. System → Updates page

No in-app update awareness; users must check GitHub manually.

**Implement:**
- `GET /system/updates` — polls GitHub releases API (`https://api.github.com/repos/darkiris4/Romarr/releases/latest`); compares tag to embedded `APP_VERSION`; caches result for 6h; returns `{ current, latest, has_update, release_url, release_notes }`
- `frontend/src/pages/System/UpdatesPage.tsx` — current version, latest version, release notes (markdown rendered), "View on GitHub" link
- Global topbar banner: if `has_update`, show a dismissible accent-coloured strip ("Romarr vX.Y.Z is available")
- Add `System → Updates` nav item under System section

### 4. Rename dry-run preview

Files are moved silently on import with no preview.

**Implement:**
- `POST /library/rename-preview` — accepts `game_ids: list[int]`; returns list of `{ game_id, title, current_path, proposed_path }` without moving anything
- Naming template configurable in Settings → Media Management (e.g. `{title} ({year})` — same token set Radarr uses)
- `RenamePreviewModal` — table of current → proposed paths with a Confirm Rename button that calls `POST /library/rename`
- Accessible from game detail page actions menu and as a bulk action

### 5. Torrent pipeline validation

qBittorrent and Transmission paths are coded (`download_service.py`, `download_poll.py`) but have never been tested end-to-end.

**Validate:**
- Stand up a local qBittorrent container; run the full grab → queue → `poll_downloads` → import flow; document any bugs found
- Repeat with Transmission
- Fix whatever breaks — likely: remote path mapping edge cases, status enum mismatches, stalled-torrent detection
- Add `torrent_hash` to `QueueItem` model so polling doesn't rely solely on name matching
- Mark torrent support as validated in CLAUDE.md once both clients pass

---

## What's already solid (no work needed)

- Navigation structure — matches Radarr exactly
- Queue / History / Blocklist — functionally complete
- Settings structure — right categories, good coverage
- System pages — Status, Tasks, Events, Backup, Logs all solid
- IGDB metadata — strong implementation with tiered search + enrichment
- Library import — No-Intro DAT CRC matching, multi-ROM ZIP support
- RetroArch export — no Radarr equivalent; Romarr-only value-add

---

## Out of scope (confirmed)

- Custom Formats
- Trakt / IMDb / Letterboxd import lists
- Physical media / edition tracking
- Cast & crew metadata
- Real-time log streaming (SSE/WebSocket)
- Calendar view
