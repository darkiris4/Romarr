# Stage 3 Plan — Library UX Parity

Branch: `feat/arr-parity-stage-3`

Items are ordered by complexity — quick wins first, heavy lifts last. Each can be implemented and committed independently.

---

## Complexity key

| Symbol | Effort |
|--------|--------|
| S | < 2 hours |
| M | half day |
| L | full day |
| XL | 2+ days |

---

## Item 1 — Sort indicators `S`

**What:** Column headers in the table view show a clear up/down arrow indicating which column is sorted and in which direction. Matches Radarr exactly.

**Current state:** No arrows anywhere — the active sort is only visible in the Sort dropdown.

**Files:**
- `frontend/src/pages/Games/GamesTable.tsx` — accept `sortBy` + `onSort` props, add arrow icons to headers
- `frontend/src/pages/Games/GamesPage.tsx` — pass sort state down; wire header clicks to `updateParams`

**Notes:**
- Use Lucide `ArrowUp` / `ArrowDown` for the active column; a muted `ArrowUpDown` for inactive sortable columns
- Sortable columns: Title, Platform, Year, Status (maps to existing sort keys)
- Clicking an active column header toggles direction (asc ↔ desc) — clicking inactive column sets it as active asc
- `.release-table th.sortable` CSS already exists; adapt it for `.activity-table`

---

## Item 2 — Poster hover actions: add Edit `S`

**What:** The poster grid hover overlay currently shows Re-search + Delete. Add an Edit button that opens the game's edit modal inline (or navigates to detail with the modal pre-opened).

**Current state:** `poster-hover-actions` div and CSS already exist in `GamesPosters.tsx` and `global.css`. Only two buttons present.

**Files:**
- `frontend/src/pages/Games/GamesPosters.tsx` — add Edit button; needs `onEdit` prop or navigate-with-state
- `frontend/src/pages/Games/GamesPage.tsx` — pass `onEdit` handler

**Notes:**
- Simplest approach: navigate to `/games/${game.id}` — consistent with table view behaviour
- Better approach: open `EditGameModal` inline (lift modal into GamesPage, pass `editTarget` state); avoids page nav for a quick edit
- The inline approach reuses the modal already in `GameDetailPage.tsx` — extract it to a shared component first

---

## Item 3 — Revision Unmet retry button `S`

**What:** The navigate button on Wanted → Revision Unmet currently just goes to the game detail page. It should navigate there AND auto-open the Manual Search modal so the user can immediately grab the newer revision.

**Current state:** `WantedPage.tsx` uses `navigate(`/games/${entry.id}`)` with no state.

**Files:**
- `frontend/src/pages/Wanted/WantedPage.tsx` — pass `{ state: { openSearch: true } }` to navigate
- `frontend/src/pages/Games/GameDetailPage.tsx` — read `location.state?.openSearch` on mount and set `showSearch(true)`

**Notes:**
- React Router `useLocation` + `useEffect` to detect the flag on mount; clear state after consuming it to avoid re-triggering on back/forward
- Also add a tooltip or small description to the Revision Unmet tab heading to address the "what does this mean?" question from testing — a one-liner: "These games have a newer No-Intro revision available than the ROM you currently have on disk."

---

## Item 4 — Jump bar `M`

**What:** A fixed alphabetical quick-nav rail on the right edge of the Games page (A–Z + #). Clicking a letter scrolls to the first game starting with that letter. Only shown when sorted by Name A→Z or Name Z→A.

**Current state:** Not implemented.

**Files:**
- `frontend/src/pages/Games/JumpBar.tsx` — new component; accepts `letters: string[]` + `onJump: (letter) => void`
- `frontend/src/pages/Games/GamesPage.tsx` — compute available letters from sorted `games`; render `JumpBar`; implement scroll-to via `document.getElementById` or forwarded refs
- `frontend/src/styles/global.css` — fixed-right sidebar styling

**Notes:**
- Each game row/card needs a stable `id` attribute: `game-row-${game.id}` — add to GamesTable and GamesPosters
- JumpBar itself is a thin vertical strip of letter buttons (`position: fixed; right: 12px`)
- Dim letters that have no games (no games start with 'X')
- Only mount when `sortBy === 'name_asc' || sortBy === 'name_desc'`
- On mobile this would overlap content — hide below a breakpoint

---

## Item 5 — Keyboard shortcuts `M`

**What:** Power-user keyboard navigation through the game list. Matches the Radarr keyboard shortcut pattern.

| Key | Action |
|-----|--------|
| `J` / `↓` | Move focus to next row |
| `K` / `↑` | Move focus to previous row |
| `Enter` | Navigate to focused game's detail page |
| `E` | Open Edit modal for focused game |
| `S` | Trigger manual search for focused game |
| `M` | Toggle monitored on focused game |
| `?` | Show shortcuts help overlay |

**Current state:** Not implemented.

**Files:**
- `frontend/src/pages/Games/GamesPage.tsx` — `focusedIndex` state; global `keydown` listener (skip when `<input>`, `<textarea>`, `<select>` is focused); dispatch actions based on key
- `frontend/src/pages/Games/GamesTable.tsx` — highlight the focused row (CSS class `keyboard-focused`)
- `frontend/src/styles/global.css` — `.keyboard-focused` row style

**Notes:**
- Guard: `if (e.target instanceof HTMLInputElement || ...) return`
- `focusedIndex` resets to -1 when the game list changes (filter, sort)
- The `?` help overlay is a simple modal listing the shortcuts — low effort, high discoverability
- J/K only make sense in table view; disable in poster/overview views (or just let focus be invisible there)

---

## Item 6 — Custom filter presets `M`

**What:** Save the current filter state (platform, status, missing, region) under a name. Saved presets appear as clickable chips above the filter panel. Clicking one restores that filter state. No backend — stored in `localStorage`.

**Current state:** Filters are URL-param-driven (great for sharing), but not saveable by name.

**Files:**
- `frontend/src/pages/Games/GamesPage.tsx` — load/save presets from `localStorage`; render preset chips in the toolbar; "Save current filters" button inside the filter dropdown
- `frontend/src/styles/global.css` — preset chip styling

**Data shape (localStorage key `games-filter-presets`):**
```json
[{ "name": "Missing Covers", "params": "missing=no_cover" }, ...]
```

**Notes:**
- "Save current filters" only enabled when `activeFilterCount > 0`
- Presets strip the `sort` param (presets are filter-only, not sort presets)
- Per-preset delete button (×) on the chip
- Max ~10 presets to keep the UI clean; enforce in the save handler

---

## Item 7 — Column chooser `L`

**What:** Let the user show/hide columns in the table view and optionally reorder them. Configuration persisted in `localStorage`.

**Current state:** GamesTable has a fixed set of columns: Cover, Title, Platform, Region, Year, Status, Actions.

**Files:**
- `frontend/src/pages/Games/GamesPage.tsx` — load column config from localStorage; pass to GamesTable; gear button in toolbar to open chooser
- `frontend/src/pages/Games/GamesTable.tsx` — accept `columns: ColumnConfig[]` prop; render only visible columns in the declared order
- `frontend/src/components/ColumnChooser.tsx` — new; toggle checkboxes + drag-to-reorder list
- `frontend/src/styles/global.css` — chooser panel styling

**Column config shape:**
```ts
interface ColumnConfig {
  key: 'cover' | 'title' | 'platform' | 'region' | 'year' | 'status' | 'tags'
  label: string
  visible: boolean
}
// 'cover' and 'title' are always visible — cannot be hidden
```

**Notes:**
- Drag-to-reorder: use `@dnd-kit/core` (already a common dep in React projects) or a simple mouse-drag approach with CSS. Check if dnd-kit is already in `package.json` before adding.
- Persist to `localStorage` under `games-column-config`
- Add a "Reset to default" button in the chooser
- Only applies to table view — poster and overview views unaffected

---

## Item 8 — Server-side pagination / virtual scroll `XL`

**What:** The games list currently loads up to 10,000 records in one request. Fine for most libraries today, but will become sluggish at scale.

**Current state:** `GET /games?limit=10000` — single request, client-side filter/sort.

**Decision required before implementing:**

| Approach | Pros | Cons |
|----------|------|-------|
| **A: Virtual scrolling** (client-side) | Keeps all client-side filter/sort; no backend changes; renders only visible rows | Still fetches all records; memory usage unchanged |
| **B: Server-side pagination** | Real performance fix; scales to any library size | Filter/sort must move to backend; breaks the instant client-side filter experience; significant backend work |
| **C: Hybrid** | Load first N records, fetch more on scroll | Complex state management; filter/sort partial results look wrong |

**Recommendation:** Start with **A (virtual scroll)** using `@tanstack/react-virtual`. It eliminates the DOM rendering bottleneck (the main cause of the "Edit Games" lag) with minimal architectural change. Then move to B when libraries consistently exceed ~5k games.

**Files (virtual scroll path):**
- `frontend/src/pages/Games/GamesTable.tsx` — wrap `<tbody>` with `useVirtualizer`
- `frontend/package.json` — add `@tanstack/react-virtual`

**Files (server-side path, future):**
- `backend/app/api/v1/games.py` — add filter params (platform_id[], status[], region[], missing), sort param, return `{ items, total }`
- `frontend/src/pages/Games/GamesPage.tsx` — replace client-side filter/sort with query params; add pagination controls

---

## Open items carried from Stage 2 testing

These are small fixes that should land early in Stage 3:

- **Revision Unmet tab description** — add a one-liner subtitle explaining what "revision unmet" means (see Item 3)
- **Witty loading screen on other pages** — `LoadingScreen` component exists but is only used on Games. Apply it to Wanted, History, Queue pages which still use plain `<div className="loading-page"><div className="spinner" /></div>`

---

## Suggested implementation order

1. Item 3 — Revision Unmet retry + description (S, unblocks user confusion)
2. Witty loading screen — other pages (S, 30 min, consistent polish)
3. Item 1 — Sort indicators (S, visible quality signal)
4. Item 2 — Poster hover Edit button (S, completes the poster UX)
5. Item 6 — Custom filter presets (M, high daily-use value)
6. Item 4 — Jump bar (M, fun + useful for large libraries)
7. Item 5 — Keyboard shortcuts (M, power-user)
8. Item 7 — Column chooser (L, defer if bandwidth is tight)
9. Item 8 — Virtual scroll (XL, implement after confirming approach)
