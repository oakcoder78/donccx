# SDD — Health Score Dashboard

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the Health Score Dashboard feature (`/health`). It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully — understand the spec, current checkpoint, design system references, and data contracts.
2. **During implementation:** Follow the checklist for the active phase. Tick items as done.
3. **After implementation:** Fill the Implementation Log at the bottom of the phase with commit hash, files changed, and technical summary. Update the Checkpoint section.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main` (worktree disabled — all work goes directly to main)
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** None — all phases complete (incl. lifecycle_stage filter fix)

**What exists related to `/health`:**
- `src/pages/HealthDashboardPage.jsx` — main page, scorecard + ranking table ✅
- Route `/health` in `App.jsx` ✅
- "Health Score" conditional item in `Navbar.jsx` (gated by feature flag `health`) ✅
- `clients.health_trend integer DEFAULT 0` — migration applied ✅
- `calculate_health_trends()` SQL function — called by monthly-sync after health-recalc ✅
- `DashboardPage.jsx` — "ver todos →" points to `/health` ✅
- `DashboardPage.jsx` — lógica de health score (scorecard, ranking parcial, helpers de cor). Referência de padrão visual.
- `ClientTabHealth.jsx` — detalhe de health por cliente, dimensões com cards expansíveis.
- `SettingsHealth.jsx` — configuração de thresholds e regras. Usa `useHealthConfig`.
- `useHealthConfig` hook — carrega `health_config` e `health_rules` do Supabase.
- Feature flag `health` — existe na tabela `feature_flags`; admin e manager têm acesso.

### Files touched (Phase 0 + Phase 1)

| File | Change | Phase |
|---|---|---|
| `src/pages/HealthDashboardPage.jsx` | Created | 0 + 1 |
| `src/App.jsx` | Modified — added `/health` route | 0 |
| `src/components/layout/Navbar.jsx` | Modified — conditional nav item | 0 |
| `src/components/dashboard/DashboardPage.jsx` | Modified — "ver todos →" → `/health` | 0 |
| `supabase/migrations/20260519000001_add_health_trend.sql` | Created | 1 |
| `supabase/functions/monthly-sync/index.ts` | Modified — step 4 trend update | 1 |

---

## 1. Global Definitions

### 1.1 Score Bands

| Band | Range | Hex color | Badge variant |
|---|---|---|---|
| Saudável | ≥ 75 | `#1D9E75` | `badge variant="green"` |
| Atenção | ≥ 50 e < 75 | `#BA7517` | `badge variant="amber"` |
| Alerta | < 50 | `#E24B4A` | `badge variant="red"` |

### 1.2 Dimensions

> **Canonical color source:** `DashboardPage.jsx` (object `C` at the top of the file, `dimXxx` tokens).
> `ClientTabHealth.jsx` usa um esquema independente (cores por status de saúde da dimensão, não por identidade visual) — não confundir.

| Key | Label | Canonical hex (C.*) | Icon (from `src/lib/icons.js`) |
|---|---|---|---|
| `health_uso` | Uso | `#59c2ed` (`C.dimUso`) | `Icons.BarChart3` |
| `health_suporte` | Suporte | `#b46cd1` (`C.dimSuporte`) | `Icons.Target` |
| `health_relacionamento` | Relacionamento | `#d98b28` (`C.dimRel`) | `Icons.Handshake` |
| `health_financeiro` | Financeiro | `#2f9e70` (`C.dimFin`) | `Icons.Wallet` |
| `health_projeto` | Projeto | `#d3da47` (`C.dimProj`) | `Icons.Rocket` |

> **Do not use `HealthDimensionIcons` here.** `DashboardPage.jsx` defines a local (non-exported) map `HEALTH_ICONS` with these same icons. In `HealthDashboardPage.jsx`, recreate the map locally:
> ```js
> const DIM_ICONS = {
>   health_uso: Icons.BarChart3,
>   health_suporte: Icons.Target,
>   health_relacionamento: Icons.Handshake,
>   health_financeiro: Icons.Wallet,
>   health_projeto: Icons.Rocket,
> }
> ```

> **Nota para o futuro:** existe divergência de cores entre `DashboardPage.jsx`, `ClientTabHealth.jsx` e `reportGenerator.js`. Apenas `health_uso` (#59c2ed) é consistente nos três. A correção definitiva é centralizar esses tokens em `src/lib/constants.js` — mas isso é escopo fora desta feature.

### 1.3 Feature Flag

- **Name:** `health`
- **Access:** admin and manager only. Analyst has no access.
- **Hook:** `useFeatureFlags` → `isEnabled('health', profile?.role)`
- A flag já existe na tabela `feature_flags` em produção — não precisa criar migration.

### 1.4 Thresholds

Configuráveis via `SettingsHealth`. Lidos via `useHealthConfig`.

| Threshold | Default | Usage |
|---|---|---|
| `threshold_healthy` | 75 | Score ≥ = Saudável |
| `threshold_attention` | 50 | Score ≥ = Atenção; < = Alerta |

> Para a Fase 0, use os valores default hardcoded (75/50). Integração com `useHealthConfig` é melhoria futura.

---

## 2. Design System Reference

> **Rule:** Before implementing, open the reference files listed below. Do not invent new patterns. If you need a component not listed here, search the codebase before creating one.

### 2.1 Core Components

| Component | File | Relevant props |
|---|---|---|
| `Button` | `src/components/ui/Button.jsx` | `variant` (primary/secondary/green/danger), `size` (sm/md), `disabled` |
| `Badge` | `src/components/ui/Badge.jsx` | `variant` (green/amber/red/sky) |
| `PageHeader` | `src/components/ui/PageHeader.jsx` | `title`, `subtitle`, `action` |
| `PageSpinner` | `src/components/ui/Spinner.jsx` | Full-page loading state |
| `Icons` | `src/lib/icons.js` | **Never** import directly from `lucide-react` |

### 2.2 Reference files for this feature

Open and read these files before writing any code. They are the two closest templates:

**`src/components/clients/ClientsPage.jsx`** — primary template for the table
- Tem busca com debounce
- Usa `useClients` corretamente (com filtro de role)
- Tem loading/empty states
- Estrutura de lista com filter chips

**`src/components/dashboard/DashboardPage.jsx`** — template for the scorecard and color helpers
- Object `C` with all color constants (lines ~30–50)
- Functions `scoreBand()`, `scoreBandColor()`, `scoreBandLabel()` (local, not exported)
- KPI card visual pattern
- Partial health score ranking already implemented

> **Warning:** `scoreBand()`, `scoreBandColor()`, `scoreBandLabel()` and the `C` object **are not exported** from `DashboardPage.jsx`. When creating `HealthDashboardPage.jsx`, redefine them locally — copy the functions and relevant color constants. Do not attempt to import from `DashboardPage`.

### 2.3 Table Row Pattern (from HealthDashboardPage.jsx)

```jsx
const GRID = '32px 1fr 64px 48px 48px 48px 48px 48px 56px'

// Header
<div style={{
  display: 'grid', gridTemplateColumns: GRID, gap: 14,
  padding: '10px 8px', borderBottom: `1px solid ${C.line}`,
  background: C.bg, alignItems: 'center',
}}>
  <div style={{ fontSize: 11, color: C.ink4 }}>#</div>
  <div style={{ fontSize: 11, color: C.ink4 }}>Empresa</div>
  <div style={{ fontSize: 11, color: C.ink4 }}>Total</div>
  {DIMS.map(d => (
    <div key={d.key} style={{ fontSize: 11, color: DIM_COLORS[d.key], fontWeight: 600 }}>{d.label}</div>
  ))}
  <div style={{ fontSize: 11, color: C.ink4 }}>Δ</div>
</div>

// Body row — onClick passa from state para back button context
<div
  key={c.id}
  onClick={() => navigate(`/empresas/${c.id}?tab=health`, { state: { from: location.pathname + location.search } })}
  style={{
    display: 'grid', gridTemplateColumns: GRID, gap: 14,
    padding: '12px 8px', borderBottom: `0.5px solid ${C.line}`,
    cursor: 'pointer', alignItems: 'center',
  }}
  onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fb')}
  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
>
  <div style={{ fontSize: 12, color: C.ink3 }}>{i + 1}</div>
  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
    {c.fantasy_name || c.name}
  </div>
  <div style={{ fontSize: 22, fontWeight: 700, color: scoreBandColor(c.health_total), fontVariantNumeric: 'tabular-nums' }}>
    {c.health_total ?? '—'}
  </div>
  {DIMS.map(d => (
    <div key={d.key} style={{ fontSize: 13, color: DIM_COLORS[d.key], fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
      {c[d.key] ?? '—'}
    </div>
  ))}
  <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
    color: c.health_trend > 0 ? C.green : c.health_trend < 0 ? C.red : C.ink4,
  }}>
    {c.health_trend == null || c.health_trend === 0 ? '—' : c.health_trend > 0 ? `+${c.health_trend}` : `${c.health_trend}`}
  </div>
</div>
```

### 2.4 Layout & Spacing Tokens

| Token | Usage |
|---|---|
| `bg-bg-primary` | Panels, cards |
| `bg-bg-secondary` | Page background, alternating sections |
| `border-border-tertiary` | Subtle borders, separators |
| `text-text-primary` | Titles, values |
| `text-text-secondary` | Labels |
| `text-text-tertiary` | Hints, metadata |
| `label-sm` | Field labels (11px) |
| `input-base` | Form inputs |

---

## 3. Component Tree — `/health`

```
HealthDashboardPage (src/pages/HealthDashboardPage.jsx)
├── PageHeader (title="Health Score · Carteira", subtitle="{n} clientes ativos")
├── ScoreCardRow  ← inline divs; no KpiCard component exists in the project
│   ├── div (overall average — large number colored by band)
│   ├── div (Saudáveis — green)
│   ├── div (Atenção — amber)
│   └── div (Alerta — red)
├── Filter bar
│   ├── input (inline search with 300ms debounce, className="input-base h-9")
│   ├── select (CSM dropdown — admin/manager only, from useProfiles)
│   └── select (Critical dimension — filters score < 10)
├── Band chips row
│   ├── button Todos ({count})
│   ├── button Saudáveis ({count})
│   ├── button Atenção ({count})
│   ├── button Alerta ({count})
│   └── button "Limpar filtros" (visible when any filter active)
├── RankingTable  ← inline div
│   ├── div header (grid columns: #, Empresa, Total, Uso, Sup, Rel, Fin, Proj, Δ)
│   └── div[] per client  ← see pattern in section 2.3
│       ├── Δ column (signed integer, green/red/gray)
│       └── onClick → navigate(/empresas/{id}?tab=health, { state: { from } })
```

> **Project pattern:** `DashboardPage.jsx` does not encapsulate KPI cards or search inputs into reusable components — it builds divs directly with inline `style`. Follow the same pattern here. Do not create new components for the scorecard, search bar, or table.

### Page states

| State | What to show |
|---|---|
| **Loading** | Skeleton: 4 KPI divs + 5 placeholder rows with shimmer animation |
| **Empty** | "Nenhum cliente ativo encontrado" with icon |
| **Error** | "Erro ao carregar dados" + retry button |
| **Data** | Full scorecard + ranking table |

---

## 4. Data Contracts

### 4.1 Clients Query

Reuse the existing `useClients` hook from `src/hooks/useClients.js`.

```js
// Admin/manager sees all active clients; CSM sees only their portfolio.
// lifecycle_stage: 'cliente' ensures leads/prospects/partners are excluded
// (same pattern as DashboardPage.jsx and health-recalc Edge Function).
const { profile } = useAuth()
const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'
const baseFilters = isAdminOrManager
  ? { lifecycle_stage: 'cliente' }
  : { csm_id: profile?.id, lifecycle_stage: 'cliente' }

const { data: clients = [], isLoading, error } = useClients(baseFilters, { enabled: !!profile })
```

Fields used (all exist in the `clients` table):

| Field | Type | Note |
|---|---|---|
| `id` | uuid | — |
| `name` | text | Fallback if fantasy_name is empty |
| `fantasy_name` | text | Preferred display name |
| `health_total` | integer | Aggregated score 0–100 |
| `health_uso` | integer | Uso dimension 0–20 |
| `health_suporte` | integer | Suporte dimension 0–20 |
| `health_relacionamento` | integer | Relacionamento dimension 0–20 |
| `health_financeiro` | integer | Financeiro dimension 0–20 |
| `health_projeto` | integer | Projeto dimension 0–20 |

> **`health_trend` EXISTS in the database** since migration `20260519000001_add_health_trend.sql`. Rendered as Δ column in the ranking table. See section 4.3.

### 4.2 Scorecard Calculation (client-side)

The scorecard reflects the **post-filter** data (not the full unfiltered portfolio). Filter pipeline:

```js
// 1. Search filter (debounced 300ms)
let result = clients
const q = debouncedSearch.toLowerCase()
if (q) result = result.filter(c => (c.fantasy_name || c.name || '').toLowerCase().includes(q))

// 2. Band filter
if (bandFilter === 'saudavel') result = result.filter(c => (c.health_total ?? 0) >= 75)
else if (bandFilter === 'atencao') result = result.filter(c => { const s = c.health_total ?? 0; return s >= 50 && s < 75 })
else if (bandFilter === 'alerta') result = result.filter(c => (c.health_total ?? 0) < 50)

// 3. Critical dimension filter (score < 10)
if (dimFilter) result = result.filter(c => (c[dimFilter] ?? 0) < 10)

// 4. CSM filter (admin/manager only)
if (csmFilter) result = result.filter(c => c.csm_id === csmFilter)

// Scorecard from filtered result
const avgScore = result.length
  ? Math.round(result.reduce((s, c) => s + (c.health_total || 0), 0) / result.length)
  : 0
const saudaveis = result.filter(c => (c.health_total || 0) >= 75).length
const atencao   = result.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 }).length
const alerta    = result.filter(c => (c.health_total || 0) < 50).length
```

> O scorecard sempre reflete os dados filtrados (busca + banda + dimensão crítica + CSM), não a carteira inteira.

### 4.3 Trend — Implemented (Phase 1)

Campo `health_trend integer DEFAULT 0` existe no banco desde a migration `20260519000001_add_health_trend.sql`.

**Fórmula** (SQL function `calculate_health_trends()`):
```
health_trend = health_total - last_month_health_total
```
- Usa `health_score_history` para buscar o mês anterior mais recente por cliente
- Se não há histórico anterior: `COALESCE(..., health_total)` → trend = 0
- Chamada via `rpc('calculate_health_trends')` no step 4 do `monthly-sync`

**Na tabela:** coluna Δ exibe formato `+N` (verde), `-N` (vermelho), ou `—` (cinza) quando trend é 0.

**Deploy:** migration aplicada, function deployada, monthly-sync step 4 ativo em produção. Valores ficam 0 até o primeiro monthly-sync rodar.

### 4.4 Sort order

Clients sorted by `health_total` ascending (worst first). Clientes em risco aparecem no topo — priorização natural para o CSM.

### 4.5 Row click navigation

```js
navigate(`/empresas/${client.id}?tab=health`)
```

---

## 5. Navbar Implementation

> **Warning:** `Navbar.jsx` uses a static array `mainNavLinks` — there is no `useFeatureFlags` integration. O padrão de feature flag na nav ainda não existe no projeto.

**How to implement the conditional item:**

```jsx
// In Navbar.jsx, after loading profile:
const { isEnabled } = useFeatureFlags()
const showHealth = isEnabled('health', profile?.role)

// In the links array or render:
const links = [
  ...mainNavLinks,
  ...(showHealth ? [{ to: '/health', label: 'Health Score' }] : []),
  ...(canViewSettings ? [{ to: '/configuracoes', label: 'Configurações' }] : []),
]
```

O ícone `Icons.Heart` já existe em `src/lib/icons.js` (`SettingsMenuIcons.health`). A Navbar atual não renderiza ícones nos links — manter consistência e não adicionar ícone no link da nav.

---

## 6. Route Implementation

No `FeatureFlagRoute` component exists in the project. Access protection must be handled inside the component itself:

```jsx
// HealthDashboardPage.jsx — at the top of the component
const { profile } = useAuth()
const { isEnabled } = useFeatureFlags()
const navigate = useNavigate()

useEffect(() => {
  if (profile && !isEnabled('health', profile.role)) {
    navigate('/dashboard', { replace: true })
  }
}, [profile])
```

In `App.jsx`, add the route inside the `PrivateRoute` block, alongside the other user routes (not inside `AdminRoute`):

```jsx
<Route path="/health" element={<HealthDashboardPage />} />
```

---

## 7. Implementation Phases

### Phase 0 — Scorecard + Ranking

**Status:** ✅ Complete — commit `91fbdaf` (2026-05-19)

**Scope:**
- Create `src/pages/HealthDashboardPage.jsx` with aggregated scorecard + ranked table
- Add `/health` route in `App.jsx`
- Add conditional item in Navbar
- Update "ver todos →" link in Dashboard
- Debounced name search

#### Checklist

- [x] **Create `src/pages/HealthDashboardPage.jsx`**
  - [x] Functional component with 4 states: loading / empty / error / data
  - [x] Redirect to `/dashboard` if feature flag `health` is not enabled for the role
  - [x] Helpers `scoreBand()`, `scoreBandColor()`, `scoreBandLabel()` and object `C` defined locally (copied from `DashboardPage.jsx`, not imported)
  - [x] Dimension colors defined locally using canonical hexes from section 1.2
  - [x] Dimension icon map `DIM_ICONS` defined locally (see section 1.2)
- [x] **ScoreCardRow:** 4 inline divs (Média, Saudáveis, Atenção, Alerta)
  - [x] Loading state: shimmer skeleton on all 4 divs
  - [x] Média: large number colored by score band
  - [x] Saudáveis / Atenção / Alerta: count with corresponding color
  - [x] Scorecard reflects currently filtered data
- [x] **Search input:** inline input with 300ms debounce, filtering by `fantasy_name` or `name`
- [x] **RankingTable:** clients sorted by `health_total` ascending
  - [x] Columns: #, Empresa, Total, Uso, Sup, Rel, Fin, Proj (**no trend column in Phase 0**)
  - [x] Total score: large number colored by band (`scoreBandColor`)
  - [x] Dimension scores: plain numbers with canonical dimension color
  - [x] Row hover: background `#f8f9fb`
  - [x] Row click: `navigate(/empresas/{id}?tab=health)`
  - [x] Empty state: "Nenhum cliente encontrado"
- [x] **Route:** add `<Route path="/health" element={<HealthDashboardPage />} />` in `App.jsx` inside `PrivateRoute`
- [x] **Navbar:** add conditional "Health Score" item gated by feature flag `health`
  - [x] `featureFlag: 'health'` added to `mainNavLinks` array — filtered by existing `availableLinks()` fn
  - [x] Item visible only if `isEnabled('health', profile?.role)` returns true
- [x] **Dashboard "ver todos →":** update health block link in `DashboardPage.jsx` from `/empresas?health=alerta` to `/health`
- [x] **Build:** `npm run build` with no errors

#### UI Spec (Phase 0)

```
┌──────────────────────────────────────────────────────┐
│  Health Score · Carteira                             │
│  25 clientes ativos                                  │
├──────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │    67    │ │    12    │ │    8     │ │   5    │  │
│  │  Média   │ │Saudáveis │ │  Atenção │ │ Alerta │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
├──────────────────────────────────────────────────────┤
│  Buscar empresa: [................................]   │
├──────────────────────────────────────────────────────┤
│  #  │ Empresa       │ Total │ Uso │ Sup │ Rel │ Fin │ Proj │
│  ──────────────────────────────────────────────────  │
│  1  │ Cliente X     │  42   │  8  │  6  │  10 │  8  │  10  │  ← red
│  2  │ Cliente Y     │  58   │ 12  │ 10  │  12 │ 12  │  12  │  ← amber
│  3  │ Cliente Z     │  82   │ 18  │ 16  │  16 │ 16  │  16  │  ← green
│  ⋮                                                   │
└──────────────────────────────────────────────────────┘
```

#### Implementation Log (Phase 0)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | `91fbdaf` | `src/pages/HealthDashboardPage.jsx` (created), `src/App.jsx`, `src/components/layout/Navbar.jsx`, `src/components/dashboard/DashboardPage.jsx` | Scorecard + ranking table, feature flag guard, 300ms debounce search, shimmer skeleton, Navbar conditional item via `featureFlag: 'health'` in `mainNavLinks`, Dashboard "ver todos →" → `/health` |

#### Technical Summary — Phase 0

**Commits:** `91fbdaf`
**Files created:** `src/pages/HealthDashboardPage.jsx`
**Files modified:** `src/App.jsx`, `src/components/layout/Navbar.jsx`, `src/components/dashboard/DashboardPage.jsx`

**Decisions:**
- Navbar uses `featureFlag: 'health'` in `mainNavLinks` array (existing `availableLinks()` pattern) instead of inline conditional — simpler and consistent with `whatsapp_atendimento`
- `ScoreCard` extracted as local component inside the file (not exported) to avoid inline repetition of 4 cards

**Issues found:**
- None

**Pending items:**
- `health_trend` column deferred to Phase 1 (field did not exist in DB at time of Phase 0)

---

### Phase 1 — Trend + Advanced Filters

**Status:** ✅ Complete

#### Trend — Delivered

**Scope delivered:**
- `supabase/migrations/20260519000001_add_health_trend.sql` — `ALTER TABLE clients ADD COLUMN health_trend integer DEFAULT 0` + SQL function `calculate_health_trends()`
- `supabase/functions/monthly-sync/index.ts` — step 4: calls `rpc('calculate_health_trends')` after health-recalc
- `src/pages/HealthDashboardPage.jsx` — column Δ added to ranking table (signed integer, green/red/gray)

**Formula:** `health_total - most recent prior-month health_total from health_score_history`
- Uses `h.ref_month < current_month ORDER BY ref_month DESC LIMIT 1`
- If no prior history: `COALESCE(..., health_total)` → trend = 0
- `health_trend = 0` DEFAULT until first monthly-sync runs

**Deployment note:** after `npx supabase db push` + `npx supabase functions deploy monthly-sync`, disable "Verify JWT" in Dashboard and run `node scripts/fix-supabase-urls.js`.

#### Implementation Log (Phase 1 — Trend)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | `009ec14` | `supabase/migrations/20260519000001_add_health_trend.sql` (created), `supabase/functions/monthly-sync/index.ts`, `src/pages/HealthDashboardPage.jsx` | ADD COLUMN health_trend + calculate_health_trends() fn + monthly-sync step 4 + Δ column in /health table |

#### Technical Summary — Phase 1 (Trend)

**Commits:** `009ec14`
**Files created:** `supabase/migrations/20260519000001_add_health_trend.sql`
**Files modified:** `supabase/functions/monthly-sync/index.ts`, `src/pages/HealthDashboardPage.jsx`

**Decisions:**
- Opção A (migration + pg_cron) chosen: pg_cron and `health_score_history` already existed
- `calculate_health_trends()` as a SQL function (not edge function) — cleaner, single atomic UPDATE
- Called via `supabase.rpc()` inside monthly-sync after health-recalc completes
- `clients.id` confirmed integer (not UUID) — direct join with `health_score_history.client_id`

**Advanced Filters — Delivered:**
- Filter by band: chip row (Todos/Saudáveis/Atenção/Alerta) com cores e contagens. Chip ativo vai para `/health?tab=health` com estado filtrado. Botão "Limpar filtros" quando ativo.
- Filter by critical dimension: dropdown com 5 dimensões — filtra clientes com score < 10 na dimensão selecionada.
- Filter by CSM: dropdown de CSMs (admin/manager only), filtra por `csm_id`.

**Back Button Context — Fixed:**
- `HealthDashboardPage.jsx` passa `{ state: { from: location.pathname + location.search } }` ao navegar para `/empresas/{id}?tab=health`
- `ClientDetail.jsx` lê `location.state?.from` — fallback `/empresas`
- Botão "← Health Score" aparece quando origem é `/health`

#### Implementation Log (Phase 1 — Advanced Filters + Back Button)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-05-19 | *current* | `src/pages/HealthDashboardPage.jsx`, `src/components/clients/ClientDetail.jsx` | 3 advanced filters (band chips, dim dropdown, CSM dropdown) + back button context via `from` state |
| 2026-05-19 | `1d270c9` | `src/pages/HealthDashboardPage.jsx` | lifecycle_stage: 'cliente' filter + uniform input heights (`input-base h-9`) |

---

## 8. Current Checkpoint

### Production state

- `/health` rota existe, página existe (`src/pages/HealthDashboardPage.jsx`) com 343 linhas
- **`lifecycle_stage: 'cliente'` filter** ativo na query — leads/prospects/parceiros excluídos do dashboard
- Input de busca e dropdowns com altura uniforme (`input-base h-9`)
- Scorecard + ranking table + 3 advanced filters (band chips, dim dropdown, CSM dropdown)
- Debounced search + shimmer skeleton + error/empty states
- Feature flag guard + filter chips + "Limpar filtros"
- `DashboardPage.jsx` "ver todos →" aponta para `/health`
- Navbar item "Health Score" visível para admin/manager
- Back button no ClientDetail respeita contexto de origem (`from` state)
- `clients.health_trend integer DEFAULT 0` — migration aplicada no banco remoto
- `calculate_health_trends()` SQL function existe — chamada pelo monthly-sync (deployed)
- Coluna Δ em `/health` exibe `—` enquanto `health_trend = 0`

### Architectural decisions

| Decision | Rationale |
|---|---|
| Single route `/health`, no sub-routes | Drill-down usa `/empresas/{id}?tab=health` já existente |
| Internal redirect for route protection | Não existe `FeatureFlagRoute` no projeto; é o padrão mais simples |
| Color helpers redefined locally | `scoreBand*` e `C.*` não são exportados de `DashboardPage.jsx` |
| Canonical colors = `DashboardPage.jsx` | Única fonte com tokens nomeados (`dimUso`, `dimSuporte` etc.) |
| No pagination | Carteira de 20–25 clientes cabe em uma página |
| Desktop-first | Suporte mínimo 1280px |
| Scorecard reflects active search | UX: scorecard deve mostrar o estado dos dados visíveis, não da carteira toda |
| Navbar: `featureFlag: 'health'` in `mainNavLinks` | Consistent with existing `whatsapp_atendimento` pattern; `availableLinks()` handles filtering |
| `health_trend` via Opção A (migration + monthly-sync) | pg_cron e `health_score_history` já existiam; SQL function `calculate_health_trends()` chamada pelo monthly-sync após health-recalc |
| `clients.id` is integer | Confirmed by health-recalc source — direct join with `health_score_history.client_id integer` |

---

## 9. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read the **Design System Reference (Section 2)** and open the reference files before writing any code.
3. Identify the **active phase** via its checklist. If Phase 0 is incomplete, start there.
4. Implement item by item. Mark ✅ when done and verified.
5. After each significant item, run `npm run build` to ensure nothing broke.
6. At the end of the phase, fill in the **Implementation Log**.
7. Update the **Checkpoint (Section 8)** with the new state.

### Project gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`.
- **Color helpers:** `scoreBand*` and `C.*` are local to `DashboardPage.jsx` — redefine in the new component, do not import.
- **health_trend:** field NOW EXISTS (`integer DEFAULT 0`). Migration `20260519000001_add_health_trend.sql` must be deployed (`npx supabase db push`). Values are 0 until monthly-sync runs.

### Technical Summary Template (fill at the end of each phase)

```
### Technical Summary — Phase X

**Commits:** hash1, hash2
**Files created:** [list]
**Files modified:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered or deferred]
```
