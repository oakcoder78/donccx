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

## Current State (All phases complete)

Full radar page with:
- Period filter (dropdown: Este mês, Último mês, Últimos 30/90 dias, Todo período, Personalizado com date picker)
- ResponsibleSelect (dropdown de CSMs, admin/manager only)
- ClientMultiSelect (multiselect com checkboxes)
- ActivityTypeSelect (multiselect por tipo)
- SegmentSelect (multiselect ABC)
- Search input (debounce 300ms, filtra clientes na tabela)
- Limpar filtros (botão aparece quando há filtros ativos)
- 4 KPI cards (atividades, clientes com toque, RMCs, projetos com avanço)
- Activity type bar chart (cores por tipo: reuniao navy, ligacao sky, email lime, whatsapp navy/60, tarefa sky/60, nota slate) + by-responsible chart (admin/manager only)
- Heatmap grid (grade completa, alinhamento semanal, escala de opacidade sky `#59c2ed`, tooltip no hover)
- Client table with semaphore sorting (🔴 → 🟡 → 🟢)
- Activity exclusion: `type='nota' + title='RMC visualizado'`
- Client list filtered by `lifecycle_stage = 'cliente'`
- RMC denominator excludes Onboarding, Em espera, Churned
- Shimmer skeleton on initial load
- Empty states específicos (sem atividades, sem clientes, sem busca)
- Error state with refetch retry

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
| Phase 2 — Hook + Full Page | **Complete** | useCsRadar hook, KPI cards, PeriodSelect, charts, heatmap, client table |
| Phase 3 — Charts refinement | **Complete** | ActivityTypeChart colors per type, ResponsibleTable gated by role |
| Phase 4 — All filters | **Complete** | ResponsibleSelect, ClientMultiSelect, ActivityTypeSelect, SegmentSelect |
| Phase 5 — Empty/search states | **Complete** | Debounced search, shimmer skeleton, empty states, refetch retry |
| **All phases** | **Complete** | — |

## Key Files

| File | Purpose |
|---|---|---|
| `src/pages/CockpitsPage.jsx` | Gateway page `/cockpits` |
| `src/pages/CsRadarPage.jsx` | Main CS Radar page (complete) |
| `src/hooks/useCsRadar.js` | Data aggregation hook |
| `supabase/migrations/20260523000000_cs_radar_flag.sql` | Feature flag migration (disabled) |
| `supabase/migrations/20260524000000_enable_cs_radar_flag.sql` | Enable flag in production |
| `supabase/migrations/20260526000000_create_milestones_table.sql` | Create milestones table |
| `docs/sdd/cs-activity-cockpit-sdd.md` | SDD (single source of truth) |

## Related Modules

- `docs/modules/health-score-dashboard.md` — Health Score Dashboard (companion cockpit)
- `docs/modules/health-score.md` — Health score calculation engine
- `docs/modules/activities.md` — Activity entity module
- `docs/modules/clients.md` — Client entity module
