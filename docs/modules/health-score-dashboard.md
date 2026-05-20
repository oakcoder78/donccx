# Module — Health Score Dashboard

## Purpose
The Health Score Dashboard (`/health`) provides a centralized view of the client portfolio's health status. It displays an aggregated scorecard, a ranked table of all clients by health score, and advanced filters for CSM workflow prioritization.

## Route & Access

| Property | Value |
|---|---|
| Route | `/health` |
| Feature flag | `health` (table `feature_flags`) |
| Roles | `admin`, `manager` (analyst blocked via redirect in component) |
| Guard | Internal `useEffect` redirects to `/dashboard` if `isEnabled('health', role)` is false |

## Page Structure

```
HealthDashboardPage (src/pages/HealthDashboardPage.jsx)
├── PageHeader ("Health Score · Carteira" + "{n} clientes ativos")
├── Scorecard (4 cards)
│   ├── Média Geral (colored by band)
│   ├── Saudáveis  (green #2f9e70)
│   ├── Atenção    (amber #d98b28)
│   └── Alerta     (red #d64545)
├── Filter bar
│   ├── Search input (debounced 300ms, by fantasy_name/name)
│   ├── CSM dropdown (admin/manager only, from useProfiles)
│   └── Critical dimension dropdown (filters score < 10)
├── Band chips (Todos / Saudáveis / Atenção / Alerta with counts)
├── "Limpar filtros" button (visible when any filter active)
└── Ranking table
    ├── Columns: #, Empresa, Total, Uso, Sup, Rel, Fin, Proj, Δ
    └── Row click → navigate(/empresas/{id}?tab=health)
```

### Color Tokens
All colors defined locally in `HealthDashboardPage.jsx` as `C.*` object (copied from `DashboardPage.jsx`, not imported):

| Token | Hex |
|---|---|
| `C.dimUso` | `#59c2ed` |
| `C.dimSuporte` | `#b46cd1` |
| `C.dimRel` | `#d98b28` |
| `C.dimFin` | `#2f9e70` |
| `C.dimProj` | `#d3da47` |
| Green (band) | `#1D9E75` |
| Amber (band) | `#BA7517` |
| Red (band) | `#E24B4A` |

### Score Bands

| Label | Range | Color |
|---|---|---|
| Saudável | ≥ 75 | Green |
| Atenção | ≥ 50 and < 75 | Amber |
| Alerta | < 50 | Red |

## Data Flow

```
useAuth ──► profile (for role check + csm_id fallback)
useClients({ lifecycle_stage: 'cliente'[, csm_id] }) ──► clients[]
useProfiles ──► profiles[] (filtered to CSM role for dropdown)

clients
  → debouncedSearch filter (client-side)
  → bandFilter (client-side, by health_total range)
  → dimFilter (client-side, score < 10 on selected dimension)
  → csmFilter (client-side, by csm_id)
  → sorted ascending by health_total
  → render table
```

The source query always includes `lifecycle_stage: 'cliente'` to exclude leads, prospects, and partners. Admin/manager sees all clients with active contracts; CSM sees only their own portfolio (`csm_id = profile.id`).

Scorecard values (avg, saudáveis, atenção, alerta) reflect the **post-filter** data, not the full unfiltered portfolio.

## Filter Chain

Filters apply in this order, each narrowing the result:

1. **Search** — `debouncedSearch` (300ms debounce), matches `fantasy_name` or `name`
2. **Band chip** — `bandFilter`: `all` / `saudavel` (≥75) / `atencao` (50-74) / `alerta` (<50)
3. **Critical dimension** — `dimFilter`: filters to clients where the selected dimension score < 10
4. **CSM** — `csmFilter`: filters by `csm_id` (admin/manager only)

"Limpar filtros" resets all three (band, dim, CSM) but preserves search text.

## Sorting

Clients sorted by `health_total` ascending (worst first). Clientes em risco aparecem no topo — priorização natural para o CSM.

## Trend Column (Δ)

The `health_trend` column was added via migration `20260519000001_add_health_trend.sql` and calculated by `calculate_health_trends()` SQL function, called by `monthly-sync` after `health-recalc`.

| Value | Color | Meaning |
|---|---|---|
| `+N` | Green (`#2f9e70`) | Score improved since last month |
| `-N` | Red (`#d64545`) | Score declined since last month |
| `—` | Gray (`C.ink4`) | No change or no prior data |

Values are `0` (rendered as `—`) until the first monthly-sync runs.

## Back Button Context

When navigating from `/health` to a client detail (`/empresas/{id}?tab=health`), the dashboard passes `{ state: { from: location.pathname + location.search } }`. `ClientDetail.jsx` reads `location.state?.from` and:

- Shows **"← Health Score"** button when origin is `/health`
- Shows **"← Empresas"** (fallback) for direct access

## ClientHealthDrawer — Dimension Accordion

The client drawer (`src/components/clients/ClientHealthDrawer.jsx`) shows the "Saúde por dimensão" section as **5 cards, always visible**:

| Score | Behavior |
|---|---|
| **≥ 20** | Static card — name + score + full progress bar. No interaction. |
| **< 20** | Accordion — click header to expand/collapse. Only one open at a time. |

### Data sources per dimension

Each expanded dimension runs a **dedicated Supabase query** for the current client:

| Dimension | Query | Table | Fields |
|---|---|---|---|
| **Suporte** | `client_support_drawer` | `client_support` | `tickets_opened`, `tickets_resolved`, `sla_first_response` |
| **Uso** | `client_usage_drawer` | `client_usage` (2 months) | `os_created`, `active_users` — também calcula variação % |
| **Relacionamento** | `contact_links_drawer` | `contact_links` | `papel`, `champion`, `engajamento` |
| **Financeiro** | — | `clients.delay_days` | Usa campo já presente no objeto `client` |
| **Projeto** | `client_onboarding_drawer` | `onboardings` + `onboarding_fases` | `situacao_geral`, `planned_end`, `status` |

All 4 queries use:
- `staleTime: 2 * 60 * 1000` (2 min)
- `enabled: !!client.id`

### Enriched rule labels (`enrichDimLabel`)

Instead of showing generic labels from the `health_rules` table, the drawer replaces them with **actual measured values**:

| rule_key | Old label | New label |
|---|---|---|
| `sla_nok` | "SLA primeira resposta >15 min" | "SLA: 23 min (meta ≤15 min)" |
| `t15_nok` / `thi_nok` | "1-15 tickets, resolução <90%" | "Resolução: 67% (4/6)" |
| `os_down` / `os_up` | "OS caindo >35%" | "OS: 18 (vs 42, −57%)" |
| `usr_down` / `usr_up` | "Usuários caindo >35%" | "Usuários: 5 (vs 12, −58%)" |
| `nd_m1/2/3` | "Sem decisor — mês 3+" | "Sem decisor (8 meses)" |
| `no_champ` | "Sem champion" | "Sem champion identificado" |
| `eng_low/mid/high` | "Engajamento baixo" | "Engajamento: Baixo (45d sem interação)" |
| `fin_30/60/90` | "Atraso até 30 dias" | "Fatura atrasada 15 dias" |
| `mp_late` | "Milestone atrasado" | "Milestones atrasadas: 2" |
| `ob_late` | "Onboarding não concluído 90d" | "Onboarding incompleto (120d de go-live)" |

The `MetricRow` component renders each metric as `<label> <value>` row.

### Accordion UX

```
┌─────────────────────────────────────┐
│ ▶ Suporte                  12/20   │  ← <20 clickable, chevron rotates
│ ██████████████░░░░░░░░░░░░░░░░░░   │
└─────────────────────────────────────┘
↓ expanded (one at a time):
┌─────────────────────────────────────┐
│ ▼ Suporte                  12/20   │  ← click collapses
│ ██████████████░░░░░░░░░░░░░░░░░░   │
│                                      │
│ Tickets abertos              6      │
│ Resolvidos            4 (67%)       │
│ SLA 1ª resposta          23 min     │
│                                      │
│ Penalizando                         │
│ SLA: 23 min (meta ≤15 min)    −5   │
│ Resolução: 67% (4/6)          −5   │
│                                      │
│ Como melhorar                        │
│ SLA ≤15 min                    +5   │
│ Resolução ≥90%                 +3   │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Uso                         20/20   │  ← ≥20 static, no chevron
│ ████████████████████████████████   │
└─────────────────────────────────────┘
```

### Key functions

| Function | Purpose |
|---|---|
| `getDimensionInsights(client, dimKey, dimCls, rules)` | Filters rules by dimension. Returns `{ violated[], toImprove[] }` — all negative-points rules as violated, positive as toImprove when score < 20. |
| `enrichDimLabel(rule, dimCls)` | Maps `rule_key` + raw data (closure over `dimMetrics`, `supportData`, `usageData`, `contactData`, `onboardingData`, `lastActivityMap`, `client.delay_days`) → human-readable label with actual values. |
| `MetricRow({ label, value })` | Renders a single `<label> <value>` pair. |
| `dimMetrics` (useMemo) | Computes derived metrics: `osChg`, `usrChg`, `resolucaoPct`, `decisor`, `champion`, `lowEng`, `midEng`, `lateFases`. |

## Known Divergences

- Colors between `DashboardPage.jsx` (canonical), `ClientTabHealth.jsx` (status-based), and `reportGenerator.js` differ. Only `health_uso` (`#59c2ed`) is consistent across all three. Future fix: centralize tokens in `src/lib/constants.js`.
- `scoreBand()`, `scoreBandColor()`, `scoreBandLabel()`, and the `C` object are redefined in every file that needs them — not exported from `DashboardPage.jsx`.

## Key Files

| File | Purpose |
|---|---|---|
| `src/pages/HealthDashboardPage.jsx` | Main dashboard page (343 lines) |
| `src/components/clients/ClientHealthDrawer.jsx` | Client drawer with accordion + real metrics per dimension |
| `src/components/clients/ClientDetail.jsx` | Client detail page with back button context |
| `src/components/dashboard/DashboardPage.jsx` | Main dashboard with health block + "ver todos →" → `/health` |
| `src/components/ui/PageHeader.jsx` | Page header component |
| `src/hooks/useClients.js` | Hook for loading clients with filters |
| `src/hooks/useProfiles.js` | Hook for loading profiles (CSM dropdown) |
| `src/hooks/useFeatureFlags.js` | Feature flag hook |
| `src/hooks/useHealthConfig.js` | Hook for loading `health_rules` (used by drawer) |
| `src/lib/icons.js` | Icon barrel (never import from lucide-react directly) |
| `supabase/migrations/20260519000001_add_health_trend.sql` | Trend column + SQL function |
| `supabase/functions/monthly-sync/index.ts` | Step 4 triggers trend calculation |
| `supabase/functions/health-recalc/index.ts` | Edge function that calculates health scores |
| `docs/sdd/health-score-dashboard-sdd.md` | SDD (single source of truth for feature spec) |

## Related Modules

- `docs/modules/health-score.md` — Health score calculation engine (`src/lib/healthScore.js`)
- `docs/modules/clients.md` — Client entity module
- `docs/sdd/refactoring-sdd.md` — Refactoring plan (Phase 1 health-dashboard-adjacent cleanup)
