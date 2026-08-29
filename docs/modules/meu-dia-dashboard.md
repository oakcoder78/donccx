# Module — Meu Dia / Dashboard v3

> **Status: in transition — Phase 1 shipped (2026-08-29).** `/dashboard` still serves the monolithic
> `DashboardPage.jsx` for everyone by default; **admins** see the v3 shell (`MeuDiaV3Page` — 7
> placeholder blocks, no real data yet) when the transitional `dashboard_v3` flag is on (currently
> ON for `{admin}`). `/labs/dashboard` = monolith under `AdminOnlyRoute`. The real blocks land in
> Phase 3. This document describes the **target** architecture; the single source of truth for the
> migration — phases, checklists, data contracts, decisions — is `docs/sdd/labs-dashboard-sdd.md`.
> Update that SDD first; keep this module doc in sync at phase boundaries.
>
> **Live files (Phase 1):** `src/pages/DashboardRoute.jsx` (transitional wrapper), `src/pages/MeuDiaV3Page.jsx`
> (shell), `src/App.jsx` `AdminOnlyRoute`, `src/pages/labs/LabsDashboardPage.jsx` (monolith wrapper).

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
| Feature flag | none | none (`labs_dashboard` retired) |
| Guard | `PrivateRoute` only; analyst carve-out so they are not bounced to `/atendimento` | `AdminOnlyRoute` (admin-strict, no manager branch) |
| Navbar | "Dashboard" — always visible (non-analyst) | "Labs" — visible only when `effectiveRole === 'admin'` |

## Page Structure (target)

```
MeuDiaV3Page (src/pages/MeuDiaV3Page.jsx)   — order: personal first
│ lifted queries (single set — gotcha A5): useDashboardClients · useActivities · useHealthConfig
│                 useProjectCockpit · useOperationalDeltas · useDashboardYtd · useSyncStatus
│                 + get_finance_summary RPC (only for admin/manager/finance)
├── DashboardHeader     — period selector · "Atualizado em DD/MM HH:mm" · carteira/CSM dropdown (admin/manager)
│  ── PERSONAL (logged-in user) ──
├── HeroBlock           — navy bg (not glassmorphism)
│   ├── GreetingHeader  — 3 lines: useGreeting().text · date + useGreeting().extra · dataRefMonth
│   └── HeroCards       — per-role contract {label,value,sub,delta,variant} × 3 (see "HERO by role")
├── MinhaAgendaBlock    — activities atrasada > hoje > futura, cap 5; row → ActivityDetailModal;
│                         "Nova atividade" → ActivityModal (hidden for finance)
│  ── MINHA CARTEIRA (portfolio-scoped via labsFilterFor; <ScopeLabel>) ──
├── SaudeDimensaoBlock  — real stacked distribution per dimension, worst-first; at-risk names inline;
│                         bar/row → <Drawer> + <ClientHealthDrawer>
├── ProjetosAbertosBlock — useProjectCockpit() summary; row → /projetos/:id; "ver todos" → /projetos-cockpit
│  ── TODA A BASE (company-wide, identical for all 6 roles; <ScopeLabel>) ──
├── ForcaNumerosBlock   — YTD: Clientes · OS criadas (ano) · Profissionais pico · Média health (static)
├── EcossistemaMapBlock — <BrazilMap onSelectUF={uf => navigate('/empresas?estado='+uf)}/> + "Top estados" chips
└── OperacionalVariacaoBlock — 3 panels top-5 (OS/Profissionais/Health); row → OperationalHistoryDrawer;
                             sync panel + op-sync drawer → admin/manager only
```

Every block owns its loading (shimmer), empty (copy + CTA) and error (retry) state — a single failing
source must not blank the page. **Section order is personal-first** (the mock buried the agenda at
scroll depth 4 behind a decorative map — the UX critique flagged this).

## HERO by role (`HeroCards` `roleMap`)

| `effectiveRole` | Card 1 | Card 2 | Card 3 |
|---|---|---|---|
| `csm` / `sales` / `manager` | Clientes (scoped count) | Ordens de Serviço (Δ vs 90-day avg) | Profissionais Ativos (Δ vs 90-day avg) |
| `finance` | MRR · month (+ YTD) | Clientes em atraso (R$) | Renovação em 30D |
| `analyst` | Total Tickets | Tickets em Aberto | Taxa Resolução |
| `admin` | falls back to the `sales` layout | | |

The finance cards come from `get_finance_summary()` (RPC with a `get_user_role() in
('admin','manager','finance')` check) — **not** from the clients query, which is masked. See SDD §4.4
and gotcha A3.

## Data Flow

```
useAuth ──► profile, effectiveRole
useDashboardClients(profile)  ──► clients in scope   (labsFilterFor: admin/manager/finance=all,
                                                      sales=comercial_id, csm=csm_id; +lifecycle_stage='cliente')
useActivities(scopedFilter)   ──► my agenda           (responsible_id for non-manager; no participant model)
useHealthConfig()             ──► thresholds          (threshold_healthy/attention — never hardcode 75/50)
useProjectCockpit()           ──► open projects       (shared queryKey ['projects_cockpit'])
useOperationalDeltas()        ──► month deltas         (extracted from monolith FAIXA 4)
useDashboardYtd()             ──► RPC get_dashboard_ytd
useSyncStatus()               ──► dataRefMonth line    (sync_log has no ref_month → derive prevMonth(started_at))
get_finance_summary()  (RPC)  ──► finance HERO         (only when effectiveRole ∈ {admin,manager,finance})
```

## Reused building blocks

| Asset | File | Role in v3 |
|---|---|---|
| `C`, `HEALTH_ICONS`, `scoreBand*`, `getSignals`, `buildReasons`, `daysSince`, `tempVencida` | `src/lib/scoring.js` | tokens + bands + signals — **import, never copy** |
| `BrazilMap` | `src/components/dashboard/BrazilMap.jsx` | ecosystem map — was orphan; made interactive (`onSelectUF`) + pin legend |
| `ClientHealthDrawer` | `src/components/clients/ClientHealthDrawer.jsx` | the v3 client drawer content (extended with the monolith's `qaItems`); self-contained |
| `Drawer` (new) | `src/components/ui/Drawer.jsx` | shared right-side drawer shell — extracted from Health + monolith copies; `/health` migrates to it |
| `ActivityDetailModal` / `ActivityModal` | `src/components/activities/` | agenda row → detail → edit/create |
| `labsFilterFor` | `src/hooks/useLabsClients.js` | per-role client scoping (also used by `SaudeDimensaoBlock` / `ProjetosAbertosBlock`) |
| FAIXA 4 logic (`ops_dashboard` query, `buildOpCountRows`, `OpDeltaBadge`, `opHealthAll`) | `src/components/dashboard/DashboardPage.jsx` | extract into `useOperationalDeltas` |
| `useGreeting` | `src/lib/greeting-engine` | hero lines 1–2 (line 3 is page-computed) |
| `useProjectCockpit` | `src/hooks/useProjectCockpit.js` | open-projects block |
| `useSyncStatus` | `src/hooks/useSyncStatus.js` | data-recency line |

## Score bands

`scoreBand(score, thresholds)` from `src/lib/scoring.js`, `thresholds` from `useHealthConfig().config`
(default healthy ≥ 75, attention ≥ 50, alert < 50 — configurable in `/configuracoes` → Health).

## Interações & gating

The mock is static; the interactive layer is specified from the monolith. Full inventory + per-role
matrix in **SDD §5 "Interactive Surface & Permissions"**. Summary:

| Block | Scope | Interaction | Gating |
|---|---|---|---|
| HERO cards | user | navigate if destination accessible (else static) | MRR card ← `get_finance_summary` (admin/manager/finance); tickets card → `/atendimento` |
| Minha agenda | user | row → `ActivityDetailModal`; "Nova atividade" → `ActivityModal` | create/edit/concluir: all **except finance** (RLS read-only — hide CTAs) |
| Saúde por dimensão | carteira | bar/row → `<Drawer>` + `<ClientHealthDrawer>`; header → `/health` | `labsFilterFor` scope |
| Projetos em aberto | carteira | row → `/projetos/:id`; "ver todos" → `/projetos-cockpit` | `isEnabled('projects_cockpit', effectiveRole)` |
| Nossa força em Números | toda a base | static | none |
| Mapa vivo | toda a base | UF/pin → `/empresas?estado=UF` | destination list RLS-scoped |
| Operacional variação | toda a base | row → `OperationalHistoryDrawer`; SeeAll → `op-*-list` drawer → `/empresas/:id` | **sync panel + `op-sync` + "sincronizar" → admin/manager only** (RLS `client_donc_instances`) |
| "Ver como" | — | `setImpersonation` + reload | admin only |

**Transversal rule:** gate on `effectiveRole` (from `useAuth`/`usePermissions`), never `profile.role`.
A nav target is an active link only if the role has access (RLS or feature flag) — else it renders
static. A mutation the RLS blocks → hide the CTA, don't let it toast-fail.

**RLS write constraint:** csm/sales are read-only on `activities` today. SDD Phase 2 adds
`activities_csm_sales_write` (INSERT/UPDATE for own carteira). finance stays read-only.

## Known constraints / divergences

- **MRR masking (gotcha A3):** `useClients` / `CLIENT_SELECT = *` currently leaks `mrr`, `billing_*`,
  `delay_days`, `contract_renewal` to any role. With `/dashboard` global, the finance HERO must read a
  DB-side masked source (`get_finance_summary` RPC or `clients_dashboard_view`). Blocks the finance HERO.
- **No YTD / 90-day-average aggregation exists** — created in SDD Phase 2 (`get_dashboard_ytd`,
  `get_operational_90d_avg`).
- **`activities` write is RLS role-gated** — csm/sales are read-only today; SDD Phase 2 adds a write
  policy for their own carteira. finance stays read-only (hide write CTAs).
- **`client_donc_instances` is admin/manager-only** — the "Sincronização de dados" panel + `op-sync`
  drawer + "sincronizar" button do not render for other roles.
- **WCAG 2.1 AA is a Phase 3 completion gate** — the mock fails on label contrast (~1.5:1), missing
  `<main>`, ARIA-less "Ver como" dropdown, 200% zoom, color-only deltas. See SDD Phase 3 checklist.
- **No participant model for activities** — `MinhaAgendaBlock` uses `responsible_id` only; the mock's
  "participante" label maps to that.
- **`BrazilMap` fetches GeoJSON from `raw.githubusercontent.com`** — external URL; degrades to the
  top-states list on fetch failure (never a blank box).
- **Section order is personal-first, not the mock's order** — HERO → agenda → saúde → projetos →
  força → mapa → operacional. Every block carries a `ScopeLabel` ("minha carteira" / "toda a base").
- **greeting-engine is in Phase A (no expansion)** — the 3rd hero line is computed in the page from
  sync status, never in the engine. `sales`/`finance` identity pools are content-only additions.
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
| `src/pages/MeuDiaV3Page.jsx` | v3 page (to create) — lifted queries + personal-first block layout |
| `src/components/dashboard/v3/*` | `DashboardHeader`, `ScopeLabel`, `HeroBlock`, `MinhaAgendaBlock`, `SaudeDimensaoBlock`, `ProjetosAbertosBlock`, `ForcaNumerosBlock`, `EcossistemaMapBlock`, `OperacionalVariacaoBlock`, `OperationalHistoryDrawer` |
| `src/components/ui/Drawer.jsx` | shared right-side drawer shell (to create); `/health` migrates to it |
| `src/components/clients/ClientHealthDrawer.jsx` | v3 client drawer content — extend with `qaItems` |
| `src/components/dashboard/DashboardPage.jsx` | monolith — moves to `/labs/dashboard` (admin only) |
| `src/components/dashboard/BrazilMap.jsx` | ecosystem map — add `onSelectUF` + pin legend + fetch-fail degrade |
| `src/hooks/useDashboardClients.js` / `useDashboardYtd.js` / `useOperationalDeltas.js` | data hooks (to create) |
| `src/hooks/useLabsClients.js` | `labsFilterFor` scoping helper (exists) |
| `src/lib/scoring.js` | tokens + helpers (exists) |
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
