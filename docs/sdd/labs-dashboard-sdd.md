# SDD — Labs Dashboard (`/labs/dashboard`)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the Labs Dashboard workstream — the evolution of the current monolithic `DashboardPage.jsx` (1761 lines, CSM-coupled) into an isolated architecture under `/labs/dashboard` with a generic **"Meu Dia"** dashboard plus role-based **Cockpits** (CSM, Gestão, Comercial, Financeiro, Suporte, Projetos) and dual ownership `clients.comercial_id + csm_id` with `lifecycle_stage`. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully — understand the spec, current checkpoint, design system references, and data contracts.
2. **During implementation:** Follow the checklist for the active phase. Tick items as done.
3. **After implementation:** Fill the Implementation Log at the bottom of the phase with commit hash, files changed, and technical summary. Update the Checkpoint section.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main` (worktree disabled — all work goes directly to main)
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** Phase 0 — Complete (shell live, admin only). Next: Phase 1 Meu Dia — Planned.

**What already exists related to this work:**

- `src/components/dashboard/DashboardPage.jsx` — 1761 lines, monolithic, CSM-centric. Contains: greeting engine, critical clients, health ranking, signals (`getSignals`), urgency scoring, operational deltas (`client_usage` prevMonth vs prevMonth2), sync-panel, drawer system (4 drawer modes), MRR cards, activities, onboarding phases. Route `/dashboard`. Uses local color tokens `C`, local helpers `scoreBand*`, `DIM_ICONS` with inline SVGs `Ic.*`, `evaluateClientRules` (broken — `health_rules` has no condition columns, later replaced by `getDimensionInsights` in Health Dashboard). Source of truth for visual tokens and drawer pattern.
- `src/pages/HealthDashboardPage.jsx` (~365 lines) — `GET /health`, scorecard + ranking table + drawer `ClientHealthDrawer.jsx`. Reference for isolated dashboard pattern.
- `src/pages/CockpitsPage.jsx` — gateway `/cockpits` with cards for Health Score, CS Radar, Project Cockpit, Profissionais Cockpit.
- `src/pages/CsRadarPage.jsx`, `src/pages/ProjectCockpitPage.jsx`, `src/pages/ProfissionaisCockpitPage.jsx` — existing cockpits (see `project-cockpit-sdd.md`).
- `src/App.jsx` — routing. `PrivateRoute` gates auth+`profile.status`, redirects analyst to `/atendimento` if `whatsapp_atendimento` enabled. `AdminRoute` for `/configuracoes`. `useFeatureFlags` hook controls per-role access.
- `src/hooks/useFeatureFlags.js` — `flags: feature_flags` (key, label, enabled, allowed_roles[]), `isEnabled(key, role)`.
- `src/hooks/useClients.js` — `CLIENT_SELECT` with `csm:profiles!clients_csm_id_fkey`, `buildClientsQuery` supports `csm_id`, `stage_id`, `search`, `abc_class`, `lifecycle_stage`. `useClients` filters `contract_active=true`. `useClient(id)` loads single client with `client_catalog`, `contact_links`, `activities`, `projects`, `client_usage`, `client_support`, `onboardings` + phases.
- `src/components/clients/ClientDetail.jsx` — tabs: `overview | atividades | operacional | health | contatos | anexos`. `overview` is definitive view; `operacional`/`health` disabled when `lifecycle_stage !== 'cliente'`. `ClientForm.jsx` — modal with 4 tabs: `Dados da Empresa | Contrato | Operacional | Endereço` (edits `csm_id`, `abc_class`, billing, address, etc).
- `src/contexts/AuthContext.jsx` — `profile` shape: `id, name, email, role (admin|manager|csm|analyst), status (active|pending|blocked|invited), avatar_url, created_at`.
- `src/lib/icons.js` — central barrel. Never import from `lucide-react` directly.
- `src/lib/greeting-engine` — deterministic greeting hook (`useGreeting`).
- Tables (verified in codebase/migrations):
  - `clients` — `id integer PK`, `name text`, `fantasy_name text`, `cnpj text`, `lifecycle_stage text`, `stage_id uuid`, `csm_id uuid FK profiles`, **`comercial_id uuid FK profiles ON DELETE SET NULL` (added `20260824000008`, `idx_clients_comercial_id` + `idx_clients_lc_comercial WHERE cliente`)**, `abc_class text`, `health_total/health_uso/health_suporte/health_relacionamento/health_financeiro/health_projeto integer`, `health_trend integer DEFAULT 0`, `mrr numeric`, `delay_days integer`, `csm_temperature integer`, `temperature_updated_at timestamptz`, `contract_active boolean`, `contract_signed_date/contract_start/contract_renewal date`, `correction_index text`, `billing_type/billing_base_value/billing_floor`, `unidades_total/unidades_donc`, `segment_id`, `site text`, `logo_url text`, `address_*`, `stage:stages(*)`, `client_catalog`, `created_at/updated_at`.
  - `profiles` — `id uuid`, `name text`, `email text`, `role text` (`admin|manager|csm|analyst|sales|finance` — sales/finance added 2026-08-24 via 20260824000001), `status text`, `avatar_url text`, `gender text`, `birth_date date`, `created_at timestamptz`.
  - `feature_flags` — `key text PK`, `label text`, `enabled boolean`, `allowed_roles text[]`.
  - `activities` — `id uuid`, `client_id integer`, `contact_id integer`, `responsible_id uuid FK profiles`, `type text`, `status text (pendente|concluida|cancelada)`, `activity_date date`, `due_date date`, `title text`, `description text`, `meet_link text` (migration 20260816000000), `created_at/updated_at`.
  - `contacts` — `id uuid`, `name text`, `email text`, `contact_phones(*), contact_emails(*), contact_links(*, client_id, papel, engajamento, champion)`.
  - `client_support`, `client_usage`, `client_donc_instances`, `onboardings`, `onboarding_fases`, `projects`, `milestones`, `health_rules`, `health_config` — auxiliary.
- Existing flags: `health`, `projects_cockpit`, `profissionais_cockpit` (now `{admin,manager,csm,finance}`), `cs_radar`, `whatsapp_atendimento`, `donkie`, `settings_menu`, `api_donc`, `freshdesk`, `asana`, `email_templates`, `brief_templates`, `financial_data` (`{admin,manager,finance}` true), `labs_dashboard` (`{admin}` false, branch-by-abstraction, Phase 0 live), plus `financial_data` controls MRR hide (`ClientSubDados`).
- `vite.config.js` injects `__COMMIT_HASH__`, `vercel.json` SPA rewrite, QueryClient `staleTime 30s / retry 1 / gcTime 5m`.

**What does NOT exist and needs to be created (remaining):**

- `src/components/labs/*` — extracted cards/panels (MeuDia, Cockpit cards for Phase 1+).
- Role-based tab/route gating for `ClientDetail` and `/empresas/:id` edits beyond `finance`/`sales` empresa edit (already done for `sales` comercial_id + `finance` empresas; remaining: health/operacional tab per role if needed).
- Full `labs_dashboard` product: Meu Dia generic + CockpitGrid per role (Phase 1-5).

**Already created since last update (2026-08-24):**
- Route namespace `/labs/dashboard` — `src/pages/labs/LabsDashboardPage.jsx` shell live (admin only, `labs_dashboard` flag `enabled false` `{admin}`), `src/App.jsx` route + `PrivateRoute` analyst exception, `Navbar` `Labs` link with `featureFlag:'labs_dashboard'` (`ba0ba66`).
- Feature flags `labs_dashboard` (`20260824000007`) + `financial_data` (`20260824000006`, `{admin,manager,finance}`) + `profissionais_cockpit` now includes `finance` (`20260824000005`) + `financial_data` group `Cockpits & Dashboards`.
- `clients.comercial_id` column + indexes + RLS dual ownership (`20260824000008` + `20260824000009` `comercial_id OR csm_id` for sales scoped), `src/hooks/useClients.js` `comercial` join + `comercial_id`/`_labs_dual_owner` OR, `src/hooks/useClient.js` comercial join, `ClientForm.jsx` `comercial_id` dropdown (Dados da Empresa), `ClientsPage.jsx` sales branch `comercial_id` + finance global, `src/hooks/useLabsClients.js` helper (labsFilterFor, useComercialClients).
- Central `src/lib/roles.js` (`ROLE_OPTIONS` 6 roles, English labels `Sales/Finance`) and `SettingsUsers.jsx`/`SettingsFeatureFlags.jsx` + `SettingsFeatureFlags` `FLAG_GROUPS` `Cockpits & Dashboards` + `Integrações` now includes `asana`.
- Admin backdoor `Ver como` with real RLS (`role_impersonations` table, `get_user_role()` override, `AuthContext` `effectiveRole`/`effectiveProfile`/`setImpersonation`, `Navbar` dropdown + amber banner, `App.jsx`/`usePermissions` use `effectiveRole`, 1h expiry).

### Files to be touched

| File | Change type |
|---|---|
| `supabase/migrations/<timestamp>_labs_dashboard_flag.sql` | **Create** — `INSERT feature_flags (key='labs_dashboard', ...)` — initial `allowed_roles='{admin}'`, expand progressively |
| `supabase/migrations/<timestamp>_add_comercial_id_to_clients.sql` | **Create** — `ALTER TABLE clients ADD COLUMN comercial_id uuid REFERENCES profiles(id)`, index, RLS/comment |
| `supabase/migrations/<timestamp>_rls_labs_dual_ownership.sql` | **Create** — dual-ownership RLS policies + MRR column masking view (High severity — blocks Phase 2) |
| `src/lib/scoring.js` | **Create** — centralized `C`, `DIM_*`, `scoreBand*`, `getSignals`, `buildReasons`, `daysSince`, `tempVencida` (extracted from DashboardPage, mandatory Phase 1) |
| `src/App.jsx` | Modify — add `/labs/dashboard` route (inside `PrivateRoute` + `AppLayout`), optional legacy redirect; keep `/dashboard` untouched |
| `src/pages/labs/LabsDashboardPage.jsx` | **Create** — shell page (`Meu Dia` + cockpits grid). Single entry point under `/labs` |
| `src/components/labs/MeuDiaPanel.jsx` | **Create** — generic "Meu Dia": today activities + signals + MRR summary (role-filtered) |
| `src/components/labs/CockpitGrid.jsx` | **Create** — grid of cockpit cards per role (CSM/Gestão/Comercial/Financeiro/Suporte/Projetos) |
| `src/components/labs/cockpits/CsmCockpitCard.jsx` | **Create** — portfolio health + alerts (extracted from DashboardPage `alertaClients`, `emRisco`) |
| `src/components/labs/cockpits/GestaoCockpitCard.jsx` | **Create** — aggregated KPIs (health bands, overdue phases, MRR atrasado) |
| `src/components/labs/cockpits/ComercialCockpitCard.jsx` | **Create** — comercial portfolio (clients where `comercial_id = profile.id`) + `projetos-cockpit` link |
| `src/components/labs/cockpits/FinanceiroCockpitCard.jsx` | **Create** — financeiro indicators + `profissionais-cockpit` link |
| `src/components/labs/cockpits/SuporteCockpitCard.jsx` | **Create** — support signals (`health_suporte`, tickets placeholder) |
| `src/components/labs/cockpits/ProjetosCockpitCard.jsx` | **Create** — reuse/embed `ProjectCockpitPage` summary |
| `src/hooks/useLabsClients.js` | **Create** — wrapper over Supabase with dual ownership filter (`csm_id` OR `comercial_id` + lifecycle_stage) |
| `src/hooks/useClients.js` | Modify — add `comercial_id` to `CLIENT_SELECT`, support `filters.comercial_id` in `buildClientsQuery`; keep backward compat |
| `src/hooks/useFeatureFlags.js` | No change — consumed as-is |
| `src/components/layout/Navbar.jsx` | Modify — add `/labs/dashboard` nav item gated by `labs_dashboard`; keep `/dashboard` item; `availableLinks` filtering already exists |
| `src/components/clients/ClientDetail.jsx` | Modify — tab gating + Edit button gating per role matrix (see §4.4) |
| `src/components/clients/ClientForm.jsx` | Modify — field-level gating: `csm_id`/`comercial_id` editable per role; 4 tabs accessibility per matrix |
| `src/components/contacts/ContactsPage.jsx` | Modify — ensure all roles can view/create (no role gate; verify flag not blocking) |
| `src/components/activities/ActivitiesPage.jsx` | Modify — ensure all roles can view/create; filter `responsible_id` for non-admin only when scoped, but global view allowed per spec |
| `src/lib/icons.js` | Modify — add missing icons (if any of `LayoutDashboard`, `Briefcase`, `DollarSign`, `Headset`, `FolderKanban` not present) |
| `src/lib/constants.js` | Modify — centralize color tokens `C` from DashboardPage (optional, Phase 5) |
| `docs/sdd/labs-dashboard-sdd.md` | **Create** — this file |

---

## 1. Global Definitions

### 1.1 Roles (canonical — updated 2026-08-24)

| Role | `profiles.role` | Label PT | Description |
|---|---|---|---|
| `admin` | `admin` | Admin | Full access. Sees all clients. Only role accessing `/configuracoes`. |
| `manager` | `manager` | Gestão | Sees all except `/configuracoes`. Team portfolio. |
| `csm` | `csm` | CSM | Portfolio scoped: `csm_id = profile.id`. Core CSM cockpit. |
| `sales` | `sales` | Comercial | Sales pipeline owner. Scoped by `comercial_id` (future) or `csm_id` fallback. Sees `overview/operacional/relatorios/anexos` + edit 4 tabs + `projetos-cockpit`. |
| `finance` | `finance` | Financeiro | Finance. Global view (all `lifecycle_stage='cliente'`). Sees edit 4 tabs + `profissionais-cockpit` + MRR/billing. |
| `analyst` | `analyst` | Atendimento | Atendimento only (`/atendimento` when `whatsapp_atendimento` enabled). Limited labs access. |

> **Nota arquitetural (2026-08-24):** migrations `20260824000001_add_sales_finance_roles.sql` + `20260824000002_rls_sales_finance.sql` adicionaram `sales`/`finance` ao `CHECK profiles_role_check`. RLS `clients_sales_select` (scoped `csm_id`, future `comercial_id`) e `clients_finance_select` (global) já em produção. Flag `labs_dashboard` deve incluir `sales`/`finance` em `allowed_roles`. "Suporte" permanece alias funcional sobre `analyst`/`csm`.

### 1.2 Lifecycle Stage

| Value | Meaning | Visible in |
|---|---|---|
| `lead` | Lead not yet client | `/empresas` only (not in cockpits) |
| `cliente` | Active client | Labs dashboard, cockpits, `operacional`/`health` tabs |
| `ex_cliente` | Churned | Filtered out unless `useAllClients` |

Filter `lifecycle_stage = 'cliente'` is mandatory for all labs queries (same as `DashboardPage.jsx:330` and `HealthDashboardPage.jsx:107`).

### 1.3 Feature Flag

| Key | Label | `enabled` default | `allowed_roles` |
|---|---|---|---|
| `labs_dashboard` | Labs Dashboard | `false` (enable per env) | `'{admin,manager,csm,sales,finance,analyst}'` — all 6 roles (see Gotchas A1) |

Hook usage:
```js
const { isEnabled } = useFeatureFlags()
const canView = isEnabled('labs_dashboard', profile?.role)
```

> Durante a transição `/dashboard` e `/labs/dashboard` coexistem. A flag controla visibilidade da nova rota na Navbar e acesso direto (redirect to `/dashboard` if not enabled, same as `HealthDashboardPage` pattern).

### 1.4 Color Tokens (canonical from `DashboardPage.jsx` object `C`)

| Token | Hex | Usage |
|---|---|---|
| `C.navy` | `#173557` | Headers, primary button |
| `C.sky` | `#59c2ed` | Uso dimension, links |
| `C.lime` | `#d3da47` | Projeto dimension |
| `C.dimUso` | `#59c2ed` | Uso |
| `C.dimSuporte` | `#b46cd1` | Suporte |
| `C.dimRel` | `#d98b28` | Relacionamento |
| `C.dimFin` | `#2f9e70` | Financeiro |
| `C.dimProj` | `#d3da47` | Projeto |
| `C.red` | `#d64545` | Alerta, band red |
| `C.amber` | `#d98b28` | Atenção, band amber |
| `C.green` | `#2f9e70` | Saudável, band green |
| `C.line` | `rgba(15,34,58,0.09)` | Borders |
| `C.ink` | `#0e223a` | Primary text |

Score bands: `≥75 green | 50-74 amber | <50 red` (reuse `scoreBand`, `scoreBandColor`, `scoreBandLabel` — redefine locally, do not import from DashboardPage).

### 1.5 Health Dimensions (DIMS)

| Key (clients column) | Label | Color | Icon |
|---|---|---|---|
| `health_uso` | Uso | `C.dimUso` | `Icons.BarChart3` |
| `health_suporte` | Suporte | `C.dimSuporte` | `Icons.Target` |
| `health_relacionamento` | Relacionamento | `C.dimRel` | `Icons.Handshake` |
| `health_financeiro` | Financeiro | `C.dimFin` | `Icons.Wallet` |
| `health_projeto` | Projeto | `C.dimProj` | `Icons.Rocket` |

Icon map recreate locally:
```js
const DIM_ICONS = {
  health_uso: Icons.BarChart3,
  health_suporte: Icons.Target,
  health_relacionamento: Icons.Handshake,
  health_financeiro: Icons.Wallet,
  health_projeto: Icons.Rocket,
}
```

---

## 2. Design System Reference

> **Rule:** Before implementing, open the reference files below. Do not invent new patterns. Search the codebase before creating a component.

### 2.1 Core Components

| Component | File | Props |
|---|---|---|
| `Button` | `src/components/ui/Button.jsx` | `variant` (primary/secondary/green/danger), `size` (sm/md) |
| `Badge` | `src/components/ui/Badge.jsx` | `variant` (green/amber/red/sky/slate) |
| `PageHeader` | `src/components/ui/PageHeader.jsx` | `title`, `subtitle`, `action` |
| `PageSpinner` | `src/components/ui/Spinner.jsx` | full-page loading |
| `StagePill` | `src/components/ui/StagePill.jsx` | `name`, `color` |
| `HealthScore` | `src/components/ui/HealthBar.jsx` | `score` |
| `Icons` | `src/lib/icons.js` | Never import from `lucide-react` directly |

### 2.2 Reference Files for This Feature

| File | What to reuse as template |
|---|---|
| `src/components/dashboard/DashboardPage.jsx` | Color tokens `C`, helpers `scoreBand*`, `getSignals`, `alertaClients` urgency, `Panel`/`PanelHead`/`StripHead`/`SeeAll` patterns, drawer overlay pattern (`paddingRight` shift + fixed aside). **Do not import helpers — copy locally.** Replace inline `Ic.*` SVGs with `Icons.*`. |
| `src/pages/HealthDashboardPage.jsx` | Isolated dashboard pattern: `useClients` + filters + scorecard + table + drawer + feature-flag guard. |
| `src/pages/CockpitsPage.jsx` | Gateway card pattern for cockpits hub (simple grid of cards → routes). |
| `src/pages/ProjectCockpitPage.jsx` / `ProfissionaisCockpitPage.jsx` | Cockpit page patterns (filters, summary bar, expandable rows). Reuse `PhaseCircle`/`Connector` compact version if timeline needed. |
| `src/hooks/useClients.js` | Query pattern with `buildClientsQuery` + role scoping. |
| `src/components/clients/tabs/ClientTabOverview.jsx` | Overview enrichment pattern (trend Δ, signals, quick actions, dimension accordion). |
| `src/components/clients/ClientSubProjetos.jsx` | Expandable row pattern (`Set<id>` for expanded state). |

### 2.3 Panel Pattern (from DashboardPage.jsx)

```jsx
function Panel({ children, style }) {
  return (
    <div style={{
      background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 16,
      padding: '18px 20px 14px', display: 'flex', flexDirection: 'column', height: '100%',
      boxSizing: 'border-box', ...style,
    }}>{children}</div>
  )
}
```

Grid: use Tailwind `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` for cockpit cards; avoid new CSS files.

### 2.4 Layout & Spacing Tokens

| Token | Tailwind | Usage |
|---|---|---|
| `bg-bg-primary` | `bg-bg-primary` | Cards, panels |
| `bg-bg-secondary` | `bg-bg-secondary` | Page background |
| `border-border-tertiary` | `border-border-tertiary` | Borders |
| `text-text-primary` | `text-text-primary` | Titles |
| `text-text-secondary` | `text-text-secondary` | Labels |
| `text-text-tertiary` | `text-text-tertiary` | Hints |

---

## 3. Component Tree — `/labs/dashboard`

```
LabsDashboardPage (src/pages/labs/LabsDashboardPage.jsx)  route: /labs/dashboard — Genérica 5 blocks (Phase 1)
├── PageHeader  title="Meu Dia"  subtitle="{dateStr} · {greeting} · {effectiveRole}"
└── MeuDiaPanel (src/components/labs/MeuDiaPanel.jsx) — 5 blocks max, generic, no per-role cockpits
    ├── Block 1 Header (greeting + date pt-BR)
    ├── Block 2 Minhas próximas 48h (overdue + 48h, responsible_id=own where I participated → ActivityRow)
    ├── Block 3 Saúde agregada (avg + bandas via health_config thresholds, minha carteira labsFilterFor, DIM strip)
    ├── Block 4 Sinais agregado (getSignals chips: Sem interação/Temp vencida/Atividade atrasada)
    └── Block 5 Atalhos estáticos (Empresas/Atividades/Contatos) + Feed 5 Minhas atividades recentes onde participei
   // CockpitGrid + 6 *CockpitCard deferred to Phase 3+ (per-role), Drawer deferred to Phase 3
```

> **Project pattern:** DashboardPage builds divs inline with `style`. Follow same for MeuDiaPanel/CockpitCards — do not create new generic KpiCard abstractions unless justified. Reuse `Panel`/`PanelHead` locally.

### Page States

| State | What to show |
|---|---|
| **Loading** | Shimmer skeleton: 1 MeuDia skeleton + 6 cockpit card skeletons |
| **Empty** | "Nenhum dado para hoje" + CTA to register activity |
| **Error** | "Erro ao carregar dashboard" + retry button |
| **Data** | MeuDia + visible cockpits (role-filtered) |

### 3.1 State Management

- TanStack Query: `useClients(labsFilter)` with key `['clients', labsFilter]`, `useActivities`, `useProfiles`, `useHealthConfig`, `useProjectCockpit`.
- `staleTime: 30s`, `retry: 1`, `gcTime: 5m` (same as App.jsx defaults).
- Local UI state: `selectedCsm` (admin/manager), `expandedCockpit` (accordion one-at-a-time, optional).
- No URL params for filters in Phase 0-1 (state local); deep links to `/empresas/:id?tab=X` preserved.

---

## 4. Data Contracts

### 4.1 Clients — dual ownership

**Migration (Phase 2):**
```sql
-- supabase/migrations/<ts>_add_comercial_id_to_clients.sql
ALTER TABLE clients ADD COLUMN comercial_id uuid REFERENCES profiles(id);
CREATE INDEX idx_clients_comercial_id ON clients(comercial_id);
COMMENT ON COLUMN clients.comercial_id IS 'Commercial owner (separate from csm_id). Labs dashboard dual ownership.';
-- Optional backfill: leave NULL initially (commercial portfolio built incrementally)
```

**Query contract (src/hooks/useLabsClients.js):**
```js
import { useClients } from './useClients'

export function labsFilterFor(profile) {
  if (!profile) return {}
  const isAdminOrManager = profile.role === 'admin' || profile.role === 'manager'
  if (isAdminOrManager) return { lifecycle_stage: 'cliente' } // sees all
  // csm/comercial: sees where either csm_id or comercial_id matches
  // Supabase OR not supported via buildClientsQuery helper; do two queries + merge or use .or()
  return { lifecycle_stage: 'cliente', _labs_dual_owner: profile.id }
}
// Implementation: buildClientsQuery with .or(`csm_id.eq.${id},comercial_id.eq.${id}`)
// Use useClients(labsFilter, {enabled: !!profile}) for reading.
// For comercial view specifically: { comercial_id: profile.id, lifecycle_stage: 'cliente' }
// For CSM view specifically: { csm_id: profile.id, lifecycle_stage: 'cliente' }
```

**Fields used (all exist except `comercial_id`):**

| Field | Type | Source | Note |
|---|---|---|---|
| `id` | integer | clients | PK |
| `name` | text | clients | Fallback display |
| `fantasy_name` | text | clients | Preferred display |
| `lifecycle_stage` | text | clients | `cliente` filter mandatory |
| `csm_id` | uuid | clients | FK profiles(id) — existing |
| `comercial_id` | uuid | clients | FK profiles(id) — **NEW, nullable** |
| `abc_class` | text | clients | A/B/C |
| `stage_id` | uuid | clients | FK stages |
| `stage` | object | join stages(*) | For pill |
| `health_total` | integer | clients | 0-100 |
| `health_uso/suporte/relacionamento/financeiro/projeto` | integer | clients | 0-20 each |
| `health_trend` | integer | clients | DEFAULT 0 |
| `mrr` | numeric | clients | For financeiro |
| `delay_days` | integer | clients | For signals |
| `csm_temperature` | integer | clients | -7/-3/0/3 |
| `temperature_updated_at` | timestamptz | clients | For `tempVencida` |
| `contract_active` | boolean | clients | |
| `contract_renewal` | date | clients | renovacao30 |
| `segment_id` | uuid | clients | |
| `logo_url` | text | clients | |
| `csm` | object | join profiles!clients_csm_id_fkey | `{id,name,email}` |
| `comercial` | object | join profiles (new FK) | `{id,name,email}` — add to CLIENT_SELECT |

> **RLS verification needed before Phase 2 merge:** confirm `clients` RLS policies allow reading `comercial_id` for all authenticated. If not, add policy. See `supabase/migrations/20260625200000_security_phase1_rls.sql`.

### 4.2 Profiles / Roles

| Field | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | |
| `email` | text | |
| `role` | text | `admin|manager|csm|analyst` |
| `status` | text | `active|pending|blocked|invited` |
| `avatar_url` | text | |

Used via `useProfiles()` for CSM/Comercial dropdowns. Filter `p.role === 'csm' || p.role === 'manager'` for selectors.

### 4.3 Feature Flags

| Field | Type | Note |
|---|---|---|
| `key` | text | `labs_dashboard` |
| `label` | text | Labs Dashboard |
| `enabled` | boolean | default false |
| `allowed_roles` | text[] | `'{admin,manager,csm,analyst}'` |

Migration:
```sql
INSERT INTO feature_flags (key, label, enabled, allowed_roles)
VALUES ('labs_dashboard', 'Labs Dashboard', false, '{admin,manager,csm,analyst}')
ON CONFLICT (key) DO NOTHING;
```

### 4.4 Role → Capability Matrix (validated decisions)

| Capability | Admin | Manager (Gestão) | Comercial | Financeiro | Suporte | Analyst (Atendimento) |
|---|---|---|---|---|---|---|
| View `/labs/dashboard` + "Meu Dia" | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (flag-gated) |
| View all cockpit cards | ✅ | ✅ | subset | subset | subset | Atendimento only |
| **Empresas tabs** overview | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Empresas tabs** operacional | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Empresas tabs** relatorios | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Empresas tabs** anexos | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Empresas tabs** atividades | ✅ | ✅ | ✅* | ✅* | ✅* | via /atendimento |
| **Empresas tabs** contatos | ✅ | ✅ | ✅* | ✅* | ✅* | via contatos |
| **Empresas tabs** health | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Edit** 4 abas (Dados/Contrato/Operacional/Endereço) | ✅ | ✅ | ✅ (own portfolio: `comercial_id`) | ✅ (full 4 abas) | ❌ | ❌ |
| `/projetos-cockpit` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/profissionais-cockpit` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `contatos` create/view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `atividades` create/view (own) | ✅ (all) | ✅ (all) | ✅ (own `responsible_id`) | ✅ (own) | ✅ (own) | ✅ (own) |
| `/configuracoes` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ClientDetail gating** per tab | — | ver tudo exceto config | overview/operacional/relatorios/anexos editable | editar 4 abas | analyst: Atendimento | manager vê tudo exceto config |

* "Todos os roles podem ver/criar contatos e suas atividades" — contacts open; activities filtered by `responsible_id` for listing but creation allowed; no role blocks contacts.

**ClientDetail enforcement (ClientDetail.jsx):**
```js
const ROLE_TABS = {
  admin:      ['overview','atividades','operacional','health','contatos','anexos'],
  manager:    ['overview','atividades','operacional','health','contatos','anexos'],
  comercial:  ['overview','operacional','anexos'], // + atividades/contatos via global tabs, relatorios is subtab
  financeiro: ['overview','atividades','operacional','health','contatos','anexos'], // edit 4 abas only
  suporte:    ['overview','atividades','contatos','anexos'],
  analyst:    ['overview','atividades','contatos'], // but routed to /atendimento
}
function canEditForm(profile, client) {
  if (profile.role === 'admin' || profile.role === 'manager') return true
  if (profile.role === 'csm') return client.comercial_id === profile.id || client.csm_id === profile.id
  return false // analyst never
}
```

### 4.5 Activities Query

Reuse `useActivities`:
```js
const { data: myTasksRaw = [] } = useActivities(
  profile?.role === 'admin' || profile?.role === 'manager'
    ? { excludeStatuses: ['concluida','cancelada'] }
    : { responsible_id: profile?.id, excludeStatuses: ['concluida','cancelada'] },
  { enabled: !!profile }
)
```
Labs "Meu Dia" uses scoped view (own activities) for CSM/Comercial/Financeiro/Suporte; Gestão/Admin sees team/all.

Fields: same as `useActivities` select (client, contact, responsible, activity_attachments flag). `activity_date`, `due_date`, `type`, `status`.

### 4.6 Contacts Query

Reuse `useContacts`:
```js
const { data: contacts = [] } = useContacts({ client_id: clientIdOptional })
// No role filter — all roles can view/create.
```
Tables: `contacts`, `contact_links(papel, engajamento, champion, client_id)`, `contact_phones`, `contact_emails`.

### 4.7 Navigation

| From | To | Guard |
|---|---|---|
| Navbar `/labs/dashboard` | `LabsDashboardPage` | `isEnabled('labs_dashboard', role)` else redirect to `/dashboard` |
| CockpitCard CTA | `/health`, `/cs-radar`, `/projetos-cockpit`, `/profissionais-cockpit`, `/empresas/:id?tab=X` | Existing cockpit flags |
| Row click in cockpits | `/empresas/:id` (overview) or drawer | — |
| Legacy `/dashboard` | Remains accessible (no redirect). Phase 6 deprecates after labs stable. |

---

## 5. Implementation Phases

### Phase 0 — Foundation: Namespace + Flag + Shell Route

**Status:** Complete — 2026-08-24 (`ba0ba66`)

**Rationale:** Isolar o novo trabalho num namespace `/labs/dashboard` evita regressão no `/dashboard` que ainda está em produção e tem múltiplos consumers (CSM, gestão, financeiro). A flag `labs_dashboard` permite desenvolver em `main` com deploy contínuo sem expor a feature antes de estar pronta. Técnica de branch-by-abstraction: nova rota coexiste com a antiga até Phase 6. Implementado com `commercial_id` já live, permitindo sales ter carteira real antes de Meu Dia.

**Scope:**
- Migration da flag `labs_dashboard`
- Criação da rota `/labs/dashboard` com shell vazio (PageHeader + "Em construção" + guard)
- Navbar item condicional via `availableLinks`
- Estrutura de pastas `src/pages/labs/` + `src/components/labs/`

#### Checklist

- [x] **Create `supabase/migrations/20260824000007_labs_dashboard_flag.sql`**
  - [x] `INSERT INTO feature_flags (key, label, enabled, allowed_roles) VALUES ('labs_dashboard','Labs Dashboard — Meu Dia + Cockpits isolados', false, ARRAY['admin','manager','csm','sales','finance','analyst']) ON CONFLICT DO NOTHING` then `20260824000010_labs_dashboard_admin_only.sql` restricted to `{admin}` for Phase 0
  - [x] Deploy: `supabase db push --include-all` (verified `labs_dashboard` enabled false, allowed_roles admin only at start)
- [x] **Create `src/pages/labs/LabsDashboardPage.jsx`**
  - [ ] Functional component with feature-flag guard (redirect to `/dashboard` if `!isEnabled('labs_dashboard', profile.role)`)
  - [ ] Loading state: `PageSpinner`
  - [ ] Empty shell: `PageHeader title="Labs · Dashboard" subtitle="Em construção"` + placeholder text
  - [ ] `C` tokens defined locally (copy relevant subset from `DashboardPage.jsx`)
  - [ ] Uses `Icons.*` (no inline SVGs)
- [x] **Modify `src/App.jsx`**
  - [x] Import `LabsDashboardPage`
  - [x] Add `<Route path="/labs/dashboard" element={<LabsDashboardPage />} />` inside `PrivateRoute > AppLayout` (adjacent to `/dashboard`, not inside `AdminRoute`)
- [x] **Modify `src/components/layout/Navbar.jsx`**
  - [x] Add `{ to: '/labs/dashboard', label: 'Labs', featureFlag: 'labs_dashboard' }` to `mainNavLinks` (or `...availableLinks` pattern — verify existing `featureFlag` filtering already handles it; if `mainNavLinks` lacks `featureFlag` support, wire `isEnabled` filter like health's pattern)
  - [x] Ensure `labs_dashboard` item does not show for unauthorised roles
- [x] **Create folder structure** `src/components/labs/` + `src/components/labs/cockpits/` (empty, with `.gitkeep` or first file)
- [x] **Verify (partial)**
  - [x] `npm run build` with no errors
  - [x] Manual: admin sees `/labs/dashboard` route; analyst/csm without flag cannot access (redirect)
  - [ ] Navbar shows/hides correctly per role

#### Implementation Log (Phase 0)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-08-24 | `644e690` | `supabase/migrations/20260824000007_labs_dashboard_flag.sql` | `labs_dashboard` flag `enabled false {admin,manager,csm,sales,finance,analyst}` |
| 2026-08-24 | `74523d0` | `supabase/migrations/20260824000008_add_comercial_id.sql` + `20260824000009_rls_comercial_dual.sql` + `20260824000010_labs_dashboard_admin_only.sql` | `comercial_id` column + RLS dual ownership + labs flag restricted to `{admin}` |
| 2026-08-24 | `ba0ba66` | `src/pages/labs/LabsDashboardPage.jsx` (created), `src/App.jsx`, `src/components/layout/Navbar.jsx` | Labs shell Phase 0 complete, branch-by-abstraction, PrivateRoute analyst exception, admin only |

---

### Phase 1 — "Meu Dia" (Generic Dashboard — 5 blocks, truly generic, no MRR/OS)

**Status:** In progress — focus only on generic per stakeholder (per-role cockpits deferred to Phase 3+)

**Rationale:** `Dashboard` atual tem todas as regras de negócio corretas (thresholds `±35%` via `health_config` `75/50` com `useHealthConfig`, `getSignals`, `daysSince`, `tempVencida`) e funciona. `labs/dashboard` não deve recriar regras, só **reusar e repartir**: primeiro uma `Genérica` que atende qualquer perfil com o que é de uso comum, depois cada papel ganha sua dash com o que é indispensável para seu trabalho. Genérica é `Minhas atividades 48h` (own, onde participei) + `Saúde agregada` da minha carteira + `Sinais agregado` + `Atalhos estáticos` + `Feed recente` — sem `MRR` (fica em `financial_data` + cockpit `finance/manager` global) e sem `OS vs avg90` (operacional vai para cockpits por papel). Valida extração de `src/lib/scoring.js` sem fork.

**Scope — Genérica only:**
- `MeuDiaPanel.jsx`: 5 blocks max, `Header` + `Minhas próximas 48h` (own) + `Saúde agregada` (minha carteira `labsFilterFor(profile)`, `scoreBand` via `health_config`) + `Sinais` (3-4 chips `Sem interação/Temp vencida/Atividade atrasada`) + `Atalhos estáticos (Empresas/Atividades/Contatos) + Feed 5` (minhas atividades recentes onde participei)
- Reusar `getSignals`, `scoreBand*` (`thresholds` param via `health_config`, não hardcode `35%`), `daysSince`, `tempVencida` via `src/lib/scoring.js` centralizado (mandatory)
- Single lifted `useLabsClients(profile)` + `useActivities({responsible_id: own})` + `useHealthConfig` + `lastActivityMap`; `labsFilterFor` scoped (`sales comercial_id`, `csm` csm_id, `finance/manager/admin` global mas genérica usa scoped own para atividades)

#### Checklist (Active — Genérica only)

- [ ] **Create `src/lib/scoring.js` (mandatory — blocks fork)**
  - [ ] Extract `C` subset, `DIMS` (`health_uso` `#59c2ed` etc), `scoreBand/Color/Label` with `thresholds` param (from `useHealthConfig` `75/50`, not hardcode), `getSignals`, `buildReasons`, `daysSince`, `tempVencida`, `fmtDate`, `ago30Str` as pure fns. Add `no-restricted-imports` guard.
- [ ] **Create `src/components/labs/MeuDiaPanel.jsx` (5 blocks max, generic)**
  - [ ] Props: `{clients, healthConfig, activities, lastActivityMap}` from lifted queries (no internal `useClients` duplication)
  - [ ] Block 1 Header: `Meu Dia · {dateStr pt-BR} · {greeting}` + `effectiveRole` badge via `useAuth` + `useGreeting`
  - [ ] Block 2 Minhas próximas 48h: `overdue + next 48h` where `responsible_id=own` (avaliar `participants` vs `responsible_id` — manager pode ver vazio, ok para genérica; own é correto per spec "só faz sentido ver as que eu fiz parte")
  - [ ] Block 3 Saúde agregada: `avg health_total + bandas Saudáveis/Atenção/Alerta` da **minha carteira** (`labsFilterFor`), `C.dim*` strip, no MRR, no CSM filter, thresholds from `health_config`
  - [ ] Block 4 Sinais: aggregated chips count via `getSignals` memo (no lista completa por cliente → Phase 2 drawer)
  - [ ] Block 5 Atalhos estáticos `Empresas/Atividades/Contatos` (no per-role cockpit links) + Feed 5 `Minhas atividades recentes onde participei` (`activity_date desc`)
  - [ ] States: loading skeleton 3 rows shimmer, empty "Sem atividades onde participei" + CTA `→ Atividades`, error retry; Icons only `Icons.*`; no `DashboardPage` import
- [ ] **Modify `src/pages/labs/LabsDashboardPage.jsx` (lifted queries)**
  - [ ] Single `useLabsClients(profile)` + `useActivities({responsible_id: own})` + `useHealthConfig()` + `lastActivityMap` lifted, `dateStr` memo, render `<MeuDiaPanel />`, handle loading/error/empty delegation; no `CockpitGrid` import in Phase 1
- [ ] **Create `docs/mock/meu-dia-generic.html` (HTML Tailwind static)**
  - [ ] Mock estático desktop 1280px com dados mock, `C` tokens, `Icons.*` placeholders, states loading/empty/error
- [ ] **Build:** `npm run build` with no errors
- [x] **Verify (partial)**
  - [ ] `/labs/dashboard` shows MeuDia com atividades own (sales vê só own, finance/manager também own na genérica) e saúde da própria carteira, sem MRR/OS
  - [ ] `isEnabled('financial_data')` não afeta genérica (MRR escondido)
  - [ ] No N+1 (single `clients` query lifted)

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 2 — Dual Ownership: `comercial_id` Migration + Lifecycle Hardening

**Status:** Complete — 2026-08-24 (`74523d0`) — executed before Phase 1 per stakeholder prioritization (sales portfolio before dashboard)

**Rationale:** A dupla titularidade (`comercial_id` + `csm_id`) é pré-requisito para o cockpit Comercial e para o controle de acesso em `ClientDetail`. Sem a coluna no banco, qualquer gating no frontend seria frágil. Ao aplicar a migration cedo, os dados podem ser populados incrementalmente (backfill manual via `/configuracoes` ou script) enquanto as fases de UI avançam. O endurecimento de `lifecycle_stage` garante que leads não vazem para cockpits comerciais/financeiros. Executado fora de ordem (antes de Phase 1) conforme aprovado — sales já tem carteira real.

**Scope:**
- Migration `comercial_id` + index
- Update `useClients`/`useClient` client select + `buildClientsQuery` to support `comercial_id`
- `ClientForm` field for `comercial_id` (dropdown from `useProfiles`)
- Backfill strategy (leave NULL, populate via UI)
- RLS/policy verification

#### Checklist

- [x] **Create `supabase/migrations/20260824000008_add_comercial_id.sql`**
  - [x] `ALTER TABLE clients ADD COLUMN comercial_id uuid REFERENCES profiles(id) ON DELETE SET NULL`
  - [x] `CREATE INDEX idx_clients_comercial_id ON clients(comercial_id)`
  - [x] `COMMENT ON COLUMN clients.comercial_id IS 'Commercial owner — separate from csm_id. Labs dashboard dual ownership.'`
  - [ ] Optional: `ALTER TABLE clients ADD CONSTRAINT chk_comercial_csm_distinct CHECK (comercial_id IS NULL OR csm_id IS NULL OR comercial_id != csm_id)` — or skip if same person allowed
  - [ ] Deploy: `supabase db push --include-all` + verify `psql \d clients`
- [x] **Modify `src/hooks/useClients.js`**
  - [x] Extend `CLIENT_SELECT` to include `comercial:profiles!clients_comercial_id_fkey(id,name,email)` — verify FK name (may be `clients_comercial_id_fkey` auto-generated)
  - [x] Add `if (filters.comercial_id) q = q.eq('comercial_id', filters.comercial_id)` to `buildClientsQuery`
  - [x] Add `if (filters._labs_dual_owner) q = q.or(`csm_id.eq.${id},comercial_id.eq.${id}`)` or dual-query merge — verify Supabase `.or()` syntax; if unsupported, do two queries client-side merge
- [x] **Modify `src/hooks/useClient.js`**
  - [x] Extend select to include `comercial:profiles!clients_comercial_id_fkey(id,name,email)` and `comercial_id`
- [x] **Modify `src/components/clients/ClientForm.jsx`**
  - [x] Add `comercial_id: ''` to `EMPTY` + `form` state
  - [x] Add select dropdown for Comercial (profiles filtered by role — reuse `csms` list or broader `profiles.filter(p=>p.status==='active')`)
  - [x] On submit, include `comercial_id: form.comercial_id || null`
  - [x] Label: "Comercial responsável" with hint "Titularidade comercial (dual ownership)"
- [x] **Modify `src/hooks/useLabsClients.js`**
  - [x] Export `useComercialClients(profile)` → `useClients({ comercial_id: profile.id, lifecycle_stage:'cliente' })`
  - [x] Export `useCsmClients(profile)` → `useClients({ csm_id: profile.id, lifecycle_stage:'cliente' })`
- [x] **Create `supabase/migrations/20260824000009_rls_comercial_dual.sql`** (A2+A3 hard gate)**
  - [ ] `CREATE POLICY clients_csm_comercial_select ON clients FOR SELECT USING (csm_id=auth.uid() OR comercial_id=auth.uid() OR get_user_role() IN ('admin','manager'))`
  - [ ] `CREATE POLICY clients_dual_update ON clients FOR UPDATE USING (get_user_role() IN ('admin','manager') OR csm_id=auth.uid() OR comercial_id=auth.uid()) WITH CHECK (...)`
  - [ ] Activities policy: `USING (client_id IN (SELECT id FROM clients WHERE csm_id=auth.uid() OR comercial_id=auth.uid()))` for csm/comercial
  - [ ] Create `clients_finance_view` or column-select guard so only `financeiro/manager/admin` can SELECT `mrr,billing_*,delay_days,contract_renewal`
  - [ ] `CREATE INDEX idx_clients_lifecycle_stage ON clients(lifecycle_stage); CREATE INDEX idx_clients_lc_comercial ON clients(lifecycle_stage, comercial_id) WHERE lifecycle_stage='cliente'`
  - [ ] Verify via `EXPLAIN` with 200-row seed + manual 403 test per role
- [ ] **Build:** `npm run build` with no errors
- [x] **Verify (partial)**
  - [ ] Create/edit empresa sets `comercial_id` correctly
  - [ ] `useClients({ comercial_id: X })` returns correct portfolio
  - [ ] Existing `/dashboard` unaffected (no comercial filter yet)

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-08-24 | `74523d0` | `supabase/migrations/20260824000008_add_comercial_id.sql`, `20260824000009_rls_comercial_dual.sql`, `src/hooks/useClients.js`, `src/hooks/useClient.js`, `src/components/clients/ClientForm.jsx`, `ClientsPage.jsx`, `src/hooks/useLabsClients.js` | `comercial_id` column + RLS dual ownership (comercial_id OR csm_id) for sales, ClientForm comercial dropdown, ClientsPage sales branch, useLabsClients helper |

---

### Phase 3 — Role-Based Empresa Access: Tabs + Edit Permissions + Contatos/Atividades Openness

**Status:** Planned — depends on Phase 2

**Rationale:** A matriz de acesso por papel (Comercial vê overview/operacional/relatorios/anexos, Financeiro edita 4 abas, todos veem contatos/atividades) é o maior impacto de UX para usuários não-CSM. Sem ela, a nova dashboard não cumpre a promessa de "cada papel vê o que precisa". Essa fase é também a mais sensível a regressões (ClientDetail é ponto central), por isso vem após a estabilização da migration.

**Scope:**
- `ClientDetail.jsx` tab gating + Edit button gating per `ROLE_TABS` matrix
- `ClientForm.jsx` 4 tabs conditional rendering/editability
- `ContactsPage` / `ActivitiesPage` openness verification (no accidental gating)
- `ProjectCockpit` / `ProfissionaisCockpit` route gating per matrix

#### Checklist

- [ ] **Modify `src/components/clients/ClientDetail.jsx`**
  - [ ] Add role matrix constant `ROLE_TAB_ALLOW` (see §4.4)
  - [ ] Determine `effectiveRole` = profile.role (or `comercial_id` presence heuristic — Phase 4 clarifies). For now use `profile.role` directly.
  - [ ] Filter `TABS` with `ROLE_TAB_ALLOW[profile.role]` or admin/manager sees all; hide disabled tabs (or `disabled` with tooltip) when `lifecycle_stage !== 'cliente'` still applies
  - [ ] Edit button: `canEdit = profile.role === 'admin' || profile.role === 'manager' || client.csm_id === profile.id || client.comercial_id === profile.id`
  - [ ] Analyst: redirect or hide Edit; tabs limited to `overview|atividades|contatos` (but Atendimento is primary)
  - [ ] Ensure `tab` query param fallback: if current tab not allowed, redirect to `overview`
  - [ ] Verify `isDisabledTab` (operacional/health when not cliente) still combines with role gating
- [x] **Modify `src/components/clients/ClientForm.jsx`**
  - [ ] Gate `TABS` rendering: Comercial sees all 4 tabs (Dados/Contrato/Operacional/Endereço) when `client.comercial_id === profile.id`; Financeiro sees all 4; Suporte sees none (form not opened)
  - [ ] Gate save: same `canEdit` logic; disable `Salvar` button and show "Sem permissão" if not allowed
  - [ ] Tests: manager can edit any; csm can edit own; analyst cannot
- [ ] **Verify `src/components/contacts/ContactsPage.jsx`**
  - [ ] No `useFeatureFlags` gate blocking contacts; all roles can `useContacts` + `ContactModal` create
  - [ ] If any `canView*` check blocks contacts, remove it
  - [ ] Test: analyst and comercial can create contact
- [ ] **Verify `src/components/activities/ActivitiesPage.jsx`**
  - [ ] `useActivities()` already role-aware but should not hide data: ensure labs allows `Todos` view for managers; csm/comercial sees own `responsible_id` but can still filter by client
  - [ ] Creation `ActivityModal` allowed for all roles (check `useActivityMutations`)
  - [ ] Add `TODO` comment if global activity view for Comercial needs `comercial_id` portfolio (Phase 4)
- [ ] **Add route guards for cockpits per matrix**
  - [ ] `/projetos-cockpit`: allow `admin|manager|csm` (already via flag) — keep; add optional `comercial` check via `isEnabled('projects_cockpit', role)` + ownership
  - [ ] `/profissionais-cockpit`: allow `admin|manager|csm` where financeiro — verify flag `profissionais_cockpit` allowed_roles includes target
- [ ] **Build:** `npm run build` with no errors
- [x] **Verify (partial)**
  - [ ] Each role tested manually (admin, manager, csm, analyst logins) — tab visibility + edit
  - [ ] Contacts creation works for all roles
  - [ ] Activities creation/listing respects matrix but not blocked
  - [ ] No `[useClients] query error` for comercial_id filter before backfill

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Cockpits per Role (Comercial + Financeiro + Suporte wiring)

**Status:** Planned — depends on Phase 3

**Rationale:** Com os filtros de titularidade e gates de acesso prontos, cada cockpit pode ser plugado com dados reais sem re-trabalho. Comercial precisa de visão de portfólio (`comercial_id`) + link para `projetos-cockpit`; Financeiro precisa de MRR/delay e `profissionais-cockpit`. Suporte/Analyst precisa de `health_suporte` e Freshdesk/Atendimento. Esta fase consolida o valor prometido para papéis não-CSM.

**Scope:**
- `ComercialCockpitCard` — clients by `comercial_id`, pipeline leads, CTA to `/projetos-cockpit`
- `FinanceiroCockpitCard` — MRR, atraso, renewal, CTA to `/profissionais-cockpit`
- `SuporteCockpitCard` — `health_suporte <10`, atendimento CTA
- Integration into `CockpitGrid` with role visibility

#### Checklist

- [ ] **Create `src/components/labs/cockpits/ComercialCockpitCard.jsx`**
  - [ ] Query `useClients({ comercial_id: profile.id, lifecycle_stage:'cliente' })` (or `useComercialClients`)
  - [ ] Display: count, ABC distribution, health bands filtered, top 3 riscos, pipeline leads (`lifecycle_stage='lead'` + `comercial_id` TODO: verify if lead ownership exists)
  - [ ] CTA buttons: "Ver meus projetos →" → `/projetos-cockpit`, "Ver empresas →" → `/empresas?comercial_id=me`
  - [ ] Empty state: "Sem empresas atribuídas"
  - [ ] Visibility: `profile.role === 'csm' || 'manager' || 'admin'` when has comercial_id or explicit comercial view
- [ ] **Create `src/components/labs/cockpits/FinanceiroCockpitCard.jsx`**
  - [ ] Query portfolio (admin/manager = all `lifecycle_stage='cliente'`; financeiro scoped = all or own if applicable)
  - [ ] Metrics: `mrrTotal`, `mrrAtrasado`, `renovacao30` (same as DashboardPage), `health_financeiro <10` count
  - [ ] DimHealth strip for financeiro dimension
  - [ ] CTA: "→ Profissionais" → `/profissionais-cockpit`
  - [ ] Visibility: `manager|admin` + financeiro alias
- [ ] **Create `src/components/labs/cockpits/SuporteCockpitCard.jsx`**
  - [ ] Metrics: `health_suporte <10` count, `client_support` aggregated (tickets if available), `semInteracao` for suporte portfolio
  - [ ] CTA: "→ Atendimento" → `/atendimento` if `whatsapp_atendimento` enabled else `/atividades?type=suporte`
  - [ ] Visibility: `analyst|csm|manager|admin`
- [ ] **Modify `src/components/labs/CockpitGrid.jsx`**
  - [ ] Add role-visibility logic: filter cards by `isEnabled('labs_dashboard', role)` + card-specific allow
  - [ ] Layout: responsive grid; collapses to single column on mobile (`min-w-0`)
  - [ ] Props: `profile`, `clients`, `activities` passed down or each card queries independently (prefer independent queries with `staleTime` to avoid prop drilling)
- [ ] **Modify `src/pages/labs/LabsDashboardPage.jsx`**
  - [ ] Render `<CockpitGrid />` below `MeuDiaPanel`
  - [ ] Pass `profile` from `useAuth`
- [ ] **Build:** `npm run build` with no errors
- [x] **Verify (partial)**
  - [ ] Each card shows correct data per role login
  - [ ] Links navigate correctly
  - [ ] No N+1: each card uses `useClients` with appropriate filter (TanStack caches by queryKey)

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Cockpits CSM/Gestão/Projetos + Polish + Drawer Integration

**Status:** Planned — depends on Phase 4

**Rationale:** CSM e Gestão são os consumidores originais do `DashboardPage` e a prova final de que a nova arquitetura pode substituir a antiga. Ao reutilizar `alertaClients`, `emRisco`, `saudaveis`, `overdueOnboardingFases` com extração limpa, garante-se paridade funcional. O drawer `ClientHealthDrawer` e `PageHeader` dão acabamento de UX consistente com `/health`. Centralizar tokens `C` em `src/lib/constants.js` (opcional) fecha o débito técnico de tokens espalhados.

**Scope:**
- `CsmCockpitCard` (alertaClients, emRisco, semInteracao, tempsVencidas)
- `GestaoCockpitCard` (scorecard row, overdue phases summary, situacao_geral)
- `ProjetosCockpitCard` (mini summary of `useProjectCockpit`)
- Optional: centralize `C` tokens, add `LayoutDashboard` icon

#### Checklist

- [ ] **Create `src/components/labs/cockpits/CsmCockpitCard.jsx`**
  - [ ] Replicate `alertaClients` multi-criteria (red: onboarding vencido, atividade atrasada, temp muito fria; amber: sem interação 30d, health em queda) — extract `buildReasons` locally
  - [ ] Display: Em Risco (health <50), Saudáveis (≥75), Sem Interação, Temps Vencidas counts
  - [ ] CTA: "Ver saúde →" → `/health`, "Ver CS Radar →" → `/cs-radar`
  - [ ] Click on client row → set `drawerClientId` (local state lifted to `LabsDashboardPage`) + render `ClientHealthDrawer`
- [ ] **Create `src/components/labs/cockpits/GestaoCockpitCard.jsx`**
  - [ ] Aggregated view: scorecard (avg + bands), `overdueCount`, `overdueOnboardingFases` top 3, health by dimension `dimHealth`
  - [ ] Admin/manager sees `selectedCsm` filter (reuse `useProfiles` dropdown)
  - [ ] CTA: "/health" + "/projetos-cockpit"
- [ ] **Create `src/components/labs/cockpits/ProjetosCockpitCard.jsx`**
  - [ ] Hook `useProjectCockpit` (from `src/hooks/useProjectCockpit.js`): `useQuery(['projects_cockpit'], ...)` already exists — reuse
  - [ ] Summary: total clientes com projeto ativo, % em dia vs atrasado, grouped by `situacao_geral`
  - [ ] CTA: "→ Projetos Cockpit" → `/projetos-cockpit`
  - [ ] Expand: optionally render collapsible `ProjectTimeline` mini (compact `PhaseCircle`)
- [ ] **Optional: `src/lib/constants.js`**
  - [ ] Export `LABS_COLORS` / `C` from single file; update `DashboardPage.jsx` + `LabsDashboardPage` + cockpit cards to import from it (low risk, high cohesion)
  - [ ] If skipped, leave `TODO: centralize C tokens` comment
- [ ] **Add drawer integration in `LabsDashboardPage.jsx`**
  - [ ] State `drawerClientId` + overlay + aside (same pattern as `HealthDashboardPage.jsx` lines ~1580: `paddingRight: drawerOpen ? 380 : 0`)
  - [ ] Reuse `src/components/clients/ClientHealthDrawer.jsx` (already handles own queries)
  - [ ] ESC closes drawer
- [ ] **Polish**
  - [ ] Add `Icons.LayoutDashboard` (or `Icons.Briefcase`) to `src/lib/icons.js` if missing for Labs nav icon
  - [ ] Ensure `PageHeader` subtitle shows date + role scope
  - [ ] Mobile responsive check (min 320px, but desktop-first 1280px target)
- [ ] **Build:** `npm run build` with no errors
- [x] **Verify (partial)**
  - [ ] CSM view matches legacy `/dashboard` critical sections (alertaClients, signals, MRR)
  - [ ] Gestão view shows aggregated correctly with CSM filter
  - [ ] Drawer opens/closes without layout shift issues
  - [ ] No inline `Ic.*` SVGs remain

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 6 — Deprecate Legacy `/dashboard` + Migration Guide

**Status:** Planned — depends on Phase 5 (all prior phases validated in production)

**Rationale:** A remoção do legado só pode ocorrer após paridade validada em produção com dados reais e feedback de CSM/Gestão/Comercial/Financeiro. Esta fase é intencionalmente separada para evitar lock-in: mesmo após a remoção, o histórico git preserva o arquivo, e um redirect temporário garante que bookmarks antigos não quebrem. A decisão de remover é humana (PO) e deve ser registrada em `Current Checkpoint`.

**Scope:**
- Decision gate: validate labs dashboard with all roles
- Deprecate/remove legacy or redirect to `/labs/dashboard`
- Update Navbar, App routing, backlog
- Archive `DashboardPage.jsx` or keep as reference

#### Checklist

- [ ] **Validation gate (human decision)**
  - [ ] All roles tested on `/labs/dashboard` vs `/dashboard` (parity checklist signed off)
  - [ ] `labs_dashboard` flag enabled for all roles in production
  - [ ] No P0/P1 bugs remaining
- [x] **Modify `src/App.jsx`**
  - [ ] Add redirect: `<Route path="/dashboard" element={<Navigate to="/labs/dashboard" replace />} />` (keep for 1 sprint, then remove)
  - [ ] Remove legacy import if fully deprecated, or keep file for reference with comment `// Deprecated — see /labs/dashboard`
- [x] **Modify `src/components/layout/Navbar.jsx`**
  - [ ] Remove `/dashboard` nav item; keep only `/labs/dashboard` labeled "Dashboard" (or "Meu Dia")
- [ ] **File operation**
  - [ ] Either delete `src/components/dashboard/DashboardPage.jsx` (if decision Recorded) or move to `src/components/dashboard/_legacy_DashboardPage.jsx` for archive
- [ ] **Docs**
  - [ ] Update `docs/backlog.md` if labs items existed
  - [ ] Update SDD Current Checkpoint: mark all phases Complete, add deprecation note
  - [ ] Add entry to `docs/CHANGELOG.md`
- [ ] **Build:** `npm run build` with no errors
- [ ] **Deploy:** `git push origin main` → Vercel; verify redirect + no 404s

#### Implementation Log (Phase 6)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 6. Current Checkpoint

### Production state

- `/dashboard` is the only dashboard in production (monolithic, CSM-coupled, 1761 lines)
- `/health` (`HealthDashboardPage.jsx`), `/cockpits`, `/cs-radar`, `/projetos-cockpit`, `/profissionais-cockpit` exist and are stable (reference for cockpit pattern)
- `clients.csm_id` exists; `clients.comercial_id` **does NOT exist** (Phase 2 labs will add it)
- `profiles.role` now `admin|manager|csm|analyst|sales|finance` (sales/finance added 2026-08-24, live)
- `clients` RLS for `sales` (scoped `csm_id`, future `comercial_id`) and `finance` (global) already deployed via `20260824000002_rls_sales_finance.sql`
- `role_impersonations` table + `get_user_role()` impersonation override + RPC `set/clear_impersonation` live (2026-08-24 `20260824000003_role_impersonation.sql`) — admin backdoor with real RLS, 1h expiry
- `AuthContext` exposes `effectiveRole/effectiveProfile/impersonatedRole/setImpersonation` + `useViewAsRole` wrapper; `Navbar` has Ver como dropdown + banner; `App.jsx` and `usePermissions` use `effectiveRole`
- `clients.lifecycle_stage` exists and is used in `DashboardPage`/`HealthDashboard` filters
- `feature_flags.labs_dashboard` **does NOT exist** (Phase 0 will create it, default `enabled=false`, `allowed_roles` must include `sales,finance`)
- `src/pages/labs/` and `src/components/labs/` **do not exist**
- `DashboardPage` helpers (`scoreBand*`, `C`, `getSignals`, `alertaClients`) are local and not exported — extraction will copy, not import
- All roles can already read contacts/activities at query level; UI gating is the remaining work

### Architectural decisions

| Decision | Rationale |
|---|---|
| Namespace isolado `/labs/dashboard` (not `/dashboard`) | Evita regressão no dashboard produtivo enquanto a nova arquitetura é validada; permite feature-flag coexistência e remoção limpa em Phase 6. Decisão validada com stakeholders. |
| Flag `labs_dashboard` com `allowed_roles = '{admin,manager,csm,sales,finance,analyst}'` (all 6 roles) | Todos os papéis precisam ver "Meu Dia" e seus cockpits; gates mais finos são feitos por card/tab, não pela rota. Validado: todos os roles podem ver/criar contatos e atividades. |
| `clients.comercial_id` nullable FK, separado de `csm_id` | Dupla titularidade comercial vs CSM: empresa pode ter dono comercial diferente do CSM operacional. Mantém queries simples (`csm_id` vs `comercial_id`), evita array de owners. Backfill incremental (NULL inicial). |
| Roles `sales`/`finance` como valores reais de `profiles.role` (não alias) | Melhor que alias: RLS pode checar `get_user_role()='sales'/'finance'` diretamente, sem heurística de `comercial_id` presence. Custo de migração pago agora; reversível via UPDATE. |
| Comercial acessa `overview/operacional/relatorios/anexos` + editar 4 abas + `/projetos-cockpit` | Reflete fluxo comercial: visão operacional e documental da empresa, mas não health financeiro; projeto cockpit relevante para entregas. Decisão validada. |
| Financeiro acessa editar 4 abas + `/profissionais-cockpit` | Financeiro edita dados cadastrais/billing e consome profissionais (mão de obra/custo); não precisa Cockpit de Projetos. Validado. |
| Analyst restrito a `/atendimento` (via `whatsapp_atendimento` flag) | Analyst é papel de suporte N1; não acessa labs cockpits além de atendimento. Manager vê tudo exceto `/configuracoes`. Validado. |
| Todos os roles podem ver/criar `contacts` e suas `activities` | Contatos são ativos compartilhados; bloquear criaria silos. Activities scope por `responsible_id` para listagem mas criação liberada. Validado. |
| Copiar helpers (`scoreBand*`, `C`, `getSignals`) localmente, não importar de `DashboardPage.jsx` | Helpers não são exportados; importar quebraria build. Padrão já usado em `HealthDashboardPage.jsx` e `ClientHealthDrawer.jsx`. |
| Substituir `Ic.*` inline SVGs por `Icons.*` | `src/lib/icons.js` é o barrel canônico; inline SVGs são tech debt que não deve ser replicado. |
| `lifecycle_stage = 'cliente'` filter mandatory in all labs queries | `lead`/`ex_cliente` não devem vazar para cockpits operacionais/financeiros; mesmo padrão do dashboard legado. |
| Reuse `ClientHealthDrawer.jsx` for labs drawer | Componente já é self-contained com queries próprias; evita duplicação. |
| TanStack defaults `staleTime 30s / retry 1 / gcTime 5m` | Consistência com `App.jsx` QueryClient; evita overrides ad-hoc. |
| `src/lib/roles.js` como single source (`ROLE_OPTIONS`, `ROLE_LABEL`, `ROLE_VALUES`) | Evita 4 hardcodes divergentes (SettingsFeatureFlags + 3 selects em SettingsUsers); labels em inglês `Admin/Manager/CSM/Analyst/Sales/Finance` seguem padrão plataforma. Validado em screenshots. |
| Backdoor `Ver como` só `admin` com dados reais via `role_impersonations` + `get_user_role()` override | Frontend-only seria preview visual sem dados; requisito exigiu visão real. Solução com tabela + SECURITY DEFINER + expiry 1h garante RLS real sem mutar `profiles.role`, auditável e auto-limpeza. `effectiveRole` propaga para UI gating. |
| Desktop-first 1280px, responsive fallback | Padrão do projeto (health-score SDD); labs validará mobile em Phase 5 polish. |

---

## 7. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`. Add new icons at top (import) + alphabetically in `Icons` object. Check duplicates first. Verify `LayoutDashboard`, `Briefcase`, `DollarSign`, `Headset` exist before importing — add if missing.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy. Use `node_modules/.bin/supabase` on WSL.
- **Branch:** worktree disabled. All work goes directly to `main`. Push to `origin main`; Vercel auto-deploys.
- **Color helpers:** `scoreBand*` and `C` are local to `DashboardPage.jsx` — Phase 1 extracts them to `src/lib/scoring.js` (mandatory). Until then redefine locally, do not import from DashboardPage.
- **DashboardPage is 1761 lines:** do not edit it in labs phases except for critical shared fixes. Labs work is additive under `/labs/*`.
- **Feature flags loading:** `isEnabled()` returns false while `flags` still loading — guard redirects with `flagsLoading` check to avoid flash redirects. `useFeatureFlags` has `staleTime 5m` — labs flag rollout needs manual invalidation or 30s staleTime override.
- **Clients query:** `buildClientsQuery` does not support `.or()` out of the box — dual ownership OR must use `q.or('csm_id.eq.X,comercial_id.eq.X')` with PostgREST syntax verified. Fallback client-side merge doubles payload and breaks pagination.
- **Comercial_id FK name:** auto-generated name may be `clients_comercial_id_fkey` — verify via `\d clients` after migration before writing `CLIENT_SELECT` join alias.
- **Navbar:** uses `availableLinks(links)` filtering via `link.featureFlag`; `HealthDashboardPage` and `CockpitsPage` precedent — follow same for `labs_dashboard`. `availableLinks` filters only by `featureFlag`, not `allowed_roles` — card-level role checks still required.
- **Build assumption:** `build.minify: false` in `vite.config.js` — build not minified; verify `npm run build` always before phase completion.
- **`__COMMIT_HASH__`:** injected via `git rev-parse --short HEAD` in `vite.config.js` — ensure file edits do not break hash injection.
- **No local Supabase:** all DB changes via `supabase db push --include-all` directly to production; test on `donccx.vercel.app` after deploy.
- **CRITICAL — PrivateRoute analyst gate (A1):** `src/App.jsx:PrivateRoute` redirects `analyst` to `/atendimento` if `whatsapp_atendimento` enabled and path not `/atendimento`. `/labs/dashboard` will be blocked for analyst unless `PrivateRoute` is patched to allow `/labs/dashboard` or analyst is removed from `labs_dashboard allowed_roles`. Fix in Phase 0.
- **CRITICAL — RLS dual ownership (A2):** `clients` RLS currently only allows `csm_id = auth.uid()` and `admin/manager`. Without `comercial_id` policy, `useClients({comercial_id})` will return 0 rows and `UPDATE` will 403 even though UI shows Edit button. Migration `rls_labs_dual_ownership.sql` is a hard gate before Phase 2 merge.
- **CRITICAL — MRR leak (A3):** `CLIENT_SELECT = *` returns `mrr, billing_*, delay_days` to any role with SELECT. Hiding `FinanceiroCockpitCard` is not enough — network tab leaks finances. Use column-select per role or `clients_finance_view` for financeiro/manager/admin only.
- **CRITICAL — Single lifted query (A5):** Do not let 6 cockpits each call `useClients` independently (6× queries). Lift to `LabsDashboardPage` single `useLabsClients(labsFilterFor(profile))` with `queryKey ['labs_clients', profile.id]` and slice via `useMemo`. Reduces 200-client payload from 6×10MB to 1×.

---

## 8. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read the **Global Definitions (§1)**, **Design System Reference (§2)**, **Component Tree (§3)**, and **Data Contracts (§4)** before writing any code.
3. Identify the **active phase** via its checklist status (Phase 0 is first).
4. Implement item by item. Mark ✅ when done and verified.
5. After each significant item, run `npm run build` to ensure nothing broke.
6. At the end of the phase, fill in the **Implementation Log** for that phase.
7. Update the **Checkpoint (§6)** with the new state and any new architectural decisions.

### Technical Summary Template (fill at the end of each phase)

```
### Technical Summary — Phase X

**Commits:** hash1, hash2
**Files created:** [list]
**Files modified:** [list]
**Files deleted:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered or deferred]
```

### Validation Checklist — before marking phase complete

- [ ] Section 0 reflects actual current state (verified against codebase)
- [ ] Every file in "Files to be touched" was verified to exist or confirmed not to exist
- [ ] Data contracts reference real column names (checked via `useClients`/`useClient`/`supabase` schema)
- [ ] Color tokens and icon names verified in codebase (`C` from DashboardPage, `Icons` from icons.js)
- [ ] Helpers listed as importable are actually exported (they are not — copied locally per spec)
- [ ] Active phase clearly identified
- [ ] Gotchas section includes project-wide traps
- [ ] Language convention followed (English for checklists/contracts/trees/code; Portuguese for rationale)
- [ ] `npm run build` passes with no errors

