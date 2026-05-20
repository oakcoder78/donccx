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

## Current State (Phase 2 — Complete)

Full radar page with:
- Period filter (dropdown: Este mês, Último mês, Últimos 30/90 dias, Todo período, Personalizado com date picker)
- 4 KPI cards (atividades, clientes com toque, RMCs, projetos com avanço)
- Activity type bar chart + by-responsible chart
- Heatmap grid (grade completa, alinhamento semanal, escala de opacidade sky `#59c2ed`, tooltip no hover)
- Client table with semaphore sorting (🔴 → 🟡 → 🟢)
- Activity exclusion: `type='nota' + title='RMC visualizado'`
- Client list filtered by `lifecycle_stage = 'cliente'`
- RMC denominator excludes Onboarding, Em espera, Churned

## Data Flow

```
useCsRadar({ dateFrom, dateTo, responsibleId, clientIds, activityTypes, segmentIds })
  ├── stages → filter excluded → eligible clients
  ├── activities (period, filtered, automated exclusions)
  ├── client_reports (published in period)
  └── milestones (updated in period) → projects with progress

Output: { kpis, byType[], byResponsible[], heatmap[], clients[] }
```

## Page Structure

```
CsRadarPage
├── FilterBar (Period dropdown + custom date range)
├── KpiRow (4 cards)
│   ├── Total de atividades
│   ├── Clientes com toque / total
│   ├── RMCs publicados / esperados
│   └── Projetos com avanço
├── MiddleRow (2 cols)
│   ├── Activity type bars (horizontal, sorted desc)
│   └── Responsible bars
├── Heatmap grid (day columns, week rows, intensity)
└── Client table
    ├── Col: Nome + HS badge
    ├── Col: Última atividade (date + type icon)
    ├── Col: Qtd atividades
    ├── Col: RMC
    ├── Col: Projeto + milestone + % + "N outros"
    └── Col: Semáforo (🔴 >30d sem toque / 🟡 sem RMC / 🟢 ok)
```

## Planned Phases

| Phase | Status | Scope |
|---|---|---|
| Phase 1 — Foundation | **Complete** | Migration, CockpitsPage gateway, route, skeleton |
| Phase 2 — Hook + KPI Row | **Complete** | useCsRadar hook, KPI cards, PeriodSelect, charts, heatmap, client table |
| Phase 3 — Charts refinement | Planned | ActivityTypeChart colors per type, ResponsibleTable gated by role |
| Phase 4 — All filters | Planned | ClientMultiSelect, ActivityTypeSelect, SegmentSelect, ResponsibleSelect |
| Phase 5 — Empty/search states | Planned | Debounced search, empty/shimmer/error refinement |

## Key Files

| File | Purpose |
|---|---|
| `src/pages/CockpitsPage.jsx` | Gateway page `/cockpits` |
| `src/pages/CsRadarPage.jsx` | Main CS Radar page (complete) |
| `src/hooks/useCsRadar.js` | Data aggregation hook |
| `supabase/migrations/20260523000000_cs_radar_flag.sql` | Feature flag migration |
| `docs/sdd/cs-activity-cockpit-sdd.md` | SDD (single source of truth) |

## Related Modules

- `docs/modules/health-score-dashboard.md` — Health Score Dashboard (companion cockpit)
- `docs/modules/health-score.md` — Health score calculation engine
- `docs/modules/activities.md` — Activity entity module
- `docs/modules/clients.md` — Client entity module
