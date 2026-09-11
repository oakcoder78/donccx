# SDD — Cockpit Financeiro (Finance Cockpit)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the **Cockpit Financeiro** — dashboard que consolida **MRR mínimo garantido vs MRR real por `ref_month`**, incluindo excedente de uso sobre o piso, correção monetária, exceções/negociações auditáveis e adimplência. Fonte: séries contratuais (`contract_series` + `contract_charges` + `billing_os_tiers` + `module_pricing.series_id`) + uso real DONC API (`client_usage.profissionais_versao`) + `billing_exceptions` + `billing_corrections` + `billing_payments`.

It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

Reference BRD: `docs/brd/brd-financeiro-cockpit.md` v0.5 (papéis revisados 2026-09-11, exceções híbridas, `usage_driven`). Documento de validação não-técnico para Financeiro/Vendas: `docs/sdd/financeiro-cockpit-regras.html`. Template 1:1: `docs/archive/superpowers/specs/2026-07-26-profissionais-cockpit-design.md` + `src/pages/ProfissionaisCockpitPage.jsx` (736L).

### How to use this document

1. **Before implementing:** Read this document fully. Understand the data contracts, component tree, and business rules before touching any file.
2. **During implementation:** Follow the checklist for the active phase only. Do not skip ahead.
3. **After implementation:** Fill the Implementation Log for the completed phase before starting the next one.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx-donccx.vercel.app` (Vercel auto-deploy on `git push origin main`)
- **Active phase:** **Phase 0 — docs complete; Phase 1 blocked on Financeiro/Vendas validation** of `docs/sdd/financeiro-cockpit-regras.html` (2026-09-11).

**What already exists related to this work:**

- **Séries contratuais (2026-09-07, em produção):** `contract_series` (`kind original|aditivo|renegociacao`, `billing_start/end`, `due_day`, `auto_renew`, `status ativa|encerrada`, `reason`, plano por série `billing_type`/`billing_base_value`/`billing_floor`, `billing_status ativo|suspenso|nao_bilhetavel`, `billing_suspended_until`, `correction_index`, `contract_signed_date/renewal`) — migrations `20260907000001/2/3`. `clients.*` financeiro é espelho da série original.
- **Charges por série:** `contract_charges` (`series_id`, `kind implantacao|recorrencia`, `mode absolute|percent`, `month_index`, `ref_month` derivado, `due_date`, `installment_group`, `amount`/`percent`, `reason`); UNIQUE `(series_id, kind, month_index, installment_group)`. `billing_os_tiers` PK `(client_id, series_id, tier_order)` (`limit_to`, `fixed_value`, `excess_unit_price`). `module_pricing.series_id` (rateio de soluções por série).
- **MRR helpers puros:** `src/lib/contractRules.js` — `resolveMRR` (:221), `seriesMonthTotal` (:205), `getBaseTotal` (:273), `expandRulesToCharges`, `expandEventuais`, `regroupRecorrencia`, `regroupEventuais`, `renegWindows`, `validateOsTiers`, `formatBRL4`, `TI_TIPO_OPTIONS`.
- **Adimplência (Phase 3.5 do v0.1 — CONCLUÍDA):** `billing_payments` PK `(client_id, series_id, ref_month)`, `status adimplente|inadimplente`, `delay_days`, `paid_at`, `note`, `updated_by/at`; RLS SELECT `admin,manager,finance,sales,csm` / write `admin,finance`; trigger `sync_billing_payments_delay_days` espelha `clients.delay_days`; hooks `useBillingPayments`/`useLatestBillingPayment`/`useBillingPaymentsMutations` (`src/hooks/useBillingPayments.js`); ledger read-only `src/components/clients/tabs/operacional/BillingSchedule.jsx`.
- **Rateio (v0.1 Phase 1/3 — CONCLUÍDO):** `src/lib/billing.js` — `calculateMRR`/`calculateUnitValue` com `opts.mode='legacy'|'rateio'` (`rateio` → `unitValue = base`) + `validateRateio(mods, base, tolerance 0.01)`. Default permanece `legacy`; callers novos usam `rateio`.
- **Form V2 em produção (sem flag):** rotas `/empresas/nova` e `/empresas/:id/editar` → `src/pages/ClientFormPage.jsx` → `src/components/clients/ClientFormContent.jsx` (5 tabs; Contrato por série com buffer/flush; `ClientForm.jsx` **deletado** em `aa87554`).
- **Modelo de acesso (2026-09-07):** `financial_data` (`20260824000006`) = `admin,manager,finance`; `SAFE_CLIENT_COLS` em `src/hooks/useClients.js:7` esconde `mrr/billing_*` de quem não tem a flag; `canSeeFinancial = admin/manager/finance`; leitura global de empresas (`20260903000001`) + sales escreve na carteira (`20260903000002`); só `admin/manager` acessam todas as tabs do detalhe.
- **Infra de cockpits:** `src/pages/CockpitsPage.jsx` (array `cockpits` + `isCockpitEnabled` com fallback `health_cockpit→health`); `src/App.jsx` `<CockpitRoute flagKey="…">` (:128) dentro de `PrivateRoute > AppLayout`; `src/components/settings/SettingsFeatureFlags.jsx` `FLAG_GROUPS`; `src/hooks/useFeatureFlags.js` `isEnabled(key, role)`; `src/pages/ProfissionaisCockpitPage.jsx` (736L, template 1:1); `src/hooks/useProfissionaisCockpit.js` (months via `sync_service_log` service `donc-api`, qualquer status).
- **RPC pattern:** `supabase/migrations/20260830000001_finance_summary_rpc.sql` — `SECURITY DEFINER SET search_path=public` + `REVOKE anon/public + GRANT authenticated` + guard `coalesce(public.get_user_role(),'none')`. `get_finance_summary()` existe em produção.
- **Uso real:** `client_usage` (`client_id`, `ref_month`, `profissionais_versao jsonb`, `pending`) — inalterado; `sync_service_log` (`service_name='donc-api'`) é a fonte dos meses disponíveis.
- **Trigger helper:** `public.set_updated_at()` existe (`20260503031721_remote_schema.sql:369`) — reutilizar em tabelas novas.
- **Icons:** `Wallet`, `Search`, `Clock`, `FileDown`, `Download`, `ArrowLeft` existem em `src/lib/icons.js`; `Percent`/`BadgePercent` **não existem** (adicionar se usados).
- **Docs:** `docs/sdd/financeiro-cockpit-regras.html` (validação Financeiro/Vendas, criado na Phase 0).

**What does NOT exist and needs to be created:**

- `contract_series.usage_driven boolean NOT NULL DEFAULT false` + backfill `(kind='original')` + checkbox no form.
- Tables `billing_exceptions` (híbrida cliente/série) + `billing_corrections` + RLS + indexes.
- Feature flag `cockpit_financeiro` (`enabled false`, `allowed_roles [admin,manager,finance]`).
- RPCs `get_financeiro_cockpit(text)`, `get_financeiro_detalhe(int,text)`, `get_financeiro_export(text)` (`SECURITY DEFINER` + guard `admin,manager,finance`).
- `src/lib/financeiro.js`, `src/hooks/useFinanceiroCockpit.js`, `src/pages/FinanceiroCockpitPage.jsx`.
- `src/components/financeiro/ExcecaoModal.jsx`, `CorrecaoToggle.jsx`, `PaymentToggle.jsx`.
- Route `/financeiro-cockpit` (via `CockpitRoute`) + card no `CockpitsPage.jsx` + registro em `SettingsFeatureFlags.jsx`.
- CRUD inline de exceções (row expandida) + espelho read-only no detalhe (`ClientSubDados`).
- Exports CSV sintético/analítico + PDF com CNPJ/SaaS_ID, delta e reprocessamento retroativo.

### Files to be touched

| File | Change type |
|---|---|
| `docs/sdd/financeiro-cockpit-sdd.md` | Modify — v0.2 (Phase 0, done) |
| `docs/sdd/financeiro-cockpit-regras.html` | **Create** — validação Financeiro/Vendas (Phase 0, done) |
| `docs/brd/brd-financeiro-cockpit.md` | Modify — adendo 0.5 (Phase 0, done) |
| `supabase/migrations/<ts>_financeiro_cockpit_core.sql` | **Create** — `billing_exceptions`, `billing_corrections`, `usage_driven` + backfill, flag, RLS, 3 RPCs |
| `src/lib/financeiro.js` | **Create** — pure helpers |
| `src/lib/contractRules.js` | Modify — `resolveMRR`/preview consideram `usage_driven` (paridade form × cockpit) |
| `src/components/clients/ClientFormContent.jsx` | Modify — checkbox "Cobrar excedente por uso acima do piso" no Plano de cobrança |
| `src/hooks/useContractCharges.js` | Modify — `useContractSeriesMutations` persiste `usage_driven` |
| `src/hooks/useFinanceiroCockpit.js` | **Create** — queries + invalidação |
| `src/pages/FinanceiroCockpitPage.jsx` | **Create** — KPIs T1-T7, toolbar, accordion lazy, subtable por série |
| `src/components/financeiro/ExcecaoModal.jsx` | **Create** — CRUD exceções (escopo cliente/série) |
| `src/components/financeiro/CorrecaoToggle.jsx` | **Create** — correção por `(client_id, ref_month)` |
| `src/components/financeiro/PaymentToggle.jsx` | **Create** — adimplência por `(client_id, series_id, ref_month)` |
| `src/components/clients/tabs/operacional/ClientSubDados.jsx` | Modify — espelho read-only de exceção vigente + adimplência |
| `src/pages/CockpitsPage.jsx` | Modify — card `cockpit_financeiro` |
| `src/components/settings/SettingsFeatureFlags.jsx` | Modify — registrar flag no grupo `Cockpits & Dashboards` |
| `src/App.jsx` | Modify — rota dentro de `<CockpitRoute flagKey="cockpit_financeiro">` |
| `src/lib/icons.js` | Modify — `Percent`/`BadgePercent` se necessário (alfabético, sem duplicatas) |
| `docs/modules/clients.md` | Modify — `usage_driven` + espelho de exceções (após implementação) |
| `docs/brd/brd-financeiro-cockpit.html` | **NotFound** — não existe; HTML de validação vive em `docs/sdd/financeiro-cockpit-regras.html` |

---

## 1. Global Definitions

### Feature flags

| Key | Enabled | Allowed roles | Dependency |
|---|---|---|---|
| `financial_data` (existing 20260824000006) | `true` | `admin, manager, finance` | — |
| `cockpit_financeiro` (new) | `false` | `admin, manager, finance` | requires `isEnabled('financial_data', role) && isEnabled('cockpit_financeiro', role)` |

Gate: card em `CockpitsPage.jsx` + `<CockpitRoute flagKey="cockpit_financeiro">` em `App.jsx` (padrão de 2026-09-02). `manager` read+export only.

> **Mudança 2026-09-11:** `sales` **perde** acesso ao cockpit financeiro (revoga Q4a do BRD v0.3). Motivo: modelo de acesso de 2026-09-07 (`financial_data` sem sales + `SAFE_CLIENT_COLS`); vendas negocia via séries no form de Empresas, não via dashboard financeiro.

### Roles & permissions

| Role | Cockpit read + export | Exceptions write | Corrections write | Payments write |
|---|---|---|---|---|
| `admin` | yes | yes | yes | yes |
| `finance` | yes | yes | yes | yes |
| `manager` | yes | **read-only** | read-only | read-only |
| `sales` | no | no | no | no |
| `csm` / `analyst` | no (RPC 42501) | no | no | no |

### Color tokens / UX (reuse Profissionais)

`bg-bg-primary #ffffff`, `border-border-tertiary #e8e7e3`, `bg-donc-navy #173557` thead, `bg-donc-verde #1D9E75` positive, `bg-donc-red #E24B4A` negative/queda >35%, `bg-donc-amber #BA7517` isento/suspenso, `bg-donc-sky` desconto, `text-text-tertiary #888780`, `tabular-nums`, `PageHeader` + `BackButton → /cockpits`.

---

## 2. Design System Reference

**Template 1:1:** `src/pages/ProfissionaisCockpitPage.jsx` (736L) + `docs/ui-patterns.md`

Follow:
- Wrapper `p-6 max-w-7xl mx-auto` + `BackButton` + `PageHeader title="Financeiro · Faturamento" description={monthDisplay}` (`ui-patterns §10`).
- `KpiCard` (`bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4` + `w-9 h-9 rounded-lg ${color.bg}` + `text-2xl font-bold tabular-nums`) + delta `text-donc-verde ▲ / text-donc-red ▼` (`§6`).
- Toolbar `mt-5 flex items-center gap-3 flex-wrap` (`select ref_month` + `search pl-9 Icons.Search §20` + filter `billing_type` + toggle "Só excedentes" `§2 Switch` + CSV dropdown `absolute right-0 w-64` + `lastSync ml-auto Icons.Clock`).
- Table `bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden + overflow-x-auto + thead bg-donc-navy text-white text-xs uppercase tracking-wider` + `tbody tr hover:bg-bg-secondary cursor-pointer` + `ChevronIcon` (`§1`).
- Row expanded: `colSpan p-0 bg-bg-secondary/20 + barra bg-bg-tertiary/60 border-b` + `ViewToggle inline-flex rounded-md border overflow-hidden` (`active bg-donc-navy text-white`) + lazy `supabase.rpc('get_financeiro_detalhe', {p_client_id, p_ref_month})` + `detailCache`.
- Skeletons `animate-pulse h-3 bg-bg-secondary rounded` (`§7`), empty `text-center py-12 text-text-tertiary` (`§8`), error `bg-donc-red/10 border border-donc-red/20` + retry (`§9`).
- Export pattern: `Blob('\uFEFF' + content, {type:'text/csv;charset=utf-8'})` BOM + `URL.createObjectURL` + `window.open + document.write + w.print()` `@media print` (`ProfissionaisCockpitPage.jsx:48,347`).
- Modal/Drawer: `fixed inset-0 z-50 flex items-center justify-center bg-black/20` + `bg-bg-primary border rounded-xl shadow-xl max-w-lg w-full` (`§14`) ou drawer `fixed right-0 w-[420px] h-full` (`§16`).

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
  │   ├── T5 clientes com exceção vigente no mês
  │   ├── T6 valor em atraso (payment_status='inadimplente')
  │   └── T7 renovações 30d (série ativa, contract_renewal)
  ├── Toolbar
  │   ├── select ref_month (from sync_service_log service_name='donc-api', default = mês anterior)
  │   ├── search (client_name / CNPJ / SaaS_ID — client-side filtered)
  │   ├── filter billing_type (por_licenca / por_os / mista)
  │   ├── toggle "Só excedentes" (T3 > 0)
  │   ├── CSV dropdown (Sintético/Analítico, ViewToggle)
  │   └── lastSync (useQuery ['last_donc_sync', refMonth])
  └── Table (accordion lazy, 1 RPC per first expand)
      └── Row (expandable)
          ├── Collapsed: ▸ | Cliente (CNPJ·SaaS_ID) | Tipo | Piso | Uso | Billable | Valor unit. | MRR mínimo | MRR real | Exceção badge | Adimplência | Δ
          └── Expanded (lazy, bg-bg-secondary/20):
              ├── Barra: ViewToggle + badges (Corrigido IPCA 4,62% · Isento · Suspenso até dd/mm) + CorrecaoToggle + PaymentToggle + CSV/PDF buttons + "+ Exceção"
              ├── Subtable Séries do mês: Série (label·kind) | Plano | Modo (Travado/Base+excedente) | Mínimo | Uso | Excedente | Exceções | Total
              ├── Subtable Rateio por produto (soma vs base da série ativa, warning ±0,01)
              ├── Exceções vigentes (escopo Cliente/Série, tipo, vigência, motivo, created_by/at)
              ├── Adimplência (última fatura do mês: status, delay_days, paid_at)
              └── Profissionais/OS list (nome/email/ativo/data_ultimo_login/data_ultima_os/codigo_ultima_os) when por_licenca
                  + ExcecaoModal / CorrecaoToggle / PaymentToggle drawers
```

**State management:** TanStack Query (`staleTime` cockpit `5min`, months `10min`), `openSet: Set<clientId>`, `detailCache: { [clientId]: {loading, error, data} }`, `exportView: 'geral'|'faturavel'|'isento'`, `csvDropdownOpen`, `exceptionDrawer`, `correctionToggling`, `paymentToggling`.

---

## 4. Data Contracts

### 4.1 Formula per client (series-aware, v0.2)

```
# Séries ativas no mês de competência
series_ativas(ref) = contract_series WHERE client_id=c
                     AND status='ativa'
                     AND billing_start <= last_day(ref)
                     AND (billing_end IS NULL OR billing_end >= first_day(ref))

# Renegociação pausa a original na janela (charges recorrencia em ref)
serie_pausada(s)   = s.kind='original' AND EXISTS renegociacao ativa com recorrencia.ref_month=ref

# Status de cobrança por série
serie_zerada(s)    = s.billing_status='nao_bilhetavel'
                     OR (s.billing_status='suspenso' AND s.billing_suspended_until >= first_day(ref))

# Uso (client_usage do ref, base para a série usage_driven — só a original)
uso                = por_licenca: count(profissionais_versao WHERE ativo=true)
                     por_os:       count(dataUltimaOS ∈ ref_month)
excedente_uso(s)   = por_licenca: max(0, uso − s.billing_floor) × s.billing_base_value
                     por_os tiers: uso > tier.limit_to → (uso − tier.limit_to) × excess_unit_price
                     por_os s/tiers: max(0, uso − floor) × base

# Valor contratado da série no mês
contratado(s)      = regras recorrencia em ref ? seriesMonthTotal(s.charges, ref, baseTotal(s))
                     else baseTotal(s) = floor>0 ? base×floor : base
                     (usage_driven sem regras → contratado = floor × base)

# Modo de cobrança (NOVO)
bruto(s)           = usage_driven=true  ? contratado_com_regra + excedente_uso(s)
                                           # sem regras: contratado = floor×base e bruto = max(uso, floor)×base
                     : contratado(s)        # travado — uso só informativo
                     (por_os com tiers: tier.fixed_value + excedente acima do limite)

# Correção monetária (aplicada antes de exceções)
fator(ref)         = correction(ref).applied ? 1 + percent/100 : 1

# Exceções: série primeiro, cliente depois
mrr_min_serie(s)   = contratado(s) × fator(ref)
mrr_real_serie(s)  = bruto(s) × fator(ref)
                     → aplicar exceções com series_id = s.id
Σseries            = sum(mrr_min_serie), sum(mrr_real_serie)
                     → aplicar exceções com series_id IS NULL (cliente inteiro)

# Exceção aplica em min E real (não cria excedente artificial):
isencao_total      → 0
desconto_percent   → × (1 − percent/100)
valor_reduzido     → substitui pelo valor mensal fechado (min = real = reduced_value × fator)

mrr_min            = min aplicado · mrr_real = real aplicado
excedente          = mrr_real − mrr_min
delta              = coalesce(ROUND((mrr_real_cur − mrr_real_prev)/NULLIF(mrr_real_prev,0)*100,1), NULL)
```

> **Regras:** uso é do cliente (não por série) — se houver **mais de uma série `usage_driven`**, o uso é aplicado apenas à **original** (primeira por `billing_start`); as demais devem ser travadas (o form alerta). `mrr_delta` compara com o mês anterior. `valor_reduzido` = valor mensal fechado do escopo (mudança v0.2; antes era valor unitário × billable).

### 4.2 Tables (supabase-guard: migration required)

**Migration:** `supabase migration new financeiro_cockpit_core` → `supabase/migrations/<timestamp>_financeiro_cockpit_core.sql` (o nome proposto no v0.1 `20260901000001` está obsoleto; já existem migrations `20260907*`).

**`contract_series` — alteration**

```sql
ALTER TABLE public.contract_series
  ADD COLUMN IF NOT EXISTS usage_driven boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.contract_series.usage_driven IS
  'true = cobrança por uso (uso acima do piso compõe o MRR); false = valor travado na série';
UPDATE public.contract_series SET usage_driven = (kind = 'original')
WHERE kind = 'original';  -- backfill: preserva o comportamento do BRD (excedente na original)
```

**`billing_exceptions` (híbrida cliente/série)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | PK | |
| `client_id` | `int not null FK clients(id) ON DELETE CASCADE` | FK | |
| `series_id` | `uuid null FK contract_series(id) ON DELETE CASCADE` | FK | `NULL` = cliente inteiro; set = série |
| `type` | `text not null CHECK (type IN ('isencao_total','desconto_percent','valor_reduzido'))` | CHECK | `piso_zerado` removido em v0.2 (piso é da série) |
| `percent` | `numeric null CHECK (percent > 0 AND percent <= 100)` | conditional | required if `desconto_percent` |
| `reduced_value` | `numeric null CHECK (reduced_value > 0)` | conditional | required if `valor_reduzido`; valor mensal fechado do escopo |
| `valid_from` | `date not null` | | vigência início |
| `valid_to` | `date not null CHECK (valid_to >= valid_from)` | CHECK | vigência fim |
| `reason` | `text not null CHECK (char_length(reason) >= 10)` | | trilha auditável |
| `created_by` | `uuid FK profiles(id)` | | audit |
| `created_at` | `timestamptz default now()` | | |
| `updated_by` | `uuid FK profiles(id)` | | |
| `updated_at` | `timestamptz` | | trigger `public.set_updated_at()` |

Table CHECK: `CHECK (type <> 'desconto_percent' OR percent IS NOT NULL)` + `CHECK (type <> 'valor_reduzido' OR reduced_value IS NOT NULL)`.

Indexes: `CREATE INDEX idx_billing_exceptions_client ON billing_exceptions(client_id); CREATE INDEX idx_billing_exceptions_series ON billing_exceptions(series_id); CREATE INDEX idx_billing_exceptions_vigencia ON billing_exceptions(valid_from, valid_to);`

**`billing_corrections` (por cliente × mês)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `client_id` | `int not null FK clients(id) ON DELETE CASCADE` | PK part | |
| `ref_month` | `text not null CHECK (ref_month ~ '^[0-9]{4}-[0-9]{2}$')` | PK part | YYYY-MM |
| `index` | `text not null CHECK (index IN ('IPCA','IGPM','IGPM/IPCA'))` | | `contract_series.correction_index` fica como metadado do contrato |
| `percent` | `numeric not null CHECK (percent >= 0 AND percent <= 50)` | | e.g. 4.62 |
| `applied` | `boolean not null default true` | | toggle |
| `applied_at` | `timestamptz` | | |
| `created_by` | `uuid FK profiles(id)` | | |
| `created_at` | `timestamptz default now()` | | |

PK: `PRIMARY KEY (client_id, ref_month)`

**RLS (pattern `20260625160000` `public.get_user_role()`):**

```sql
ALTER TABLE billing_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_corrections ENABLE ROW LEVEL SECURITY;

-- SELECT: admin,manager,finance (sales REMOVIDO em 2026-09-11)
CREATE POLICY billing_exceptions_select ON billing_exceptions FOR SELECT
  USING (public.get_user_role() IN ('admin','manager','finance'));
CREATE POLICY billing_corrections_select ON billing_corrections FOR SELECT
  USING (public.get_user_role() IN ('admin','manager','finance'));

-- INSERT/UPDATE/DELETE: admin,finance (manager read-only)
CREATE POLICY billing_exceptions_write ON billing_exceptions FOR ALL
  USING (public.get_user_role() IN ('admin','finance'))
  WITH CHECK (public.get_user_role() IN ('admin','finance'));
CREATE POLICY billing_corrections_write ON billing_corrections FOR ALL
  USING (public.get_user_role() IN ('admin','finance'))
  WITH CHECK (public.get_user_role() IN ('admin','finance'));

REVOKE ALL ON TABLE billing_exceptions, billing_corrections FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE billing_exceptions, billing_corrections TO authenticated;
```

**Feature flag:**

```sql
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES ('cockpit_financeiro','Cockpit Financeiro — MRR real, excedente, exceções e adimplência', false, ARRAY['admin','manager','finance'], now())
ON CONFLICT (key) DO UPDATE SET allowed_roles = ARRAY['admin','manager','finance'], updated_at = now();
```

### 4.3 RPCs (SECURITY DEFINER, pattern 20260830000001)

```sql
-- All RPCs: STABLE, SECURITY DEFINER, SET search_path = public
-- Guard: IF coalesce(public.get_user_role(),'none') NOT IN ('admin','manager','finance') THEN
--          RAISE EXCEPTION 'forbidden' USING errcode='42501'; END IF;
-- REVOKE ALL ON FUNCTION ... FROM public, anon; GRANT EXECUTE TO authenticated;

-- 1. get_financeiro_cockpit(p_ref_month text)
-- RETURNS TABLE(
--   client_id int, client_name text, cnpj text, saas_id text, billing_type text,
--   billing_floor int, uso_cur bigint, uso_prev bigint, billable bigint,
--   valor_unit numeric, correction_percent numeric, correction_index text,
--   mrr_min numeric, mrr_real numeric, excedente numeric,
--   series_count int, series_kinds text,   -- ex: 'original+aditivo'
--   excecao_desc text, excecao_escopo text,
--   payment_status text, delay_days int, paid_at date,
--   mrr_delta numeric, contract_renewal date
-- )
-- Logic (CTEs):
--   usage_counts: client_usage + jsonb_array_elements(profissionais_versao) para ref e prev
--   series: contract_series ativas em ref + billing_status/suspended_until + pausa por renegociação
--   charges: contract_charges recorrencia por (series_id, ref_month) → seriesMonthTotal
--   tiers: billing_os_tiers por series_id para valor por faixa
--   eval: aplica usage_driven (uso só na original), correction e exceções (série → cliente)
--   payments: LEFT JOIN billing_payments (client_id, series_id, ref_month) → status/delay_days
--   SELECT c.fantasy_name, ... ORDER BY c.fantasy_name;

-- 2. get_financeiro_detalhe(p_client_id int, p_ref_month text)
-- RETURNS TABLE(
--   series jsonb,     -- [{series_id,label,kind,billing_type,mode,min,uso,excedente,excecoes,total}]
--   modulos jsonb,    -- [{nome, valor_rateado, pct, status, soma_ok, diff}]
--   excecoes jsonb,   -- [{id,escopo,type,percent,reduced_value,valid_from,valid_to,reason,created_by,created_at}]
--   correcao jsonb,   -- {index,percent,applied} | null
--   payment jsonb,    -- {series_id,status,delay_days,paid_at}[] do mês
--   profissionais jsonb  -- [{nome,email,ativo,data_ultimo_login,data_ultima_os,codigo_ultima_os}]
-- )
-- Same guard; 1 RPC por expand (lazy).

-- 3. get_financeiro_export(p_ref_month text)
-- RETURNS TABLE per (client × series) row for CSV analítico:
--   client_name, cnpj, saas_id, series_label, series_kind, billing_type, mode,
--   billing_floor, uso, billable, valor_unit, correction_percent, mrr_min, mrr_real,
--   excedente, excecao_desc, excecao_escopo, payment_status, delay_days,
--   nome, email, ativo, data_ultimo_login, data_ultima_os, codigo_ultima_os
```

### 4.4 Frontend data shapes

```typescript
interface FinanceiroRow {
  client_id: number
  client_name: string
  cnpj: string | null
  saas_id: string | null
  billing_type: 'por_licenca' | 'por_os' | 'mista'
  billing_floor: number
  uso_cur: number
  uso_prev: number | null
  billable: number
  valor_unit: number
  correction_percent: number | null
  correction_index: string | null
  mrr_min: number
  mrr_real: number
  excedente: number
  series_count: number
  series_kinds: string | null
  excecao_desc: string | null
  excecao_escopo: 'cliente' | 'serie' | null
  payment_status: 'adimplente' | 'inadimplente' | null
  delay_days: number | null
  paid_at: string | null
  mrr_delta: number | null
  contract_renewal: string | null
}

interface FinanceiroSeriesDetail {
  series_id: string
  label: string
  kind: 'original' | 'aditivo' | 'renegociacao'
  billing_type: 'por_licenca' | 'por_os'
  mode: 'travado' | 'base_excedente'
  min: number
  uso: number
  excedente: number
  excecoes: number
  total: number
}

interface FinanceiroDetail {
  series: FinanceiroSeriesDetail[]
  modulos: { nome: string, valor_rateado: number, pct: number, status: string, soma_ok: boolean, diff: number }[]
  excecoes: { id: string, escopo: 'cliente' | 'serie', type: string, percent: number | null, reduced_value: number | null, valid_from: string, valid_to: string, reason: string, created_by: string, created_at: string }[]
  correcao: { index: string, percent: number, applied: boolean } | null
  payment: { series_id: string, status: string, delay_days: number, paid_at: string | null }[]
  profissionais: { nome: string, email: string, ativo: boolean, data_ultimo_login: string, data_ultima_os: string, codigo_ultima_os: string }[]
}
```

---

## 5. Implementation Phases

### Phase 0 — Docs + validation gate (HTML)

**Status:** Complete (docs) — awaiting Financeiro/Vendas validation.

**Rationale:** As mudanças de séries (2026-09-07) e de acesso (2026-09-07) invalidaram premissas do SDD v0.1. Antes de escrever DDL, alinhar regras com Financeiro e Vendas num documento não-técnico evita migration errada e retrabalho.

**Scope:** SDD v0.2, adendo BRD 0.5, HTML de regras para validação.

#### Checklist

- [x] **SDD v0.2:** rewrite `docs/sdd/financeiro-cockpit-sdd.md` (séries, `usage_driven`, exceções híbridas, papéis, fases)
- [x] **BRD:** addendum 0.5 em `docs/brd/brd-financeiro-cockpit.md` + linha no Histórico
- [x] **HTML rules doc:** `docs/sdd/financeiro-cockpit-regras.html` (não-técnico, Financeiro + Vendas, exemplos A–F, 10 seções + perguntas de validação)
- [ ] **Validation gate:** Financeiro/Vendas respondem as perguntas do HTML → ajustes voltam para este SDD antes da Phase 1
- [x] **Index:** `index-updater` — linha do BRD no `.agents/docs-index.md` (`0.4 → 0.5` + HTML de validação)

#### Implementation Log (Phase 0)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-09-11 | (pending) | `docs/sdd/financeiro-cockpit-sdd.md`, `docs/sdd/financeiro-cockpit-regras.html`, `docs/brd/brd-financeiro-cockpit.md` | v0.2 série-aware + HTML de validação + adendo BRD |

---

### Phase 1 — DB core + flag + RLS + RPCs + usage_driven

**Status:** Not started (blocked on Phase 0 validation gate)

**Rationale:** Base de tudo depende do DDL. Isolar DDL permite `supabase db push --include-all` + rollback limpo antes de tocar React. Flag dedicada dá kill-switch independente de `financial_data`.

**Scope:**
- Migration `financeiro_cockpit_core`: `usage_driven` + backfill, `billing_exceptions`, `billing_corrections`, flag, RLS, 3 RPCs series-aware

#### Checklist

- [ ] **Migration:** `supabase migration new financeiro_cockpit_core` → `supabase/migrations/<ts>_financeiro_cockpit_core.sql`:
  - [ ] `ALTER TABLE contract_series ADD COLUMN usage_driven boolean NOT NULL DEFAULT false` + `COMMENT` + backfill `kind='original'` (§4.2)
  - [ ] `CREATE TABLE billing_exceptions` (híbrida, 3 tipos) + CHECKs + indexes `client_id`, `series_id`, `(valid_from, valid_to)` + trigger `set_updated_at`
  - [ ] `CREATE TABLE billing_corrections` + PK `(client_id, ref_month)` + CHECK `index`/`percent`
  - [ ] Flag `cockpit_financeiro` `enabled false` `[admin,manager,finance]` com `ON CONFLICT DO UPDATE`
  - [ ] RLS: SELECT `admin,manager,finance`; ALL `admin,finance`; `REVOKE anon/public` + `GRANT authenticated`
  - [ ] RPCs 1-3 (§4.3) — `SECURITY DEFINER SET search_path=public` + guard `admin,manager,finance` + `REVOKE anon/public GRANT authenticated`
  - [ ] RPC precisa refletir `usage_driven`, pausa de renegociação, tiers por série, exceções série→cliente e `billing_payments` PK tripla (T6)
- [ ] **Build:** `npm run build` with no errors
- [ ] **DB push:** `supabase db push --include-all` — verify `billing_exceptions`/`billing_corrections` + flag + `contract_series.usage_driven` + `select get_financeiro_cockpit('2026-08')` (service role)
- [ ] **Commit:** `git add supabase/migrations/<ts>_financeiro_cockpit_core.sql && git commit -m "feat(financeiro): phase 1 DB core (series-aware) + flag + RPCs" && git push origin main`

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 2 — Hook + Base Page + usage_driven no form

**Status:** Not started

**Rationale:** Depois do DDL, o esqueleto navegável com dados reais valida o fluxo `DONC API → client_usage → séries → RPC → React Query → tabela`. O checkbox `usage_driven` no form mantém a paridade entre o MRR mostrado no contrato e o cockpit (evita divergência de números).

**Scope:**
- `src/lib/financeiro.js`, `useFinanceiroCockpit`, `FinanceiroCockpitPage` (KPIs T1-T7, toolbar, accordion lazy), rota/card/flag, checkbox `usage_driven` + `resolveMRR` parity

#### Checklist

- [ ] **Helpers:** Create `src/lib/financeiro.js` — `formatBRL`, `monthLabel`, `deltaDisplay`, `defaultRefMonth` (prev month), `filterByBillingType`, `isExcecaoVigente`, `seriesModeLabel`, `tierValue` (espelho puro da §4.1)
- [ ] **Hook:** Create `src/hooks/useFinanceiroCockpit.js`:
  - [ ] `useQuery(['financeiro_available_months'])` — `sync_service_log` service `donc-api`, distinct `ref_month` desc, `staleTime 10min` (mesmo padrão do `useProfissionaisCockpit.js`)
  - [ ] `useQuery(['financeiro_cockpit', refMonth], () => supabase.rpc('get_financeiro_cockpit', {p_ref_month: refMonth}))` — `staleTime 5min`, `enabled !!profile && !!refMonth`
  - [ ] Return `{ months, monthsLoading, data, isLoading, error, refetch }`
- [ ] **Page:** Create `src/pages/FinanceiroCockpitPage.jsx` (copy `ProfissionaisCockpitPage.jsx` 1:1):
  - [ ] Wrapper `p-6 max-w-7xl mx-auto` + `BackButton → /cockpits` + `PageHeader title="Financeiro · Faturamento" description={monthDisplay}`
  - [ ] KpiCards T1-T3 + deltas (`mrr_delta`), highlight `bg-donc-red/10` se queda >35%
  - [ ] Secondary T4-T7 (`grid grid-cols-2 sm:grid-cols-4 gap-3`)
  - [ ] Toolbar (ref_month default mês anterior, search, filter `billing_type`, toggle "Só excedentes", CSV dropdown, lastSync)
  - [ ] Table com colunas collapsed (§3) + row highlight isento (`bg-donc-amber/10`) / inadimplente (`bg-donc-red/10`)
  - [ ] Row expand lazy `get_financeiro_detalhe` + `detailCache` + subtable Séries do mês + rateio + exceções + adimplência + profissionais/OS
  - [ ] LastSync `['last_donc_sync', refMonth]` (`finished_at` `toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})`)
- [ ] **Routing/Gateway:** `src/App.jsx` `<Route element={<CockpitRoute flagKey="cockpit_financeiro" />}><Route path="/financeiro-cockpit" element={<FinanceiroCockpitPage />} /></Route>`; `CockpitsPage.jsx` card `{ key:'cockpit_financeiro', title:'Financeiro', icon: Icons.Wallet, href:'/financeiro-cockpit', color:'text-donc-verde', bgColor:'bg-donc-verde/10' }`; `SettingsFeatureFlags.jsx` grupo `Cockpits & Dashboards`
- [ ] **Icons:** `src/lib/icons.js` — add `Percent` (e `BadgePercent` se usado) alfabético, check duplicates
- [ ] **usage_driven (form parity):** Modify `src/components/clients/ClientFormContent.jsx` (Plano de cobrança) — checkbox "Cobrar excedente por uso acima do piso" (default por kind: original=true, aditivo/renegociacao=false); `src/hooks/useContractCharges.js` persiste `usage_driven`; `src/lib/contractRules.js` `resolveMRR`/preview consideram o flag (sem regras: base+excedente → `floor×base` mínimo com excedente destacado)
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** test on `https://donccx-donccx.vercel.app/financeiro-cockpit` with flag off (redirect) and on for `admin/finance`; conferir MRR do cockpit × preview do form para 1 cliente com excedente
- [ ] **Commit:** `git add src/lib/financeiro.js src/hooks/useFinanceiroCockpit.js src/pages/FinanceiroCockpitPage.jsx src/App.jsx src/pages/CockpitsPage.jsx src/components/settings/SettingsFeatureFlags.jsx src/lib/icons.js src/components/clients/ClientFormContent.jsx src/hooks/useContractCharges.js src/lib/contractRules.js && git commit -m "feat(financeiro): phase 2 hook + base page + usage_driven form parity" && git push origin main`

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 3 — Exceptions & Correction & Payment (CRUD, Toggle, Badges, Mirror)

**Status:** Not started

**Rationale:** Com a base navegável validada, adicionar escrita é o maior risco de permissão (admin/finance write, manager read-only). Isolar CRUD + correção + adimplência permite testar RLS por role sem quebrar exports.

**Scope:**
- CRUD `billing_exceptions` (escopo cliente/série), toggle `billing_corrections.applied`, `PaymentToggle` adimplência, badges, espelho no detalhe

#### Checklist

- [ ] **Exception modal:** Create `src/components/financeiro/ExcecaoModal.jsx` (drawer `fixed right-0 w-[420px]` ou modal `max-w-lg`):
  - [ ] Campos: escopo (`Todas as séries` / série específica via select de `contract_series` ativas), `type` (3 tipos), `percent`/`reduced_value` condicionais, `valid_from/to`, `reason textarea >=10`
  - [ ] Validação: `valid_from <= valid_to`, `percent 1-100`, `reduced_value > 0`, aviso de vigência sobreposta mesmo escopo+tipo
  - [ ] Calls: `supabase.from('billing_exceptions').insert/update/delete` (42501 se role sem write) + audit `created_by/updated_by`
  - [ ] Lista inline no row expandido + botões `+ Exceção` / `Editar` gated `canWrite = ['admin','finance'].includes(effectiveRole)` (senão disabled + toast `Ação não permitida`)
- [ ] **Correction toggle:** Create `src/components/financeiro/CorrecaoToggle.jsx`:
  - [ ] `correction_index` (IPCA/IGPM), `correction_percent`, toggle `applied` por `(client_id, ref_month)` → `upsert` `{client_id, ref_month, index, percent, applied, created_by}`, `onConflict 'client_id,ref_month'`
  - [ ] Badge `Corrigido IPCA 4,62%` + `role="switch"`; afeta `mrr_min`/`mrr_real` realtime; invalidate `['financeiro_cockpit', refMonth]`
- [ ] **Payment toggle:** Create `src/components/financeiro/PaymentToggle.jsx`:
  - [ ] Por `(client_id, series_id, ref_month)`: `status adimplente|inadimplente`, `delay_days`, `paid_at`, `note` → `upsert` `onConflict 'client_id,series_id,ref_month'`; write `admin,finance` (RLS existente)
  - [ ] Badge collapsed `Adimplente` / `Inadimplente 12d`; T6 soma `mrr_real` das faturas inadimplentes
  - [ ] Reusar `useBillingPaymentsMutations` (`src/hooks/useBillingPayments.js`) quando possível
- [ ] **Page update:** Modify `FinanceiroCockpitPage.jsx` — badges `Isento`, `Desconto 10%`, `Valor reduzido`, `Corrigido`, `Suspenso até`; row highlight; warning de rateio (`validateRateio` ±0,01); invalidate após mutações
- [ ] **Mirror:** Modify `src/components/clients/tabs/operacional/ClientSubDados.jsx` — card read-only "Exceção vigente" (tipo, escopo, vigência, motivo) + "Adimplência" latest (se ainda não existir via `BillingSchedule`)
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** RLS matrix — `admin/finance` write ok, `manager` read-only (42501 no write), `sales/csm` sem acesso; exceção série "aditivo 100% off" zera só a série; correção on/off reflete em KPI e export
- [ ] **Commit:** `git add src/components/financeiro/ src/pages/FinanceiroCockpitPage.jsx src/components/clients/tabs/operacional/ClientSubDados.jsx && git commit -m "feat(financeiro): phase 3 exceptions + correction + payment toggles" && git push origin main`

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Exports + Audit

**Status:** Not started

**Rationale:** Exports são o entregável auditável (CNPJ+SaaS_ID). Só fazem sentido com exceções/correções persistidas. Retroatividade exige alerta de reemissão.

**Scope:**
- CSV sintético/analítico (toolbar + row), PDF `window.print()`, delta, banner retroativo

#### Checklist

- [ ] **CSV:** `EXPORT_VIEWS = { faturavel, isento, geral }` (`ViewToggle` segmented); `csvSintetico(rows)` colunas `Cliente | CNPJ | SaaS_ID | Tipo | Piso | Uso | Billable | Valor unit. | Correção (%) | MRR mínimo | MRR real | Excedente | Exceção | Escopo | Adimplência | Δ MRR`; `csvAnalitico` via `supabase.rpc('get_financeiro_export')` (global) + `detailCache` (row) com `Série | Modo | Módulo | Valor rateado | %` + profissionais/OS when `por_licenca`
- [ ] **Download:** `downloadFile(content, filename, mime)` com BOM `\uFEFF` (copy `ProfissionaisCockpitPage.jsx:48`); filenames `financeiro-sintetico-${view}-${refMonth}.csv` / `financeiro-analitico-...`
- [ ] **PDF:** `exportPdf(row)` `<!DOCTYPE html><meta charset="utf-8">` + cards `MRR mínimo | MRR real | Excedente` + badges + table `tabular-nums` + header `Financeiro · ${client_name} — ${monthLabel(refMonth)} · ${view.label}` + `CNPJ / SaaS_ID`; `window.open + document.write + w.print()` `@media print .no-print{display:none}`
- [ ] **Retroatividade:** se `billing_exceptions.valid_from` < mês exportado, banner `"Exceção retroativa — relatório ${refMonth} reprocessado (Δ R$ X). Reemissão obrigatória."` + `toast` + coluna `Δ Retroativo`
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** Excel PT-BR abre com BOM, PDF ok, retroativo dispara delta + reemissão
- [ ] **Commit:** `git add src/pages/FinanceiroCockpitPage.jsx src/hooks/useFinanceiroCockpit.js && git commit -m "feat(financeiro): phase 4 exports CSV/PDF + retroactive delta" && git push origin main`

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Polish + Deploy + Docs + Flag enable

**Status:** Not started

**Rationale:** Endurecimento antes de habilitar `cockpit_financeiro=true` em produção: QA por role, DONC API fora, empty/loading, docs.

**Scope:**
- Polish UX, role QA, DONC failure banner, `docs/modules/clients.md`, docs do SDD, enable flag, smoke Vercel

#### Checklist

- [ ] **Polish:** empty `text-center py-12 text-text-tertiary` + skeletons + error `bg-donc-red/10 border` + `Tentar novamente`; manter lazy 1 RPC/expand
- [ ] **DONC failure:** banner when `sync_service_log.status='failed'` para `refMonth` — `"Sincronização DONC falhou em ${finished_at} — dados de ${refMonth} podem estar desatualizados."` + retry
- [ ] **Role QA:** `admin/finance` write ok, `manager` read-only, `sales/csm/analyst` 42501 + redirect `/module-unavailable`
- [ ] **Docs:** `docs/modules/clients.md` — `usage_driven` no Contrato + espelho de exceções/adimplência no Operacional; `index-updater` se novo domínio
- [ ] **Flags:** `update feature_flags set enabled=true where key='cockpit_financeiro'` (só após QA)
- [ ] **Build & deploy:** `npm run build` — no errors → `git push origin main` → smoke `https://donccx-donccx.vercel.app/financeiro-cockpit`
- [ ] **Docs SDD:** fill all Implementation Logs + §0 + §6 + Histórico
- [ ] **Commit:** `git add docs/sdd/financeiro-cockpit-sdd.md docs/modules/clients.md && git commit -m "feat(financeiro): phase 5 polish + enable + docs" && git push origin main`

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 6. Current Checkpoint

### Production state

- Séries contratuais em produção (2026-09-07) com tiers/mods/charges por série; form V2 único (`ClientFormContent.jsx`, `ClientForm.jsx` removido).
- `billing_payments` (adimplência) em produção com PK `(client_id, series_id, ref_month)` + trigger de `delay_days`; ledger `BillingSchedule.jsx` no detalhe.
- `billing.js` com `mode='rateio'` + `validateRateio` (default `legacy`).
- `financial_data` enabled (`admin,manager,finance`); `cockpit_financeiro` **não existe** (criado na Phase 1, `enabled false`).
- `billing_exceptions`/`billing_corrections`/`usage_driven` **não existem** — Phase 1 pendente de validação do HTML.
- SDD v0.2 + adendo BRD 0.5 + `docs/sdd/financeiro-cockpit-regras.html` (2026-09-11) aguardando retorno de Financeiro/Vendas.

### Architectural decisions

| Decision | Rationale |
|---|---|
| Cockpit restrito a `admin/manager/finance` (2026-09-11) | Modelo de acesso de 2026-09-07 (`financial_data` sem sales + `SAFE_CLIENT_COLS`); revoga Q4a (sales escrevia exceções). Vendas negocia via séries no form, não no dashboard financeiro. |
| Exceções **híbridas** `series_id NULL` = cliente, set = série | Cobre "10% off geral" (sem criar fatura nova) e "aditivo Rotas 100% off" (zera só a série). Sales-level obrigatório forçaria renegociação (nova fatura) para desconto global; client-level puro não zera uma série. |
| 3 tipos (`isencao_total`, `desconto_percent`, `valor_reduzido`); `piso_zerado` removido | Piso agora é por série (`billing_floor`); "sem piso, cobra consumo" = `floor=0` + `usage_driven`. `isencao_total` cobre mês zerado, que a régua (`amount>0`/`percent>0`) não expressa. |
| `contract_series.usage_driven` (2026-09-11) | Reconcilia contratado × uso: `true` = excedente acima do piso compõe o MRR (com ou sem ramp); `false` = travado, uso informativo. Backfill `(kind='original')` preserva o BRD. |
| Uso aplicado só à série original quando há múltiplas `usage_driven` | `client_usage` é do cliente (não por série); aplicar em N séries duplicaria excedente. Aditivos/renegociações são travados por default. |
| `valor_reduzido` = valor mensal fechado do escopo | Substitui o cálculo do escopo (cliente ou série). v0.2 mudou de "valor unitário × billable" (ambíguo com séries). |
| Correções por `(client_id, ref_month)` | Finance marca o mês; `contract_series.correction_index` fica como metadado do contrato. Fase 2 (futuro) usa fonte oficial (BCB/IBGE). |
| Adimplência por `(client_id, series_id, ref_month)` no cockpit | Já implementada; 2 faturas no mesmo mês (séries diferentes). Trigger espelha `clients.delay_days` para `health_financeiro` sem alterar `healthScore.js`. |
| Exceções aplicam em `mrr_min` E `mrr_real` | Evita excedente artificial (desconto reduziria só o real e inflaria T3). |
| RPCs `SECURITY DEFINER SET search_path=public` + guard `admin,manager,finance` | Mitiga vazamento `CLIENT_SELECT='*'`; `fetch(`, etc. padrão `get_finance_summary`. |
| HTML de validação em `docs/sdd/` | Mesmo diretório do SDD (decisão 2026-09-11); não-técnico para Financeiro/Vendas, gate da Phase 1. |
| Template Profissionais 1:1 | Reuso `KpiCard`, toolbar, `detailCache` lazy (1 RPC/expand), CSV/PDF `BOM + window.print` reduz risco UX. |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Form e cockpit divergirem no MRR (regras × usage_driven) | `resolveMRR`/preview atualizados na Phase 2 com o flag; verificação cruzada cockpit × preview do form por cliente. |
| Duplo desconto (renegociação + exceção cliente) | Ordem documentada série→cliente; exceção cliente aplica após a soma; UI mostra as duas linhas; validar com Financeiro no HTML. |
| Múltiplas séries `usage_driven` duplicando excedente | Regra: uso só na original; form alerta se outra série for `usage_driven`; RPC ignora uso nas demais. |
| Financeiro/Vendas não validarem o HTML a tempo | Phase 1 bloqueada; se necessário, flag `cockpit_financeiro` desligada garante inofensividade. |
| `billing_exceptions` com sobreposição de vigência | Validação no modal + warning; regra mesma `(client,series,type)` sem overlap (app-level na v1). |
| Retroatividade reprocessa mês fechado sem aviso | Phase 4 banner + delta + `Δ Retroativo` + reemissão obrigatória. |
| DONC API fora no cron → uso desatualizado | Banner `sync_service_log status='failed'` + `lastSync` + retry; `client_usage.pending` sinalizado. |
| Performance N+1 com 200+ clientes | 1 RPC per expand lazy + `staleTime 5min`; query principal única com CTEs no DB. |
| RLS incorreta liberando financeiro a sales/csm | Guard nas RPCs + policies sem sales; QA matrix na Phase 3/5. |
| `usage_driven` backfill errado na original | `UPDATE ... SET usage_driven=(kind='original')`; aditivo/renegociação `false`; conferir `select kind, usage_driven, count(*) from contract_series group by 1,2`. |
| Flag habilitada antes do deploy | Migration `enabled false` + enable manual só Phase 5 + gates de card/rota. |

---

## 8. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js` (import at top + alphabetical entry, check duplicates). `Wallet` existe; `Percent` não.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main` — no branches, no worktrees. Push to `origin main`.
- **No local Supabase:** all DB/functions changes go directly to production (`supabase db push --include-all` + `supabase functions deploy`). No Docker.
- **Build verify:** `npm run build` is mandatory before every `git push` (Vite `build.minify false`, `__COMMIT_HASH__` via `vite.config.js`).
- **Vercel:** SPA rewrite `/(.*) -> /index.html` in `vercel.json`.
- **Financeiro-specific:**
  - Billing is **per series**: do NOT read `clients.billing_*` as source of truth — resolve via `contract_series` (`resolveMRR`, `seriesMonthTotal`); `clients.*` é espelho da original.
  - `contract_charges` has `series_id` + `ref_month` (join direct by `ref_month`); `billing_os_tiers` PK `(client_id, series_id, tier_order)`; `billing_payments` PK `(client_id, series_id, ref_month)`.
  - `usage_driven` (`contract_series`) — uso só na original; aditivo/renegociação travados por default.
  - Exceções: `series_id NULL` = cliente; set = série; aplicar série → soma → cliente; nunca criar `piso_zerado`.
  - `sync_service_log` é a fonte de `ref_month`, não `client_usage` distinct.
  - RLS via `get_user_role()` + `42501`; matrix `admin/finance` write, `manager` read, `sales/csm` 403.
  - `ClientForm.jsx` **não existe** — qualquer referência é o `ClientFormContent.jsx` (rotas V2 sem flag).
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

## Histórico

| Versão | Data | Autor | Mudança |
|---|---|---|---|
| 0.1 | 2026-09-01 | DoncCX Hub | Draft inicial pós-BRD v0.3 (contrato flat `clients.billing_*`, Fase 3.5 adimplência, Q4a sales write) |
| 0.2 | 2026-09-11 | DoncCX Hub | Reescrita série-aware: `contract_series`/`contract_charges`/`billing_os_tiers`; `usage_driven`; exceções híbridas (3 tipos, `piso_zerado` removido); papéis `admin/manager/finance` (sales fora); correções client-month; Fase 3.5/billing.js marcados concluídos; HTML de validação Financeiro/Vendas; fases reordenadas com gate de validação |

---

## Validation checklist — before publishing (Sdd-specification § Validation)

- [x] Section 0 reflects actual current state (verified migrations `20260907*`, `20260902000004`, production `information_schema`/`pg_policies`, `contractRules.js`, `billing.js`, `useClients.js`, `App.jsx`, `CockpitsPage.jsx`)
- [x] Files to be touched verified to exist (or confirmed not to exist): `ClientFormContent.jsx` (exists), `ClientForm.jsx` (deleted `aa87554`), `billing_exceptions`/`billing_corrections` (absent), `usage_driven` (absent), `Percent` icon (absent)
- [x] Data contracts reference real column names (`contract_series.billing_*`, `contract_charges.series_id/ref_month/due_date`, `billing_os_tiers.series_id`, `module_pricing.series_id`, `billing_payments` PK tripla)
- [x] Color tokens, icon names, component APIs verified (`tailwind.config.js #173557/#1D9E75/#f7f7f5`, `Wallet` in `src/lib/icons.js`, `CockpitRoute` in `App.jsx:128`)
- [x] Active phase clearly identified (Phase 0 docs complete; Phase 1 blocked on validation)
- [x] Gotchas includes project-wide traps (icons, Supabase deploy, branch)
- [x] Language convention followed (English for LLM instructions/data contracts, Portuguese for rationale)
