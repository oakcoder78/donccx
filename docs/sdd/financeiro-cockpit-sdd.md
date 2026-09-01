# SDD — Cockpit Financeiro (Finance Cockpit)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the **Cockpit Financeiro** — dashboard financeiro que consolida MRR mínimo garantido vs MRR real faturável por `ref_month`, incluindo excedente acima do piso, correções monetárias e exceções/negociações auditáveis. Fonte: contrato (`clients.billing_*`) + uso real DONC API (`client_usage.profissionais_versao`) + `billing_exceptions`/`billing_corrections`.

It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

Reference BRD: `docs/brd/brd-financeiro-cockpit.md` v0.3 (Q4a sales escrita total, Q4b reprocessa passado, Q6 flag dedicada Sim). Template 1:1: `docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md` + `src/pages/ProfissionaisCockpitPage.jsx:1-736`.

### How to use this document

1. **Before implementing:** Read this document fully. Understand the data contracts, component tree, and business rules before touching any file.
2. **During implementation:** Follow the checklist for the active phase only. Do not skip ahead.
3. **After implementation:** Fill the Implementation Log for the completed phase before starting the next one.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx-donccx.vercel.app` (Vercel auto-deploy on `git push origin main`)
- **Active phase:** Phase 1 — Not started

**What already exists related to this work:**
- `clients` table (`billing_type text CHECK por_licenca/por_os`, `billing_base_value numeric`, `billing_floor int`, `contract_signed_date/ro_start/renewal date`, `correction_index text`, `mrr numeric`, `contract_active bool`, `lifecycle_stage`, `cnpj`, `contract_saas_id`, `fantasy_name`) — `supabase/migrations/20260503031721_remote_schema.sql` + `20260726180000`
- `client_usage` (`client_id int`, `ref_month text YYYY-MM`, `profissionais_versao jsonb`, `pending boolean`, `instance_id uuid`, `estabelecimentos jsonb`) — populated by `donc-api-sync` via `GET https://webhub.donc.com.br/api/DoncCx/{contract_saas_id}?dataInicio=...`
- `sync_service_log` granular (`service_name='donc-api'`, `ref_month`, `status`, `finished_at`, `triggered_by`) — `20260727210000`
- `feature_flags` table + `src/hooks/useFeatureFlags.js` (`isEnabled(key, role)`) + `src/lib/roles.js` (`ROLE_OPTIONS`, `effectiveRole = impersonatedRole || profile.role`) + `src/contexts/AuthContext.jsx` (`isFinance`)
- `src/lib/billing.js:7` — `calculateMRR` / `calculateUnitValue` (BUG: `unitValue = base + sum(mods)` diverge de Q2 rateio)
- `src/components/clients/ClientForm.jsx:14,21,469,512,520` — aba Contrato + card MRR mínimo + seção Modificadores por módulo (`modPricing` derivado de `solucoes`/`client_catalog`)
- `src/pages/ProfissionaisCockpitPage.jsx:1-736` — template 1:1 (KpiCard `rounded-xl px-5 py-4`, toolbar `mt-5 flex gap-3 flex-wrap`, table `bg-donc-navy`, accordion lazy `openSet`/`detailCache`, CSV/PDF pattern `Blob('\uFEFF'` + `window.print`) — **copiar estrutura literal**
- `src/hooks/useProfissionaisCockpit.js:5` — months via `sync_service_log`, `staleTime 10min/5min`, `enabled !!profile && !!refMonth`
- `src/pages/CockpitsPage.jsx:7` hub + `src/components/settings/SettingsFeatureFlags.jsx:18` + `src/components/layout/Navbar.jsx:13` + `src/App.jsx:205` PrivateRoute/AppLayout
- `src/lib/icons.js` — `Wallet` already exists; never import from `lucide-react` directly
- Existing flags: `profissionais_cockpit` (20260726210000), `financial_data` (20260824000006 `enabled true allowed_roles [admin,manager,finance]`), `cockpit_financeiro` does NOT exist yet
- `supabase/migrations/20260830000001_finance_summary_rpc.sql` — pattern `SECURITY DEFINER SET search_path=public` + `REVOKE anon/public + GRANT authenticated` + `coalesce(get_user_role(),'none') NOT IN (...) → 42501`
- `vite.config.js` injects `__COMMIT_HASH__`, `vercel.json` SPA rewrite `/(.*)->/index.html`, `build.minify false`, `QueryClient staleTime 30s`

**What does NOT exist and needs to be created:**
- Tables `billing_exceptions` + `billing_corrections` + RLS policies + indexes
- Feature flag `cockpit_financeiro` (dedicada, Q6 Sim, `enabled false allowed_roles [admin,manager,finance,sales]`)
- RPCs `get_financeiro_cockpit(text)`, `get_financeiro_detalhe(int,text)`, `get_financeiro_export(text)` with `SECURITY DEFINER` + role guard including `sales`
- `src/hooks/useFinanceiroCockpit.js`
- `src/pages/FinanceiroCockpitPage.jsx` (+ helpers `src/lib/financeiro.js` if extracted)
- Drawer/modal `src/components/financeiro/ExcecaoModal.jsx` + `CorrecaoToggle.jsx`
- Route `/financeiro-cockpit` in `src/App.jsx`
- Card in `CockpitsPage.jsx` + registration in `SettingsFeatureFlags.jsx`
- CRUD de exceções inline (row expanded) + section "Exceções" in `ClientForm.jsx`
- Exports CSV sintético/analítico + PDF with CNPJ/SaaS_ID, delta, retroactive reprocess (Q4b)
- Fix `src/lib/billing.js` for `mode='rateio'` + validation `sum(mods)==base`

### Files to be touched

| File | Change type |
|---|---|
| `supabase/migrations/20260901000001_financeiro_cockpit_core.sql` | **Create** — `billing_exceptions`, `billing_corrections`, flag `cockpit_financeiro`, RLS, RPCs |
| `src/lib/billing.js` | Modify — add `mode='rateio'` param, keep `legacy` default for callers, export `validateRateioSum` |
| `src/lib/financeiro.js` | **Create** — pure helpers `valorCorr`, `billable`, `mrrReal`, `rateioBreakdown`, `isExcecaoVigente` |
| `src/lib/icons.js` | Modify — verify `Wallet` exists, add `Percent`/`BadgePercent` alphabetically if missing (check duplicates) |
| `src/hooks/useFinanceiroCockpit.js` | **Create** — `useQuery(['financeiro_cockpit', refMonth])` + `['financeiro_available_months']` |
| `src/pages/FinanceiroCockpitPage.jsx` | **Create** — KPIs T1-T3 + secondary T4-T7, toolbar, table accordion lazy, skeletons |
| `src/components/financeiro/ExcecaoModal.jsx` | **Create** — Phase 3 CRUD drawer/modal |
| `src/components/financeiro/CorrecaoToggle.jsx` | **Create** — Phase 3 toggle `applied` per `ref_month` |
| `src/components/clients/ClientForm.jsx` | Modify — new section "Exceções" listing `billing_exceptions` by `client_id` |
| `src/pages/CockpitsPage.jsx` | Modify — add card `{ key:'cockpit_financeiro', title:'Financeiro', icon: Icons.Wallet, href:'/financeiro-cockpit', color:'text-donc-verde', bgColor:'bg-donc-verde/10' }` |
| `src/components/settings/SettingsFeatureFlags.jsx` | Modify — register `cockpit_financeiro` in group `Cockpits & Dashboards` |
| `src/App.jsx` | Modify — `import FinanceiroCockpitPage` + `<Route path="/financeiro-cockpit" element={<FinanceiroCockpitPage />} />` inside `PrivateRoute > AppLayout` |
| `src/components/layout/Navbar.jsx` | Modify (optional) — top-nav link gated by `cockpit_financeiro` |
| `docs/sdd/financeiro-cockpit-sdd.md` | **Create** — this SDD |
| `docs/brd/brd-financeiro-cockpit.md` | Modify — v0.3 already validated Q4a/Q4b/Q6 (done) |
| `docs/brd/brd-financeiro-cockpit.html` | Modify — v0.3 validated badges (done) |

---

## 1. Global Definitions

### Feature flags

| Key | Enabled | Allowed roles | Dependency |
|---|---|---|---|
| `financial_data` (existing 20260824000006) | `true` | `admin, manager, finance` | — |
| `cockpit_financeiro` (new, Q6 Sim) | `false` | `admin, manager, finance, sales` | requires `isEnabled('financial_data', role) && isEnabled('cockpit_financeiro', role)` |

Gate in `CockpitsPage.jsx:51` `cockpits.filter(c => isEnabled(c.key, profile.role))` + guard in `FinanceiroCockpitPage.jsx` (`if (!isEnabled(...)) return <Navigate to="/module-unavailable" />`). `manager` read+export only; `sales` write on exceptions (Q4a validated).

### Roles & permissions

| Role | Cockpit read + export | Exceptions write (`INSERT/UPDATE/DELETE`) | Corrections write |
|---|---|---|---|
| `admin` | yes | yes | yes |
| `finance` | yes | yes | yes |
| `sales` | yes | yes (Q4a — equiparado a finance) | yes |
| `manager` | yes | **read-only** | read-only |
| `csm` / `analyst` | no (RPC 42501) | no | no |

### Color tokens / UX (reuse Profissionais)

`bg-bg-primary #ffffff`, `border-border-tertiary #e8e7e3`, `bg-donc-navy #173557` thead, `bg-donc-verde #1D9E75` positive, `bg-donc-red #E24B4A` negative/queda >35%, `bg-donc-amber #BA7517` isento, `text-text-tertiary #888780`, `tabular-nums`, `PageHeader` + `BackButton → /cockpits`.

---

## 2. Design System Reference

**Template 1:1:** `src/pages/ProfissionaisCockpitPage.jsx:1-736` + `docs/ui-patterns.md`

Follow:
- Wrapper `p-6 max-w-7xl mx-auto` + `BackButton` + `PageHeader title="Financeiro · Faturamento" description={monthDisplay}` (`ui-patterns §10 Page Layout`).
- `KpiCard` (`bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4 + w-9 h-9 rounded-lg ${color.bg}` + `text-2xl font-bold tabular-nums`) + delta `text-donc-verde ▲ / text-donc-red ▼` (`§6 Scorecard`).
- Toolbar `mt-5 flex items-center gap-3 flex-wrap` (`select ref_month` + `search pl-9 Icons.Search §20` + `billing_type filter select §21` + `toggle "Só excedentes" §2 Switch` + `CSV dropdown absolute right-0 w-64` + `lastSync ml-auto Icons.Clock`).
- Table `bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden + overflow-x-auto + thead bg-donc-navy text-white text-xs uppercase tracking-wider` + `tbody tr hover:bg-bg-secondary cursor-pointer` + `ChevronIcon svg M3 5l4 4 4-4 rotate 180` (`§1 Table`).
- Row expanded: `colSpan p-0 bg-bg-secondary/20 + barra bg-bg-tertiary/60 border-b border-border-tertiary` + `ViewToggle inline-flex rounded-md border overflow-hidden` (`active bg-donc-navy text-white`) + lazy `supabase.rpc('get_financeiro_detalhe', {p_client_id, p_ref_month})` + `detailCache` + `ViewToggle`.
- Skeletons `animate-pulse h-3 bg-bg-secondary rounded` (`§7`), empty `text-center py-12 text-text-tertiary` (`§8`), error `bg-donc-red/10 border border-donc-red/20` + retry (`§9`).
- Export pattern: `Blob('\uFEFF' + content, {type:'text/csv;charset=utf-8'})` BOM + `URL.createObjectURL` + `window.open + document.write + w.print()` `@media print` (`ProfissionaisCockpitPage.jsx:48,347`).
- Modal/Drawer: `fixed inset-0 z-50 flex items-center justify-center bg-black/20` + `bg-bg-primary border rounded-xl shadow-xl max-w-lg w-full` (`§14 Overlay`) or drawer `fixed right-0 w-[420px] h-full` (`§16`).

---

## 3. Component Tree

```
CockpitsPage (hub /cockpits)
  └── Card "Financeiro" → href="/financeiro-cockpit" (gated isEnabled('cockpit_financeiro') && isEnabled('financial_data'))

FinanceiroCockpitPage (/financeiro-cockpit)
  ├── PageHeader ("Financeiro · Faturamento" + monthDisplay = monthLabel(refMonth))
  ├── KpiCards (grid grid-cols-1 sm:grid-cols-3 gap-3)
  │   ├── T1 MRR mínimo garantido (neutral)
  │   ├── T2 MRR real faturável (positive if excedente>0)
  │   └── T3 Excedente T2−T1 (verde if >0)
  ├── SecondaryStats (grid grid-cols-2 sm:grid-cols-4 gap-3)
  │   ├── T4 clientes acima do piso
  │   ├── T5 isentos no mês
  │   ├── T6 valor em atraso (delay_days>0)
  │   └── T7 renovações 30d
  ├── Toolbar
  │   ├── select ref_month (from sync_service_log service_name='donc-api', default = mês anterior)
  │   ├── search (client_name / CNPJ / SaaS_ID — client-side filtered)
  │   ├── filter billing_type (por_licenca / por_os)
  │   ├── toggle "Só excedentes" (uso > piso)
  │   ├── CSV dropdown (Sintético/Analítico, ViewToggle)
  │   └── lastSync (useQuery ['last_donc_sync', refMonth])
  └── Table (accordion lazy, 1 RPC per first expand)
      └── Row (expandable)
          ├── Collapsed: ▸ | Cliente (CNPJ·SaaS_ID) | Tipo | Piso | Uso | Billable | Valor unit. | MRR mínimo | MRR real | Exceção badge | Δ
          └── Expanded (lazy, bg-bg-secondary/20):
              ├── Barra: ViewToggle + badges (Corrigido IPCA 4,62% + Isento) + CorrecaoToggle (role switch) + CSV/PDF buttons + "+ Exceção"
              ├── Subtable: breakdown por módulo (rateio, % do total, warning if sum != valor_corr ±0.01)
              ├── Exceção vigente (tipo, vigência valid_from→valid_to, reason, created_by/at)
              └── Profissionais/OS list (nome/email/data_ultimo_login/data_ultima_os/codigo_ultima_os) when por_licenca
                  + ExcecaoModal / CorrecaoToggle drawers
```

**State management:** `useQuery` TanStack Query (`staleTime 30s default QueryClient`, cockpit `5min`, months `10min`), `openSet: Set<clientId>`, `detailCache: { [clientId]: {loading, error, data} }`, `exportView: 'geral'|'faturavel'|'isento'`, `csvDropdownOpen`, `exceptionDrawer`, `correctionToggling`.

---

## 4. Data Contracts

### 4.1 Formula per client (Q1+Q2+Q3+Q4b)

```
uso            = por_licenca: count(profissionais_versao WHERE ativo=true)          @ ref_month
                 por_os:       count(profissionais_versao WHERE dataUltimaOS ∈ ref_month)
piso_efetivo   = excecao piso_zerado vigente ? 0 : billing_floor
valor_base_ef  = billing_base_value
valor_corr     = correction vigente && applied==true ? valor_base_ef × (1 + percent/100) : valor_base_ef
valor_unitário = valor_corr   // Q2 rateio: sum(mods) must == valor_corr (breakdown only, not additive)
billable       = max(uso, piso_efetivo)
mrr_minimo     = piso_efetivo × valor_corr
mrr_real_bruto = billable × valor_corr
mrr_real       = isencao_total      → 0
                 desconto_percent   → mrr_real_bruto × (1 − percent/100)
                 valor_reduzido     → billable × valor_reduzido_corr
                 piso_zerado        → already in piso_efetivo
excedente      = mrr_real − mrr_minimo
delta          = coalesce(ROUND((mrr_real_cur − mrr_real_prev)/NULLIF(mrr_real_prev,0)*100,1), NULL)
```

> Q1: always `ref_month` (not last sync). Q2: `src/lib/billing.js:7` fixed to `mode='rateio'` (unitValue = base). Q4b: retroactive `valid_from` in past reprocesses closed `ref_month` and forces re-emissão.

### 4.2 Tables (supabase-guard: migration required)

**Migration:** `supabase migration new financeiro_cockpit_core` → `supabase/migrations/20260901000001_financeiro_cockpit_core.sql`

**`billing_exceptions`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | PK | |
| `client_id` | `int not null FK clients(id) ON DELETE CASCADE` | FK | |
| `type` | `text not null CHECK (type IN ('isencao_total','desconto_percent','valor_reduzido','piso_zerado'))` | CHECK | Q4a |
| `percent` | `numeric null CHECK (percent >0 AND percent <=100)` | conditional | required if `desconto_percent` |
| `reduced_value` | `numeric null CHECK (reduced_value >0)` | conditional | required if `valor_reduzido` |
| `valid_from` | `date not null` | | vigência início |
| `valid_to` | `date not null CHECK (valid_to >= valid_from)` | CHECK | vigência fim |
| `reason` | `text not null CHECK (char_length(reason) >=10)` | | trilha Q4a |
| `created_by` | `uuid FK profiles(id)` | | audit |
| `created_at` | `timestamptz default now()` | | |
| `updated_by` | `uuid FK profiles(id)` | | |
| `updated_at` | `timestamptz` | | trigger `set_updated_at` |

Indexes: `CREATE INDEX idx_billing_exceptions_client ON billing_exceptions(client_id); CREATE INDEX idx_billing_exceptions_vigencia ON billing_exceptions(valid_from, valid_to);`

**`billing_corrections`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `client_id` | `int not null FK clients(id) ON DELETE CASCADE` | PK part | |
| `ref_month` | `text not null CHECK (ref_month ~ '^[0-9]{4}-[0-9]{2}$')` | PK part | YYYY-MM |
| `index` | `text not null CHECK (index IN ('IPCA','IGPM','IGPM/IPCA'))` | | |
| `percent` | `numeric not null CHECK (percent >=0 AND percent <=50)` | | e.g. 4.62 |
| `applied` | `boolean not null default true` | | toggle Q3 |
| `applied_at` | `timestamptz` | | |
| `created_by` | `uuid FK profiles(id)` | | |
| `created_at` | `timestamptz default now()` | | |

PK: `PRIMARY KEY (client_id, ref_month)`

**RLS (pattern `20260625160000` `public.get_user_role()`):**

```sql
ALTER TABLE billing_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_corrections ENABLE ROW LEVEL SECURITY;

-- SELECT: admin,manager,finance,sales
CREATE POLICY billing_exceptions_select ON billing_exceptions FOR SELECT USING (public.get_user_role() IN ('admin','manager','finance','sales'));
CREATE POLICY billing_corrections_select ON billing_corrections FOR SELECT USING (public.get_user_role() IN ('admin','manager','finance','sales'));

-- INSERT/UPDATE/DELETE: admin,finance,sales (Q4a), manager read-only
CREATE POLICY billing_exceptions_write ON billing_exceptions FOR ALL USING (public.get_user_role() IN ('admin','finance','sales')) WITH CHECK (public.get_user_role() IN ('admin','finance','sales'));
CREATE POLICY billing_corrections_write ON billing_corrections FOR ALL USING (public.get_user_role() IN ('admin','finance','sales')) WITH CHECK (public.get_user_role() IN ('admin','finance','sales'));

REVOKE ALL ON TABLE billing_exceptions, billing_corrections FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE billing_exceptions, billing_corrections TO authenticated;
```

**Feature flag (Q6 Sim):**

```sql
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES ('cockpit_financeiro','Cockpit Financeiro — MRR real, excedente e exceções', false, ARRAY['admin','manager','finance','sales'], now())
ON CONFLICT (key) DO UPDATE SET allowed_roles = ARRAY['admin','manager','finance','sales'], updated_at = now();
```

### 4.3 RPCs (SECURITY DEFINER, pattern 20260830000001)

```sql
-- All RPCs: STABLE, SECURITY DEFINER, SET search_path = public
-- Guard: IF coalesce(public.get_user_role(),'none') NOT IN ('admin','manager','finance','sales') THEN RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
-- REVOKE ALL ON FUNCTION ... FROM public, anon; GRANT EXECUTE TO authenticated;

-- 1. get_financeiro_cockpit(p_ref_month text)
-- RETURNS TABLE(
--   client_id int, client_name text, cnpj text, saas_id text,
--   billing_type text, piso int, uso_cur bigint, billable bigint,
--   valor_unit numeric, valor_corr numeric, correction_percent numeric, correction_index text,
--   mrr_min numeric, mrr_real numeric, excedente numeric,
--   excecao_tipo text, excecao_vigencia text, -- e.g. 'isencao_total|2026-01 a 2026-03'
--   mrr_delta numeric, uso_prev bigint, delay_days int, contract_renewal date
-- )
-- Logic:
--   WITH expanded AS (SELECT client_id, instance_id, ref_month,
--     (elem->>'ativo')::boolean AS ativo, (elem->>'dataUltimaOS')::timestamptz AS data_ultima_os
--     FROM client_usage, jsonb_array_elements(profissionais_versao) AS elem WHERE ref_month IN (p_ref_month, p_prev) AND pending=false),
--   counts AS (SELECT client_id, ref_month,
--     COUNT(*) FILTER (WHERE billing_type='por_licenca' AND ativo) AS uso_lic,
--     COUNT(*) FILTER (WHERE billing_type='por_os' AND data_ultima_os >= p_ref_month::date AND data_ultima_os < (p_ref_month::date + interval '1 month')) AS uso_os ...),
--   vigencia AS (SELECT * FROM billing_exceptions WHERE p_ref_month BETWEEN to_char(valid_from,'YYYY-MM') AND to_char(valid_to,'YYYY-MM')),
--   correcao AS (SELECT * FROM billing_corrections WHERE ref_month=p_ref_month AND applied=true)
--   SELECT c.fantasy_name, ... billable = GREATEST(uso, piso_ef), mrr = billable * valor_corr with excecao applied, ORDER BY c.fantasy_name;

-- 2. get_financeiro_detalhe(p_client_id int, p_ref_month text)
-- RETURNS TABLE(modulo_nome text, modulo_valor numeric, modulo_pct numeric, modulo_status text,
--   nome text, email text, ativo boolean, data_ultimo_login text, data_ultima_os text, codigo_ultima_os text,
--   excecao jsonb, correcao jsonb)
-- Same guard; returns rateio breakdown + profissionais/OS list for that client/month.

-- 3. get_financeiro_export(p_ref_month text)
-- RETURNS TABLE(client_id int, client_name text, cnpj text, saas_id text, nome text, email text, ativo boolean, data_ultimo_login text, data_ultima_os text, codigo_ultima_os text, modulo text, valor_rateado numeric, mrr_min numeric, mrr_real numeric, excedente numeric, excecao_tipo text)
-- Union of detalhe for all clients; used by CSV analítico global.
```

### 4.4 Frontend data shapes

```typescript
interface FinanceiroRow {
  client_id: number
  client_name: string
  cnpj: string | null
  saas_id: string | null // contract_saas_id
  billing_type: 'por_licenca' | 'por_os'
  piso: number
  uso_cur: number
  billable: number
  valor_unit: number
  valor_corr: number
  correction_percent: number | null
  correction_index: string | null
  mrr_min: number
  mrr_real: number
  excedente: number
  excecao_tipo: string | null // isencao_total | desconto_percent | valor_reduzido | piso_zerado
  excecao_vigencia: string | null // "2026-01 a 2026-03"
  mrr_delta: number | null
  uso_prev: number | null
  delay_days: number | null
  contract_renewal: string | null
}

interface FinanceiroDetail {
  modulos: { nome: string, valor_rateado: number, pct: number, status: string }[]
  excecao: { id: string, type: string, percent: number | null, reduced_value: number | null, valid_from: string, valid_to: string, reason: string, created_by: string } | null
  correcao: { index: string, percent: number, applied: boolean } | null
  profissionais: { nome: string, email: string, ativo: boolean, data_ultimo_login: string, data_ultima_os: string, codigo_ultima_os: string }[]
}
```

---

## 5. Implementation Phases

### Phase 1 — DB + Flag + RLS + RPCs

**Status:** Not started

**Rationale:** Base de tudo depende do DDL. Sem tabelas, RLS e RPCs não há hook nem UI testável. Isolar DDL em fase própria permite `supabase db push --include-all` + rollback limpo antes de tocar React. Flag dedicada (Q6 Sim) dá kill-switch independente de `financial_data`.

**Scope:**
- Migration core: `billing_exceptions`, `billing_corrections`, flag `cockpit_financeiro`, RLS, 3 RPCs

#### Checklist

- [ ] **Migration:** Create via `supabase migration new financeiro_cockpit_core` → `supabase/migrations/20260901000001_financeiro_cockpit_core.sql`:
  - [ ] `CREATE TABLE billing_exceptions` + `billing_corrections` (§4.2) + indexes `client_id`, `(valid_from, valid_to)`
  - [ ] `CHECK` for `type` enum + `valid_to >= valid_from` + `reason >=10`
  - [ ] `INSERT INTO feature_flags (key, description, enabled, allowed_roles)` → `('cockpit_financeiro','Cockpit Financeiro — MRR real, excedente e exceções', false, ARRAY['admin','manager','finance','sales']) ON CONFLICT DO UPDATE SET allowed_roles = ...`
  - [ ] RLS: `ENABLE RLS` + policies — `SELECT` for `admin,manager,finance,sales`; `ALL` for `admin,finance,sales` (manager read-only, csm/analyst no access) via `public.get_user_role()`
  - [ ] `REVOKE ALL ON TABLE billing_exceptions, billing_corrections FROM anon, public; GRANT SELECT,INSERT,UPDATE,DELETE TO authenticated`
  - [ ] RPCs: `get_financeiro_cockpit(text)`, `get_financeiro_detalhe(int,text)`, `get_financeiro_export(text)` — `SECURITY DEFINER SET search_path=public` + `REVOKE anon/public + GRANT authenticated` + guard `coalesce(get_user_role(),'none') NOT IN ('admin','manager','finance','sales') → 42501`
- [ ] **Fix billing.js (prepare):** Patch `src/lib/billing.js` — add `mode` param, default `mode='legacy'` keeps `base+sum`, `mode='rateio'` returns `base` (Q2), keep callers working
- [ ] **Build:** `npm run build` with no errors
- [ ] **DB push:** `supabase db push --include-all` — verify Dashboard > Table Editor + `select * from feature_flags where key='cockpit_financeiro'`
- [ ] **Commit:** `git add supabase/migrations/20260901000001_financeiro_cockpit_core.sql src/lib/billing.js && git commit -m "feat(financeiro): phase 1 DB + flag + RLS + RPCs" && git push origin main`

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 2 — Hook + Base Page (KPIs, Toolbar, Table Accordion, No Exceptions)

**Status:** Not started

**Rationale:** Depois do DDL, entregar o esqueleto navegável já com dados reais (mesmo sem exceções/correções) valida o fluxo `DONC API → client_usage → RPC → React Query → tabela`. Copiar o padrão lazy do Profissionais isola risco de performance (1 RPC por expand) e permite testar `ref_month` via `sync_service_log` antes de adicionar escrita.

**Scope:**
- Hook `useFinanceiroCockpit`, página `FinanceiroCockpitPage` com KPIs T1-T7, toolbar, tabela accordion lazy, sem CRUD

#### Checklist

- [ ] **Hook:** Create `src/hooks/useFinanceiroCockpit.js`:
  - [ ] `useQuery(['financeiro_available_months'])` — `select ref_month from sync_service_log where service_name='donc-api' and status='success' and ref_month is not null order by ref_month desc` (distinct via Set), `staleTime 10min`
  - [ ] `useQuery(['financeiro_cockpit', refMonth], () => supabase.rpc('get_financeiro_cockpit', {p_ref_month: refMonth}))` — `staleTime 5min`, `enabled !!profile && !!refMonth`
  - [ ] Return `{ months, monthsLoading, data, isLoading, error, refetch }`
- [ ] **Helpers:** Create `src/lib/financeiro.js` — `formatBRL`, `monthLabel`, `deltaDisplay`, `defaultRefMonth` (prev month), `filterByBillingType`, `isExcecaoVigente`
- [ ] **Page:** Create `src/pages/FinanceiroCockpitPage.jsx` (copy `ProfissionaisCockpitPage.jsx:1-736`):
  - [ ] Imports: `useFinanceiroCockpit`, `supabase`, `PageHeader`, `Icons`, `useAuth`, `useFeatureFlags`, `formatBRL`, `ChevronIcon`, `BackButton`
  - [ ] Wrapper `p-6 max-w-7xl mx-auto` + `BackButton → /cockpits` + `PageHeader title="Financeiro · Faturamento" description={monthDisplay}`
  - [ ] KpiCards `grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5` — T1 MRR mínimo, T2 MRR real, T3 Excedente + deltas `ROUND((cur−prev)/prev*100,1)` — highlight `bg-donc-red/10` if queda >35%
  - [ ] Secondary stats T4-T7 (`grid grid-cols-2 sm:grid-cols-4 gap-3`)
  - [ ] Toolbar `mt-5 flex items-center gap-3 flex-wrap`: `select ref_month` (default mês anterior), `input search pl-9 Icons.Search` (filter `client_name/CNPJ/SaaS_ID`), `select billing_type`, `toggle "Só excedentes"` (`useState` + `role="switch"`), `CSV dropdown absolute right-0 w-64`, `lastSync ml-auto Icons.Clock`
  - [ ] Table `bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden` + `thead bg-donc-navy` cols `▸ | Cliente (CNPJ·SaaS_ID) | Tipo | Piso | Uso | Billable | Valor unit. | MRR mínimo | MRR real | Exceção badge | Δ`
  - [ ] Row expand lazy: `supabase.rpc('get_financeiro_detalhe', {p_client_id, p_ref_month})` on first expand, `detailCache` by `clientId`, states `loading animate-spin`, `error + Tentar novamente`, `empty py-12`
  - [ ] Detail shows: breakdown por módulo read-only, profissionais/OS list (reuse `nome/email/data_ultimo_login/data_ultima_os/codigo_ultima_os` when `por_licenca`)
  - [ ] LastSync query `['last_donc_sync', refMonth]` — `sync_service_log finished_at` `toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})`
- [ ] **Routing:** Modify `src/App.jsx` — `import FinanceiroCockpitPage` + `<Route path="/financeiro-cockpit" element={<FinanceiroCockpitPage />} />` inside `PrivateRoute > AppLayout`
- [ ] **Gateway:** Modify `src/pages/CockpitsPage.jsx` — add card `cockpit_financeiro` (gated `isEnabled('cockpit_financeiro', effectiveRole) && isEnabled('financial_data', effectiveRole)`), `src/components/settings/SettingsFeatureFlags.jsx` group `Cockpits & Dashboards`
- [ ] **Icons:** Verify `src/lib/icons.js` — `Wallet`, `Search`, `Clock`, `FileDown`, `Download`, `ChevronDown` exist; add alphabetically if missing, check duplicates
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** `supabase db push --include-all` (if RPC tweak), test on `https://donccx-donccx.vercel.app/financeiro-cockpit` with flag off (gate) and on for `admin/finance/sales`
- [ ] **Commit:** `git add src/hooks/useFinanceiroCockpit.js src/lib/financeiro.js src/pages/FinanceiroCockpitPage.jsx src/App.jsx src/pages/CockpitsPage.jsx src/components/settings/SettingsFeatureFlags.jsx src/lib/icons.js && git commit -m "feat(financeiro): phase 2 hook + base page (KPIs, toolbar, accordion)" && git push origin main`

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 3 — Exceptions & Correction (CRUD, Toggle, Badges, Rateio, Validation sum==base)

**Status:** Not started

**Rationale:** Com a base navegável validada, adicionar escrita é o maior risco de permissão (Q4a sales escrita total vs manager leitura). Isolar CRUD + correção em fase própria permite testar RLS por role sem quebrar exports. Corrigir `billing.js` para rateio (Q2) aqui evita inflar MRR antes dos relatórios auditáveis.

**Scope:**
- CRUD `billing_exceptions` (4 tipos), toggle `billing_corrections.applied`, badges, rateio breakdown + validation `sum(mods)==base ±0.01`, fix `billing.js`

#### Checklist

- [ ] **Helpers:** Update `src/lib/financeiro.js` — `getValorCorr(base, correction)`, `getBillable(uso, pisoEf)`, `getMrrReal(billable, valorCorr, excecao)`, `rateioBreakdown(mods, valorCorr)`, `validateRateio(mods, base) → {ok, diff}` (tolerance 0.01)
- [ ] **Fix billing.js:** Modify `src/lib/billing.js`:
  - [ ] `calculateMRR(base, floor, units, mods, opts={mode:'rateio'})` — if `mode==='rateio'` then `unitValue = base` (mods only breakdown); else `base+sum(mods)` (legacy)
  - [ ] `calculateUnitValue(base, mods, opts)` — same switch
  - [ ] Export `validateRateioSum(mods, base)` for warning
- [ ] **Exception modal:** Create `src/components/financeiro/ExcecaoModal.jsx` (drawer `fixed right-0 w-[420px]` or modal `fixed inset-0 bg-black/20` + `bg-bg-primary border rounded-xl shadow-xl max-w-lg`):
  - [ ] Form: `type select` (`isencao_total | desconto_percent | valor_reduzido | piso_zerado`), `percent/reduced_value` conditional, `valid_from/to date`, `reason textarea >=10`, `created_by/at` audit
  - [ ] Validation: `type` required, `desconto_percent→percent 0-100`, `valor_reduzido→reduced_value>0`, `valid_from <= valid_to`, overlapping vigência warning
  - [ ] Calls: `supabase.from('billing_exceptions').insert/update/delete` — 42501 if role lacks write
  - [ ] List inline on row expanded + `ClientForm.jsx` new section "Exceções" (read `billing_exceptions` by `client_id`)
- [ ] **Correction toggle:** Create `src/components/financeiro/CorrecaoToggle.jsx`:
  - [ ] Inputs `correction_index` (IPCA/IGPM select) + `correction_percent` + toggle `applied` per `(client_id, ref_month)` → `supabase.from('billing_corrections').upsert({client_id, ref_month, index, percent, applied, created_by}, {onConflict:'client_id,ref_month'})`
  - [ ] Default `applied=true` if `contract_renewal` vencido in `ref_month`
  - [ ] Affects `mrr_min`/`mrr_real` realtime + badge `Corrigido IPCA 4,62%` + `role="switch"` (§2)
- [ ] **Page update:** Modify `src/pages/FinanceiroCockpitPage.jsx`:
  - [ ] Badges: `Isento 02/2026` (`bg-donc-amber/10`), `Desconto 10%` (`bg-donc-sky/10`), `Piso zerado`, `Corrigido`
  - [ ] Row highlight `bg-donc-amber/10` if isento, `bg-donc-red/10` if queda >35%
  - [ ] Detail subtables: rateio `Módulo | Valor rateado | % | Status` + warning if `!ok` (`"Soma rateada diverge em R$ diff"`)
  - [ ] Buttons `+ Exceção` / `Editar` gated `canWrite = ['admin','finance','sales'].includes(effectiveRole)` else `toast.error('Ação não permitida', {icon:'⚠️'})` + disabled
  - [ ] Invalidate `['financeiro_cockpit', refMonth]` after mutation + `loadDetail` for Q4b reprocess
- [ ] **ClientForm:** Modify `src/components/clients/ClientForm.jsx` — add section "Exceções" (list + modal)
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** RLS matrix `admin/finance/sales` write ok, `manager` 42501, `csm` forbidden; rateio warning `Core 35 + Chat 24,90 = 59,90` ok
- [ ] **Commit:** `git add src/lib/financeiro.js src/lib/billing.js src/components/financeiro/ExcecaoModal.jsx src/components/financeiro/CorrecaoToggle.jsx src/pages/FinanceiroCockpitPage.jsx src/components/clients/ClientForm.jsx && git commit -m "feat(financeiro): phase 3 exceptions + correction toggle + rateio fix" && git push origin main`

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Exports + Audit (CSV Synthetic/Analytic + PDF with CNPJ/SaaS_ID, Delta, Retroactive Reprocess)

**Status:** Not started

**Rationale:** Exports são o entregável auditável (Q5 CNPJ+SaaS_ID). Só fazem sentido com exceções/correções persistidas (fase 3). Retroatividade Q4b (reprocessa passado, gera delta, exige reemissão) precisa de alerta no export — deixar para esta fase evita bloquear o esqueleto por regra de reemissão.

**Scope:**
- CSV sintético/analítico (toolbar global + individual row), PDF `window.print()`, delta, snapshots por `ref_month`, banner retroativo Q4b

#### Checklist

- [ ] **Exports:** Modify `src/pages/FinanceiroCockpitPage.jsx`:
  - [ ] Toolbar CSV dropdown (mirror Profissionais): `EXPORT_VIEWS = { faturavel: {label:'Faturável'}, isento: {label:'Isento'}, geral: {label:'Geral'} }` default `geral`, `ViewToggle` segmented `inline-flex rounded-md border`
  - [ ] `csvSintetico(rows)` — in-memory `filtered`, cols `Cliente | CNPJ | SaaS_ID | Tipo | Piso | Uso | Billable | Valor unit. | Valor corrigido | Correção (%) | MRR mínimo | MRR real | Excedente | Exceção | Vigência | Δ MRR` — `Blob('\uFEFF'...)` BOM, `text/csv;charset=utf-8`, `URL.createObjectURL`
  - [ ] `csvAnalitico(rows)` — `supabase.rpc('get_financeiro_export', {p_ref_month: refMonth})` global, `detailCache[clientId].data` individual — cols above + `Módulo | Valor rateado | %` + profissionais/OS when `por_licenca`
  - [ ] Filenames: `financeiro-sintetico-${view}-${refMonth}.csv` / `financeiro-analitico-${view}-${refMonth}.csv` / `financeiro-analitico-${view}-${client}-${refMonth}.csv`
  - [ ] `exportPdf(row)` — `<!DOCTYPE html><meta charset="utf-8">` + `div.summary` cards `MRR mínimo | MRR real | Excedente` + badges + table `tabular-nums` + `text-donc-verde/red` — `window.open + document.write + w.print()` `@media print .no-print{display:none}`
  - [ ] Header PDF: `Financeiro · ${client_name} — ${monthLabel(refMonth)} · ${view.label}` + `CNPJ / SaaS_ID` subtitle
  - [ ] `downloadFile(content, filename, mime)` helper with BOM (copy `ProfissionaisCockpitPage.jsx:48`)
- [ ] **Retroatividade Q4b:** Add:
  - [ ] If `billing_exceptions.valid_from` < min exported `ref_month`, compute delta vs snapshot previous `mrr_real` and banner `"Exceção retroativa — relatório ${refMonth} reprocessado (Δ R$ X). Reemissão obrigatória."` + `toast`
  - [ ] RPC include `mrr_real_prev_snapshot` or client-side snapshot in `localStorage` for delta
  - [ ] CSV/PDF include `Δ Retroativo` column when applicable
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** Excel PT-BR opens with BOM, PDF print preview ok, retroactive exception triggers delta banner + re-emissão
- [ ] **Commit:** `git add src/pages/FinanceiroCockpitPage.jsx src/hooks/useFinanceiroCockpit.js && git commit -m "feat(financeiro): phase 4 exports CSV/PDF + retroactive delta" && git push origin main`

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Polish + Deploy + Docs

**Status:** Not started

**Rationale:** Fase de endurecimento antes de habilitar `cockpit_financeiro=true` em produção. Concentra testes por role, tratamento de DONC API fora, empty/loading polidos, e atualização do SDD/Checkpoint.

**Scope:**
- Polish UX, role matrix QA, DONC failure banner, docs, flag enable, Vercel smoke

#### Checklist

- [ ] **Polish:** Modify `src/pages/FinanceiroCockpitPage.jsx`:
  - [ ] Empty `text-center py-12 text-text-tertiary` + skeletons `animate-pulse h-3 bg-bg-secondary` + error `bg-donc-red/10 border` + `Tentar novamente`
  - [ ] Keep `staleTime 5min` + `gcTime 5m`, 1 RPC per expand lazy
  - [ ] `build.minify false`, `__COMMIT_HASH__` visible
- [ ] **DONC failure:** Banner when `sync_service_log.status='failed'` for `refMonth` — `"Sincronização DONC falhou em ${finished_at} — dados de ${refMonth} podem estar desatualizados."` + retry button
- [ ] **Role QA:** Manual matrix — `admin/finance/sales` write ok, `manager` read-only disabled, `csm/analyst` 42501 forbidden + redirect to `/module-unavailable`
- [ ] **Flags:** `update feature_flags set enabled=true where key='cockpit_financeiro'` via SQL (Phase 5 only, after QA)
- [ ] **DB final:** `supabase db push --include-all` (if polish migration) + `supabase functions deploy` (if `donc-api-sync` touched, disable Verify JWT + `node scripts/fix-supabase-urls.js`)
- [ ] **Build & deploy:** `npm run build` — no errors → `git push origin main` → verify Vercel `https://donccx-donccx.vercel.app/financeiro-cockpit`
- [ ] **Docs:** Update this SDD — fill all Implementation Logs, update `## 0. Current System State` + `## 6. Current Checkpoint`, add decisions to table; update `docs/brd` if scope changed
- [ ] **Commit:** `git add docs/sdd/financeiro-cockpit-sdd.md src/pages/FinanceiroCockpitPage.jsx && git commit -m "feat(financeiro): phase 5 polish + deploy + docs" && git push origin main`

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 6. Current Checkpoint

### Production state

- BRD v0.3 validado 01/09/2026 (Q4a sales escrita total, Q4b reprocessa passado, Q6 flag dedicada Sim, Q2 rateio, Q3 correção faseada, Q5 CNPJ+SaaS_ID).
- SDD v0.1 draft criado (this file). Nenhuma fase implementada. Next: Phase 1 `supabase migration new financeiro_cockpit_core`.
- `financial_data` enabled true; `cockpit_financeiro` não existe (criado Phase 1 `enabled false`).

### Architectural decisions

| Decision | Rationale |
|---|---|
| Flag dedicada `cockpit_financeiro` (Q6 Sim) | Kill-switch independente de `financial_data` (gate horizontal). Dependência lógica `cockpit_financeiro ⇒ financial_data`. Validado com diretoria financeira. |
| Sales escrita total (Q4a) | Negociação nasce no comercial; `admin,finance,sales` write, `manager` leitura. Trilha `created_by/at + reason` + RLS compensa governance. |
| Retroatividade reprocessa passado (Q4b) | Exceção retroativa reprocessa `ref_month` fechados, gera delta e exige reemissão — cobra explicitamente relatórios fechados. |
| `billing_exceptions` tabela dedicada (não jsonb) | Vigência temporal `valid_from/to`, RLS granular, trilha auditável, `CHECK valid_to >= valid_from`. Descartado `jsonb exceptions` no BRD §14. |
| `billing_corrections` por `(client_id, ref_month)` | Toggle `applied` persiste por mês; fase 1 manual IPCA/IGPM + percent, fase 2 automática após fonte oficial (BCB/IBGE). |
| Q2 rateio, não soma | `billing_base_value` é total; mods são decomposição informativa. Corrigir `src/lib/billing.js:7` com `mode='rateio'` + `validateRateioSum` ±0,01. |
| Template Profissionais 1:1 | Reuso `KpiCard`, toolbar, `detailCache` lazy (1 RPC/expand), CSV/PDF `BOM + window.print` reduz risco UX e acelera review. |
| `sync_service_log` como fonte de `ref_month` | Evita months legados sem DONC; `client_usage` distinct puro mostra meses sem sync. Pattern `ProfissionaisCockpitPage.jsx:256`. |
| RPCs `SECURITY DEFINER SET search_path=public` + `REVOKE anon` | Mitiga vazamento `CLIENT_SELECT='*'` (gotcha `get_finance_summary` 20260830000001). Guard `coalesce(get_user_role(),'none') NOT IN (...) → 42501`. |
| Exports com BOM `\uFEFF` + `text/csv;charset=utf-8` | Excel PT-BR abre com acentos; padrão `ProfissionaisCockpitPage.jsx:48`. |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `billing.js` soma `base+sum(mods)` diverge de Q2 rateio e infla MRR | Phase 3: `mode='rateio'` (default novo) + `validateRateio()` warning ±R$0,01 na UI; manter `mode='legacy'` para callers antigos. Teste com Exemplo A/B BRD §6. |
| Retroatividade Q4b reprocessa mês fechado sem aviso | Phase 4 banner + delta `mrr_real` vs snapshot + coluna `Δ Retroativo` + reemissão obrigatória. Não fazer reprocessamento silencioso. |
| DONC API fora no cron → `client_usage` desatualizado | Banner `sync_service_log status='failed'` + `lastSync` timestamp + retry manual. RPC retorna `uso` do último `ref_month` com flag `pending`. |
| Exceção com `valid_from > valid_to` ou percent inválido | CHECK constraints DDL (`valid_to >= valid_from`, `percent 0-100`, `reduced_value>0`) + validação modal. |
| Sales cria exceção sem governance | Validado Q4a: RLS write para `sales` + `reason>=10` + `created_by/at` + `audit_log`; manager leitura impede bypass. |
| Performance N+1 com 200+ clientes expands | 1 RPC per expand lazy + `staleTime 5min` + `gcTime 5m`. Query principal única com `jsonb_array_elements` no DB. |
| Correção toggle diverge entre UI e export | Toggle persiste em `billing_corrections.applied`; export RPC join mesma fonte; teste on/off reflete em CSV/PDF realtime. |
| Flag habilitada antes do deploy | Migrations `enabled false` + enable manual só Phase 5 via SQL + `isEnabled` gate em rota e card. |

---

## 8. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js` (import at top + alphabetical entry, check duplicates before adding). `Wallet` already exists.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main` — no branches, no worktrees. Push to `origin main`.
- **No local Supabase:** all DB/functions changes go directly to production (`supabase db push --include-all` + `supabase functions deploy`). No Docker.
- **Build verify:** `npm run build` is mandatory before every `git push` (Vite `build.minify false`, `__COMMIT_HASH__` via `vite.config.js`).
- **Vercel:** SPA rewrite `/(.*) -> /index.html` in `vercel.json`.
- **Financeiro-specific:**
  - `billing.js` rateio — do NOT sum mods to base; `mode='rateio'` returns `base`, mods only for breakdown. Validate `sum(mods)==base ±0,01`.
  - `sync_service_log` is source of truth for `ref_month`, not `client_usage` distinct (avoids legacy months).
  - RLS via `get_user_role()` coalesce guard + `42501` on forbidden; test matrix `admin/finance/sales` write, `manager` read, `csm` 403.
  - After `supabase functions deploy`, "Verify JWT" re-enables — check Dashboard.

---

## 9. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read the relevant content sections before writing any code.
3. Identify the **active phase** via its checklist status (`Not started` → `In progress` → `Complete`).
4. Implement item by item. Mark ✅ when done and verified (`npm run build` after each significant item).
5. At the end of the phase, fill in the **Implementation Log** (date, commit hash, files, summary).
6. Update the **Checkpoint** section with the new state.

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

---

## Validation checklist — before publishing (Sdd-specification § Validation)

- [x] Section 0 reflects actual current state (verified `20260503031721`, `20260726*`, `20260830*` migrations, `ProfissionaisCockpitPage.jsx:1-736`)
- [x] Files to be touched verified to exist (or confirmed not to exist): `src/pages/ProfissionaisCockpitPage.jsx`, `src/hooks/useProfissionaisCockpit.js`, `src/lib/billing.js`, `src/lib/roles.js`, `supabase/migrations/*`
- [x] Data contracts reference real column names (`clients.billing_type/base_value/floor`, `client_usage.profissionais_versao/ref_month`, `sync_service_log.service_name`)
- [x] Color tokens, icon names, component APIs verified (`tailwind.config.js #173557/#1D9E75/#f7f7f5`, `Wallet` in `src/lib/icons.js`)
- [x] Active phase clearly identified (Phase 1 — Not started)
- [x] Gotchas includes project-wide traps (icons, Supabase deploy, branch)
- [x] Language convention followed (English for LLM instructions/data contracts, Portuguese for rationale)

