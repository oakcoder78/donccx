# doncCX Hub — Documentation Index

> GENERATED — do not edit by hand. Sole writer: `index-updater` skill.
> last-verified: 2026-09-11

## Purpose

Lightweight routing map for documentation lookup. Avoid loading full files.
Flow: `module-detector` → this index → retrieve minimal sections.

---

## Start here

- `docs/README.md` — map: timeline, backlog, legacy, domains, operations, decisions
- `docs/backlog.md` — open debt/ideas (TD-/IDEA-), status map
- `docs/CHANGELOG.md` — monthly index (`CHANGELOG-2026-MM.md`)
- `docs/LEGACY.md` — what was retired, when, where it lives now

## Product

- `docs/product/` — planned (vision, glossary, roadmap); today: `docs/core-concepts.md`, `docs/platform-overview.md`
- `docs/operations/` — `deploy.md`, `storage.md`
- `docs/security/` — `RLS-EMPRESAS-SERIES.md`, `SDD-AUDIT.md`, `SECURITY_REMEDIATION_PLAN.md`
- `docs/ui-patterns.md` — component patterns (Table, Toggle, Drawer, Health Legend…)

## Modules (`docs/modules/`, one file per business domain)

- activities (incl. attachments — steps archived)
- activity-attachments (summary; steps → `docs/archive/`)
- activity-modal
- brief
- clients (empresas, contrato/séries, RLS model)
- components, contexts, hooks, layout, lib, pages, services, settings, sync
- cs-radar
- donkie
- email
- greeting-engine (hub), greeting-engine-content, greeting-engine-debug, greeting-engine-phase-1-spec, greeting-engine-roadmap-v2, greeting-engine-runtime, greeting-engine-tone-guide
- health-score-dashboard (engine + dashboard merged)
- meu-dia-dashboard (dashboard v3)
- projects
- report-ai-analysis

## Architecture (`docs/system/`, to be consolidated into `docs/architecture/`)

- core-modules, data-flow, deployment-context, future-architecture, high-level-architecture, integration-points, operational-parser-reference, shared-modules, sync-pipeline, system-overview, system-purpose

## Decisions (frozen; addenda only)

- `docs/sdd/` — 15 SDDs (see `docs/sdd/` listing; `financeiro-cockpit-sdd.md` v0.3 (2026-09-11) com `financeiro-cockpit-regras.html` v1.1 validado (base do Help do cockpit); `empresas-form-v2-sdd.md` has 2026-09-07 addendum)
- `docs/brd/brd-financeiro-cockpit.md` (+ 0.6 addendum — ata de validação Financeiro/Vendas, 2026-09-11)
- `docs/decisions/` — planned (numbered ADRs)

## Not indexed (history only)

`docs/archive/` — steps, mocks v1/v2, `.plans`, superpowers specs, roadmap v1, `brd/*.html`, retired skills. Never a lookup target.

---

## Lookup Strategy

Always:

1 — Detect module
2 — Consult this index
3 — Retrieve minimal relevant file
4 — Summarize only required sections

Never:

- load full directories
- retrieve unrelated files
- duplicate documentation content
- hand-edit this file
