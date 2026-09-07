# Docs — start here

> Status: vivo. Target structure lands in stages (see backlog TD-010);
> until then this file maps the current layout.

## Where to look

| I want… | Go to |
|---|---|
| What was done, when | `CHANGELOG.md` (per-month rotation planned) |
| Open debt / ideas / what's next | `backlog.md` (TD-/IDEA-) |
| What was retired and where it lives now | `LEGACY.md` |
| How a business domain works today | `modules/<domain>.md` (~10 domains after consolidation) |
| How the system works (data, backend, frontend, auth) | `architecture/` (lands in stages; today: `system/`, `core-concepts.md`, `platform-overview.md`) |
| Why a past decision was made | `decisions/` (lands in stages; today: `sdd/`) |
| How to operate (deploy, env, testing, security) | `operations/` (lands in stages; today: `AGENTS.md` + `security/`) |
| Past step-by-step logs, mocks, plans | `archive/` (history only, never indexed) |

## Rules

- One subject → one canonical doc. Everything else links or goes to `archive/`.
- Live docs carry front-matter (`status`, `owner`, `verified`, `expires`).
- `docs/archive/` is history only — never indexed, never a lookup target.
- Index: `.agents/docs-index.md` (GENERATED — do not edit; `index-updater` owns it).
