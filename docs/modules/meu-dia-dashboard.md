# Module — Meu Dia / Dashboard v3

> **Status: LIVE for all 6 roles (2026-08-30).** `/dashboard` renders the v3 (`MeuDiaV3Page` — 7 live
> blocks wired to the Phase 2 data sources) for every role, via the `DashboardRoute` wrapper. The
> `dashboard_v3` flag is now `{all 6 roles}` + `enabled=true` and is **kept as a DB kill-switch**:
> `UPDATE feature_flags SET enabled=false WHERE key='dashboard_v3'` reverts every role to the
> monolith with no deploy. `/labs/dashboard` = monolith under `AdminOnlyRoute` (admin only). The
> single source of truth is `docs/sdd/labs-dashboard-sdd.md`.
>
> **Deferred cleanup:** delete `DashboardRoute.jsx` + the flag once v3 is proven stable; "Ver como"
> dropdown ARIA (Navbar); the monolith's inline `handleSync` in the ops block (v3 links to
> `/configuracoes` instead); `DashboardPage.jsx` helper migration to `scoring.js`.
>
> **Live files:** `src/pages/DashboardRoute.jsx` (transitional wrapper), `src/pages/MeuDiaV3Page.jsx`,
> `src/components/dashboard/v3/*` (11 files), `src/components/ui/Drawer.jsx`, `src/App.jsx`
> `AdminOnlyRoute`, `src/pages/labs/LabsDashboardPage.jsx`, `src/hooks/useDashboard{Clients,Ytd}.js`,
> `src/hooks/useOperationalDeltas.js`, `supabase/migrations/2026083000000{0,1,2}_*.sql`.

## Purpose

The Dashboard (`/dashboard`) is the landing screen for every authenticated role. Version 3 ("Meu Dia")
replaces the CSM-coupled monolith with a **role-aware, block-based** page: a navy hero with a
per-role KPI set, an ecosystem view (YTD numbers + live map), the user's agenda, aggregated health,
open projects, and month-over-month operational deltas. The previous monolith is preserved at
`/labs/dashboard` behind an **admin-only** guard as a parity reference and kill-switch.

## Route & Access

| Property | `/dashboard` (v3) | `/labs/dashboard` (monolith) |
|---|---|---|
| Component | `src/pages/MeuDiaV3Page.jsx` | `src/components/dashboard/DashboardPage.jsx` |
| Roles | all 6 (`admin`, `manager`, `csm`, `sales`, `finance`, `analyst`) | `admin` only |
| Feature flag | `dashboard_v3` — `{all 6 roles}` + `enabled=true`, kept as a **kill-switch** (`enabled=false` → monolith for all, no deploy). Read only in `DashboardRoute.jsx`. | none (`labs_dashboard` retired) |
| Guard | `PrivateRoute` (analyst carve-out on `/dashboard`) → `DashboardRoute` wrapper | `AdminOnlyRoute` (admin-strict, no manager branch) |
| Navbar | "Dashboard" — visible for all (incl. analyst, since 2026-08-30) | "Labs" — visible only when `effectiveRole === 'admin'` |

## Page Structure

```
MeuDiaV3Page (src/pages/MeuDiaV3Page.jsx)   — order: personal first
│ lifted queries: useDashboardClients (HERO scope) · useActivities · useHealthConfig · useSyncStatus
│   useDashboardClientsOverview + useOpenProjectsOverview + useOperationalDeltas + useDashboardYtd  (RPCs, geral)
│   useActiveProfissionais (HERO) · get_finance_summary RPC (admin/manager/finance) · analyst tickets
├── DashboardHeader     — "Fechamento de {mês}" + "atualizado em DD/MM HH:mm"  (NO carteira dropdown since 2026-08-30)
│  ── PERSONAL (logged-in user) ──
├── HeroBlock           — navy; foto 108px; 3 lines: useGreeting().text · date · useGreeting().extra (C.sky, bold)
│   └── HeroCards       — per-role contract × 3 (see "HERO by role")
├── MinhaAgendaBlock    — atrasada > hoje > futura, cap 5; row → ActivityDetailModal; "Nova atividade" (hidden for finance)
│  ── TODA A BASE (company-wide via SECURITY DEFINER RPCs — identical numbers for all 6 roles) ──
├── SaudeDimensaoBlock  — get_dashboard_clients_overview; stacked dist per dim, worst-first; at-risk chips →
│                         <Drawer>+<ClientHealthDrawer> only if canDrillIn (carteira for csm/sales)
├── ProjetosAbertosBlock — get_open_projects_overview; top 3; row → /empresas/:id?tab=operacional&sub=projetos (if canDrillIn)
├── ForcaNumerosBlock   — get_dashboard_ytd: Clientes · OS criadas (ano) · Profissionais pico · Média health
├── EcossistemaMapBlock — get_dashboard_clients_overview → <BrazilMap onSelectUF> + "Top estados" chips
└── OperacionalVariacaoBlock — get_operational_deltas; 3 panels top-5; row → OperationalHistoryDrawer (if canDrillIn);
                             sync-status strip → admin/manager only
```

Every block owns its loading / empty / error state and is wrapped in `<BlockBoundary>` — a single
failing source never blanks the page. Section order is personal-first.

## HERO by role (`HeroBlock` `buildCards`)

| `effectiveRole` | Card 1 | Card 2 | Card 3 | Scope |
|---|---|---|---|---|
| `csm` / `sales` | Clientes | Profissionais Ativos | Health Score | **carteira** |
| `admin` / `manager` | Clientes | Profissionais Ativos | Health Score | **toda a base** |
| `finance` | MRR · mês (+ YTD est.) | Clientes em atraso (R$) | Renovação em 30D | `get_finance_summary` |
| `analyst` | Total Tickets | Tickets em Aberto | Taxa de Resolução | `client_support` aggregate |

Clientes + Health Score come from `useDashboardClients(profile)` (RLS-scoped); Profissionais Ativos from
`useActiveProfissionais` (RLS-scoped sum). No "Ordens de Serviço" card, no "Δ vs média 90 dias" (revised
2026-08-30). Finance cards come from `get_finance_summary()` (role-guarded RPC) — never the clients query
(gotcha A3).

## Data Flow

```
useAuth ──► profile, effectiveRole
useDashboardClients(profile)      ──► HERO clients   (RLS: carteira for csm/sales, base for admin/manager)
useActiveProfissionais()          ──► HERO Profissionais Ativos  (RLS-scoped sum of client_usage.active_users)
useActivities(filter)             ──► my agenda      (responsible_id for non-manager; no participant model)
useHealthConfig()                 ──► thresholds     (never hardcode 75/50)
useDashboardClientsOverview()     ──► RPC get_dashboard_clients_overview  (Saúde + Mapa — geral, no MRR)
useOpenProjectsOverview()         ──► RPC get_open_projects_overview      (Projetos — geral)
useOperationalDeltas()            ──► RPC get_operational_deltas          (Operacional — geral for all)
useDashboardYtd()                 ──► RPC get_dashboard_ytd               (Nossa força — company-wide)
useSyncStatus()                   ──► DashboardHeader "atualizado em"     (scoring.js dataRefMonth(): summary.ref_month →
                                                       else prevMonth(started_at) → else caller fallback)
get_finance_summary()  (RPC)  ──► finance HERO         (only when effectiveRole ∈ {admin,manager,finance};
                                                       RPC re-checks get_user_role, raises 'forbidden' otherwise)
```

## Reused building blocks

| Asset | File | Role in v3 |
|---|---|---|
| `C`, `HEALTH_ICONS`, `scoreBand*`, `getSignals`, `buildReasons`, `daysSince`, `tempVencida` | `src/lib/scoring.js` | tokens + bands + signals — **import, never copy** |
| `BrazilMap` | `src/components/dashboard/BrazilMap.jsx` | ecosystem map — was orphan; made interactive (`onSelectUF`) + pin legend |
| `ClientHealthDrawer` | `src/components/clients/ClientHealthDrawer.jsx` | the v3 client drawer content (extended with the monolith's `qaItems`); self-contained |
| `Drawer` (new) | `src/components/ui/Drawer.jsx` | shared right-side drawer shell — extracted from Health + monolith copies; `/health` migrates to it |
| `ActivityDetailModal` / `ActivityModal` | `src/components/activities/` | agenda row → detail → edit/create |
| `labsFilterFor` | `src/hooks/useLabsClients.js` | per-role client scoping — used by `useDashboardClients` for the HERO only |
| `useDashboardOverview` / `useOperationalDeltas` / `useActiveProfissionais` | `src/hooks/` | the "toda a base" RPC wrappers + HERO profissionais sum |
| `useGreeting` | `src/lib/greeting-engine` | hero lines 1 (text) + 3 (extra, highlighted) |
| `useProjectCockpit` | `src/hooks/useProjectCockpit.js` | **not used by v3** anymore — `/projetos-cockpit` page only |
| `useSyncStatus` | `src/hooks/useSyncStatus.js` | DashboardHeader "atualizado em" |

## Score bands

`scoreBand(score, thresholds)` from `src/lib/scoring.js`, `thresholds` from `useHealthConfig().config`
(default healthy ≥ 75, attention ≥ 50, alert < 50 — configurable in `/configuracoes` → Health).

## Interações & gating

The mock is static; the interactive layer is specified from the monolith. Full inventory + per-role
matrix in **SDD §5 "Interactive Surface & Permissions"**. Summary:

| Block | Scope | Interaction | Gating |
|---|---|---|---|
| HERO cards | user (carteira for csm/sales) | "Clientes" → `/empresas`; finance atraso → `/empresas`; analyst → `/atendimento`; rest static | Clientes/Health ← `useDashboardClients`; Profissionais ← `useActiveProfissionais`; finance ← `get_finance_summary` |
| Minha agenda | user | row → `ActivityDetailModal`; "Nova atividade" → `ActivityModal` | create/edit/concluir: all **except finance** (hide CTAs) |
| Saúde por dimensão | **toda a base** | at-risk chip → `<Drawer>` + `<ClientHealthDrawer>` **only if `canDrillIn`**; header → `/health` | `get_dashboard_clients_overview` (RPC); drill-in carteira-only for csm/sales |
| Projetos em aberto | **toda a base** | row → `/empresas/:id?tab=operacional&sub=projetos` **only if `canDrillIn`**; "ver todos" → `/projetos-cockpit` | `get_open_projects_overview` (RPC); `isEnabled('projects_cockpit')` for the footer link |
| Nossa força em Números | toda a base | static | `get_dashboard_ytd` |
| Mapa vivo | toda a base | UF/pin → `/empresas?estado=UF` | `get_dashboard_clients_overview`; destination list RLS-scoped |
| Operacional variação | **toda a base** | row → `OperationalHistoryDrawer` **only if `canDrillIn`**; SeeAll → `op-*-list` drawer | `get_operational_deltas` (RPC); **sync-status strip → admin/manager only** |
| "Ver como" | — | `setImpersonation` + reload | admin only |

`canDrillIn(row, effectiveRole, profileId)` (`src/components/dashboard/v3/gating.js`) = `admin|manager` OR
`row.csm_id === profileId` OR `row.comercial_id === profileId`. Non-owned rows in the "toda a base"
blocks render display-only for csm/sales.

**Transversal rule:** gate on `effectiveRole` (from `useAuth`/`usePermissions`), never `profile.role`.
A nav target is an active link only if the role has access (RLS or feature flag) — else it renders
static. A mutation the RLS blocks → hide the CTA, don't let it toast-fail.

**RLS write constraint:** since `20260830000002` csm/sales can INSERT/UPDATE/DELETE `activities` for
their own carteira; finance stays read-only (hide write CTAs).

## Known constraints / divergences

- **MRR masking (gotcha A3 — mitigated for the dashboard, 2026-08-30):** the finance HERO reads
  `get_finance_summary()` (role-guarded RPC), never `mrr` off the clients query. **Still leaking
  elsewhere:** `CLIENT_SELECT = '*'` returns `mrr`/`billing_*`/`delay_days`/`contract_renewal` on
  `/empresas`, `/health` etc. — v3 components must not read those off `useDashboardClients`.
- **"toda a base" blocks use SECURITY DEFINER RPCs** — `20260830000004`: `get_dashboard_clients_overview`
  (Saúde + Mapa), `get_operational_deltas` (Operacional), `get_open_projects_overview` (Projetos). Same
  numbers for every role; csm/sales can't SELECT company-wide (RLS). No mrr/billing (only
  `csm_temperature`/`temperature_updated_at` for the reused drawer). `get_dashboard_ytd` (Phase 2) feeds
  "Nossa força". `get_operational_90d_avg` still exists but the v3 no longer consumes it.
- **`activities` write is RLS role-gated** — since `20260830000002`: csm writes its `csm_id` carteira,
  sales its `comercial_id`/`csm_id` dual carteira (INSERT/UPDATE/DELETE). finance stays read-only.
- **`useOpClientHistory` (op-* drawer) is RLS-scoped** — only opened for carteira clients of csm/sales
  (non-owned rows aren't clickable). Doesn't sum instances — minor drift for multi-instance clients.
- **`client_donc_instances` is admin/manager-only** — the "Sincronização de dados" panel + `op-sync`
  drawer + "sincronizar" button do not render for other roles.
- **WCAG 2.1 AA is a Phase 3 completion gate** — the mock fails on label contrast (~1.5:1), missing
  `<main>`, ARIA-less "Ver como" dropdown, 200% zoom, color-only deltas. See SDD Phase 3 checklist.
- **No participant model for activities** — `MinhaAgendaBlock` uses `responsible_id` only; the mock's
  "participante" label maps to that.
- **`BrazilMap` fetches GeoJSON from `raw.githubusercontent.com`** — external URL; degrades to the
  top-states list on fetch failure (never a blank box).
- **Section order is personal-first** — HERO → agenda → saúde → projetos → força → mapa → operacional.
  Saúde/Projetos/Mapa/Operacional carry `<ScopeLabel scope="base">` ("toda a base") for every role.
- **greeting-engine is in Phase A (no expansion)** — hero line 3 = `useGreeting().extra` (the engine's
  narrative), rendered in `C.sky` bold. Line 2 is the date only. The old "Dados referente a" line was
  removed 2026-08-30. `sales`/`finance` identity pools are content-only additions.
- **The drawer shell is copy-pasted** in `HealthDashboardPage` and the monolith — v3 extracts
  `src/components/ui/Drawer.jsx` and migrates `/health` to it.
- **Monolith helpers are triplicated** (`DashboardPage.jsx`, `ClientHealthDrawer.jsx`, `scoring.js`).
  v3 imports from `scoring.js`; migrating the monolith is optional cleanup (SDD Phase 3).
- **The mock's design tokens are unused** — it defines Tailwind tokens and uses arbitrary `#hex`
  everywhere (22 near-dup values, 45 `text-[Npx]`). v3 uses `C` from `scoring.js` + the Tailwind type
  scale. Do not port the glassmorphism/blur-orb chrome.

## Key Files

| File | Purpose |
|---|---|
| `src/pages/MeuDiaV3Page.jsx` | v3 page — lifted queries + personal-first block layout + `BlockBoundary` per block |
| `src/components/dashboard/v3/*` | `primitives` (Panel/…/BlockBoundary), `ScopeLabel`, `gating` (`canDrillIn`), `DashboardHeader`, `HeroBlock`, `MinhaAgendaBlock`, `SaudeDimensaoBlock`, `ProjetosAbertosBlock`, `ForcaNumerosBlock`, `EcossistemaMapBlock`, `OperacionalVariacaoBlock`, `OperationalHistoryDrawer` |
| `src/components/ui/Drawer.jsx` | shared drawer shell (`DRAWER_Z`, `drawerPushStyle`); `/health` migrated to it |
| `src/components/clients/ClientHealthDrawer.jsx` | v3 client drawer content — `qaItems` incl. "Ver projeto ativo" |
| `src/components/dashboard/DashboardPage.jsx` | monolith — `/labs/dashboard` (admin only) |
| `src/components/dashboard/BrazilMap.jsx` | ecosystem map — `onSelectUF` + fetch-fail degrade |
| `src/hooks/useDashboardClients.js` | HERO clients — `useClients(labsFilterFor(profile))` wrapper |
| `src/hooks/useDashboardOverview.js` | `useDashboardClientsOverview()` + `useOpenProjectsOverview()` — geral RPCs |
| `src/hooks/useActiveProfissionais.js` | HERO Profissionais Ativos — RLS-scoped `client_usage` sum |
| `src/hooks/useOperationalDeltas.js` | `useOperationalDeltas()` (RPC `get_operational_deltas`) + `useOpClientHistory(id)` |
| `src/hooks/useDashboardYtd.js` | `useDashboardYtd()` (`get_dashboard_ytd`); `useOperational90dAvg()` unused by v3 |
| `src/lib/scoring.js` | tokens + helpers + `ymOffset`/`fmtMonth*`/`dataRefMonth` |
| `supabase/migrations/2026083000000{0,1,2}_*.sql` | Phase 2: YTD/90d RPCs · `get_finance_summary` · `activities` write RLS |
| `supabase/migrations/20260830000004_dashboard_v3_geral_rpcs.sql` | `get_dashboard_clients_overview` · `get_operational_deltas` · `get_open_projects_overview` |
| `src/App.jsx` | `AdminOnlyRoute`; route swap; analyst carve-out on `/dashboard` |
| `src/components/layout/Navbar.jsx` | "Labs" gated by `effectiveRole==='admin'` |
| `docs/mock/meu-dia-generic-v3.html` | the target visual mock |
| `docs/sdd/labs-dashboard-sdd.md` | **SDD — single source of truth for this migration** |

## Related Modules

- `docs/modules/pages.md` — "Dashboard Layout" (current monolith)
- `docs/modules/greeting-engine.md` — hero greeting engine (`useGreeting`)
- `docs/modules/health-score-dashboard.md` — `/health` cockpit (band + drawer pattern reference)
- `docs/modules/sync.md` — `sync_log` / `monthly-sync` (data-recency source)
- `docs/sdd/greeting_engine_sdd.md` — greeting engine spec (Phase A)
- `docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md` — ticket data for the analyst HERO
