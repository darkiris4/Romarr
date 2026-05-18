# Stage 3 Test Checklist

Branch: `feat/arr-parity-stage-3`

Items are split into **automated** (run by Claude before this doc was written) and **web UI** (requires a browser).

---

## Automated tests (already run) ✅

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean — zero type errors |
| `eslint src` | ✅ Clean — zero errors (3 dev-only warnings in ColumnChooser, won't affect CI) |
| `prettier --check src` | ✅ Clean — all files formatted |
| `npm run build` | ✅ Clean — Vite build succeeds, 534 KB bundle |
| `@tanstack/react-virtual` installed | ✅ v3.13.24 in package.json |
| localStorage key collision check | ✅ `games-view`, `games-filter-presets`, `games-column-config` — no conflicts |
| Virtual scroll colSpan math | ✅ 2 + visible + 1 = 7 in both selecting and non-selecting modes |
| `gamesRef.current` update order | ✅ Written after `games` useMemo, before keyboard handler fires |
| Function declaration hoisting | ✅ `handleSort`, `updateParams`, `handleJump` etc. all use `function` keyword |
| Keyboard guard covers all input types | ✅ `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement` |
| Jump bar only mounts on name sort | ✅ Guarded by `sortBy === 'name_asc' \|\| sortBy === 'name_desc'` |
| openSearch / openEdit state cleared | ✅ `window.history.replaceState({}, '')` after consuming |

---

## Web UI checklist

### Sort indicators

- [ ] In table view, Title column shows muted `↕` when not sorted by title
- [ ] Clicking Title header sorts A→Z (active `↑` appears on Title)
- [ ] Clicking Title header again sorts Z→A (`↓` appears)
- [ ] Clicking Platform header switches sort to Platform (`↑` on Platform, muted `↕` on Title/Year)
- [ ] Clicking Year header sorts newest first (`↓`); clicking again sorts oldest (`↑`)
- [ ] Active sort indicator matches the current Sort dropdown selection

---

### Poster hover — Edit button

- [ ] Hover over a poster card — three buttons appear: Re-search, Edit (pencil), Delete
- [ ] Clicking Edit navigates to the game's detail page
- [ ] On the detail page, the Edit modal opens automatically

---

### Revision Unmet retry button

- [ ] Wanted → Revision Unmet tab shows the subtitle: *"These games have a newer No-Intro revision available than the ROM you currently have on disk."*
- [ ] The action button in the Revision Unmet row shows a Search icon (not RotateCcw)
- [ ] Clicking it navigates to game detail and the Manual Search modal opens automatically

---

### Loading screens

- [ ] Games page shows pixel-art spinner + witty quip on first load
- [ ] Navigating to History shows pixel-art spinner (not plain spinner)
- [ ] Navigating to Queue shows pixel-art spinner
- [ ] Navigating to Wanted → Missing shows pixel-art spinner
- [ ] Navigating to Wanted → Revision Unmet shows pixel-art spinner
- [ ] Navigating to a Game detail page shows pixel-art spinner

---

### Custom filter presets

- [ ] Open the Filter dropdown — "Save current filters" is disabled when no filters are active
- [ ] Apply any filter (e.g. a platform) — "Save current filters" becomes clickable (accent colour)
- [ ] Click "Save current filters" — an inline name input appears with a Save button
- [ ] Type a name and press Enter (or click Save) — the preset chip appears above the game list
- [ ] Close filter dropdown — chip is still visible
- [ ] Click the chip — filters are applied (URL params update, list narrows)
- [ ] Click × on the chip — preset is removed
- [ ] Create 10 presets — "Max 10 presets reached" message appears, button disabled
- [ ] Refresh the page — presets persist (localStorage)
- [ ] Applying a preset preserves the current sort direction

---

### Jump bar

- [ ] Sort by "Name A→Z" — a vertical rail of letters appears on the right edge of the screen
- [ ] Letters with no matching games are visually dimmed and unclickable
- [ ] Clicking an active letter scrolls the table to the first game starting with that letter
- [ ] The scrolled-to row is keyboard-highlighted (purple outline)
- [ ] Sort by "Platform" — jump bar disappears
- [ ] Sort by "Name Z→A" — jump bar reappears
- [ ] `#` letter jumps to games whose titles start with a non-letter character
- [ ] On a narrow viewport (< 900px) the jump bar is hidden

---

### Keyboard shortcuts

- [ ] With no input focused, press `J` — focus moves to the first row (purple outline)
- [ ] Press `J` repeatedly — focus advances row by row; stops at last row
- [ ] Press `K` — focus moves backward; stops at first row
- [ ] Press `↓` / `↑` — same behaviour as J/K
- [ ] Press `Enter` on a focused row — navigates to that game's detail page
- [ ] Press `E` on a focused row — navigates to game detail with Edit modal open
- [ ] Press `S` on a focused row — triggers an indexer search (no visible confirmation needed; check Network tab)
- [ ] Press `M` on a focused row — game's monitored state toggles (row updates)
- [ ] Press `?` — shortcuts help modal appears listing all 7 shortcuts with styled `<kbd>` tags
- [ ] Press `?` again (or click outside) — modal closes
- [ ] Click into the search bar, press `J` — focus does NOT move (guard works)
- [ ] Apply a filter or change sort — focused row resets to -1

---

### Column chooser

- [ ] In table view, a "Columns" gear button appears in the toolbar
- [ ] Clicking it opens the Column Chooser modal with 5 rows: Platform, Region, Year, Status, Tags
- [ ] All four default columns are checked; Tags is unchecked by default
- [ ] Unchecking "Region" — the Region column disappears from the table
- [ ] Re-checking "Region" — column reappears
- [ ] Enabling "Tags" — a Tags column appears showing game tags (or `—`)
- [ ] Drag a row (e.g. drag Status above Platform) — column order in the table changes
- [ ] Click "Reset" — columns return to default order and visibility
- [ ] Click "Done" — modal closes; settings are preserved
- [ ] Refresh the page — column config persists (localStorage)
- [ ] Switching to Poster or Overview view — Columns button is not visible (table-only)

---

### Virtual scroll

- [ ] With a large library (50+ games), scrolling the table is smooth with no janky reflow
- [ ] Rows above and below the viewport are not in the DOM (inspect → `tbody` has far fewer `<tr>` than total games)
- [ ] "Edit Games" bulk-select mode activates instantly with no UI freeze
- [ ] Keyboard J/K scrolls the table viewport to keep the focused row visible
- [ ] Jump bar letter click scrolls the virtual list to the correct row

---

## Notes

- All non-UI tests ran against the `feat/arr-parity-stage-3` branch tip (commit `28ef407`)
- Virtual scroll requires at least ~20 games to observe the windowing effect in DevTools
- The poster/overview views are not virtualised — virtual scroll is table-only
