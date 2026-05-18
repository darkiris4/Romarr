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

## Stage 1 — Close the honesty gaps

> Target branch: `feat/arr-parity-stage-1`
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

## Stage 2 — Release & Delay Profiles

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

## Stage 3 — Library UX parity

> Polish and power-user features that make the library feel as capable as Radarr's.

| Item | Detail |
|---|---|
| **Column chooser** | Show/hide and drag-reorder columns in table view; persisted per user |
| **Custom filter presets** | Save current filter state with a name; selectable from filter menu |
| **Jump bar** | Alphabetical quick-nav rail when sorted by title |
| **Server-side pagination** | Required before 10k+ libraries become sluggish |
| **Keyboard shortcuts** | J/K navigate rows, E edit, S search, D delete, M toggle monitored |
| **Sort indicators** | Clear column header arrows for active sort + direction |
| **Poster hover actions** | Quick-access search, edit, delete on poster grid items |

---

## Stage 4 — Automation & discovery

> Completing the arr automation loop.

| Item | Detail |
|---|---|
| **Import lists** | Implement actual list-fetching backend (currently UI stub); IGDB watchlist as first source |
| **Series/franchise grouping** | Group games by franchise; browse by series on game detail |
| **Updates page** | Poll GitHub releases API; show "vX.Y.Z available" banner with changelog |
| **Rename dry-run preview** | Preview what files would be renamed before committing |
| **Torrent pipeline validation** | End-to-end test with qBittorrent and Transmission |

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
