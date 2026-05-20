# Module — CS Radar

## Purpose
The **CS Radar** (`/cs-radar`) dashboard aggregates activities, RMC reports, and project progress to help CS managers and CSMs understand what was done across the portfolio in any given period. It is accessed via the **Cockpits** gateway (`/cockpits`) alongside the Health Score Dashboard.

## Route & Access

| Property | Value |
|---|---|
| Route | `/cs-radar` |
| Navbar | Acessado via "Cockpits" → `/cockpits` (gateway page com cards para Health Score e CS Radar) |
| Feature flag | `cs_radar` (table `feature_flags`) |
| Roles | `admin`, `manager`, `csm` |
| Guard | Feature flag check + authentication |

## Current State (Phase 1 — Complete)

Page skeleton at `src/pages/CsRadarPage.jsx` with placeholder "Em construção".

## Planned Phases

| Phase | Status | Scope |
|---|---|---|
| Phase 1 — Foundation | **Complete** | Migration, CockpitsPage gateway, route, skeleton page |
| Phase 2 — Hook + KPI Row | Planned | `useCsRadar` hook, 4 KPI cards, PeriodSelect |
| Phase 3 — Charts | Planned | ActivityTypeChart (horizontal bars), ResponsibleTable |
| Phase 4 — Heatmap | Planned | Calendar heatmap with intensity by activity volume |
| Phase 5 — Client Table | Planned | Client table with semaphore, sorting, all filters functional |

## Key Files

| File | Purpose |
|---|---|
| `src/pages/CockpitsPage.jsx` | Gateway page `/cockpits` — links to both cockpits |
| `src/pages/CsRadarPage.jsx` | Main CS Radar page (skeleton) |
| `src/hooks/useCsRadar.js` | Planned — data aggregation hook |
| `supabase/migrations/20260523000000_cs_radar_flag.sql` | Feature flag migration |
| `docs/sdd/cs-activity-cockpit-sdd.md` | SDD (single source of truth) |

## Related Modules

- `docs/modules/health-score-dashboard.md` — Health Score Dashboard (companion cockpit)
- `docs/modules/health-score.md` — Health score calculation engine
- `docs/modules/activities.md` — Activity entity module
- `docs/modules/clients.md` — Client entity module
