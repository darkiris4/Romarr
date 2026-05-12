# Contributing to Romarr

Thank you for your interest in contributing! Romarr is in early development, so the codebase is moving fast — please open an issue or discussion before starting significant work so we can coordinate and avoid duplicated effort.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

---

## Code of Conduct

Be respectful and constructive. This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) Code of Conduct.

---

## Reporting Bugs

Use the [bug report template](../../issues/new?template=bug_report.md). Please include:

- Romarr version / commit hash
- How you're running it (Docker or manual)
- Steps to reproduce
- What you expected vs. what happened
- Relevant log output (Settings → General → Logs, or `docker compose logs backend`)

---

## Suggesting Features

Open a [feature request issue](../../issues/new?template=feature_request.md) before writing any code. For larger changes, a brief description of the approach is helpful so we can discuss trade-offs early.

---

## Development Setup

See the [Development Setup](README.md#development-setup) section in the README for full instructions.

**Short version:**

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

---

## Making Changes

1. **Fork** the repository and clone your fork
2. Create a **feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/short-description
   ```
3. Make your changes (see [Code Style](#code-style) below)
4. Test manually — there are no automated tests yet, so please verify the feature end-to-end
5. Commit with a clear message (see [Commit Messages](#commit-messages))
6. Push your branch and open a pull request against `main`

---

## Pull Request Process

- Fill out the PR template
- Keep PRs focused — one feature or fix per PR makes review much easier
- If your PR is a work in progress, open it as a **Draft** PR
- Expect review feedback; be prepared to make changes
- PRs will be squash-merged or rebased onto `main`

---

## Code Style

### Backend (Python)

- Follow [PEP 8](https://peps.python.org/pep-0008/)
- Type-hint all function signatures
- Use `snake_case` for variables and functions, `PascalCase` for classes
- Keep services and API routes separate — business logic belongs in `services/`, not in route handlers
- No bare `except:` — always catch a specific exception type

### Frontend (TypeScript / React)

- Strict TypeScript — no `any` unless absolutely unavoidable
- Function components only (no class components)
- Co-locate page-specific components next to their page file
- CSS lives in `src/styles/global.css` — avoid inline styles except for dynamic values (e.g., computed widths, colours from variables)
- Use TanStack Query for all server state; avoid `useState` for data that comes from the API

### Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add platform filter dropdown to games list
fix: scraper no longer retries games with igdb_id already set
docs: update IGDB setup instructions
refactor: extract tiered IGDB search into _run_tiered_search
```

Types: `feat`, `fix`, `docs`, `refactor`, `style`, `chore`, `test`

---

## Adding a Platform

Platform definitions live in `backend/app/api/v1/platforms.py` (`BUILTIN_PLATFORMS`). Each entry needs:

- `name` — display name
- `no_intro_name` — exact `<header><name>` value from No-Intro DAT files
- `folder_name` — subfolder name used in the ROM library
- `extensions` — comma-separated list of ROM file extensions
- `igdb_platform_id` — IGDB numeric platform ID (see [IGDB platforms](https://www.igdb.com/platforms))

---

## Adding a Title Alias

If a game isn't being found by the scraper because its No-Intro name differs from the IGDB title (common for Japanese or European regional releases), add an entry to `_TITLE_ALIASES` in `backend/app/services/igdb_service.py`:

```python
"No-Intro title here": "IGDB English title here",
```

Please include a comment explaining the mapping (e.g., `# Japanese title of Castlevania: Dracula X`).
