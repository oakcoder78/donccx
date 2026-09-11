# SDD — Cockpit Financeiro (Finance Cockpit)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the **Cockpit Financeiro** — dashboard que consolida **MRR mínimo garantido vs MRR real por `ref_month`**, incluindo excedente de uso sobre o piso, exceções/negociações auditáveis e adimplência. Fonte: séries contratuais (`contract_series` + `contract_charges` + `billing_os_tiers` + `module_pricing.series_id`) + uso real DONC API (`client_usage.profissionais_versao`) + `billing_exceptions` + `billing_payments`.

It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

Reference BRD: `docs/brd/brd-financeiro-cockpit.md` v0.6 (ata de validação 2026-09-11). Documento de regras: `docs/sdd/financeiro-cockpit-regras.html` v1.1 (validado; base do Help do cockpit na Phase 5). Template 1:1: `docs/archive/superpowers/specs/2026-07-26-profissionais-cockpit-design.md` + `src/pages/ProfissionaisCockpitPage.jsx` (736L).

### How to use this document

1. **Before implementing:** Read this document fully. Understand the data contracts, component tree, and business rules before touching any file.
2. **During implementation:** Follow the checklist for the active phase only. Do not skip ahead.
3. **After implementation:** Fill the Implementation Log for the completed phase before starting the next one.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx-donccx.vercel.app` (Vercel auto-deploy on `git push origin main`)
- **Active phase:** **Phase 3 — ready to start** (Phase 2 complete 2026-09-11; Phase 1 DB applied).

**What already exists related to this work:**

- **Séries contratuais (2026-09-07, em produção):** `contract_series` (`kind original|aditivo|renegociacao`, `billing_start/end`, `due_day`, `auto_renew`, `status ativa|encerrada`, `reason`, plano por série `billing_type`/`billing_base_value`/`billing_floor`, `billing_status ativo|suspenso|nao_bilhetavel`, `billing_suspended_until`, `correction_index`, `contract_signed_date/renewal`) — migrations `20260907000001/2/3`. `clients.*` financeiro é espelho da série original.
- **Charges por série:** `contract_charges` (`series_id`, `kind implantacao|recorrencia`, `mode absolute|percent`, `month_index`, `ref_month` derivado, `due_date`, `installment_group`, `amount`/`percent`, `reason`); UNIQUE `(series_id, kind, month_index, installment_group)`. `billing_os_tiers` PK `(client_id, series_id, tier_order)` (`limit_to`, `fixed_value`, `excess_unit_price`). `module_pricing.series_id` (rateio de soluções por série).
- **MRR helpers puros:** `src/lib/contractRules.js` — `resolveMRR` (:221), `seriesMonthTotal` (:205), `getBaseTotal` (:273), `expandRulesToCharges`, `expandEventuais`, `regroupRecorrencia`, `regroupEventuais`, `renegWindows`, `validateOsTiers`, `formatBRL4`, `TI_TIPO_OPTIONS`.
- **Adimplência (Phase 3.5 do v0.1 — CONCLUÍDA):** `billing_payments` PK `(client_id, series_id, ref_month)`, `status adimplente|inadimplente`, `delay_days`, `paid_at`, `note`, `updated_by/at`; RLS SELECT `admin,manager,finance,sales,csm` / write `admin,finance`; trigger `sync_billing_payments_delay_days` espelha `clients.delay_days`; hooks `useBillingPayments`/`useLatestBillingPayment`/`useBillingPaymentsMutations` (`src/hooks/useBillingPayments.js`); ledger read-only `src/components/clients/tabs/operacional/BillingSchedule.jsx`.
- **Rateio (v0.1 Phase 1/3 — CONCLUÍDO):** `src/lib/billing.js` — `calculateMRR`/`calculateUnitValue` com `opts.mode='legacy'|'rateio'` (`rateio` → `unitValue = base`) + `validateRateio(mods, base, tolerance 0.01)`. Default permanece `legacy`; callers novos usam `rateio`.
- **Form V2 em produção (sem flag):** rotas `/empresas/nova` e `/empresas/:id/editar` → `src/pages/ClientFormPage.jsx` → `src/components/clients/ClientFormContent.jsx` (5 tabs; Contrato por série com buffer/flush; `ClientForm.jsx` **deletado** em `aa87554`). `useClient` default `includeFinancial=true`; sales edita contrato da carteira via RLS `20260903000002`.
- **Modelo de acesso (2026-09-07):** `financial_data` (`20260824000006`) = `admin,manager,finance`; `SAFE_CLIENT_COLS` em `src/hooks/useClients.js:7` esconde `mrr/billing_*` de quem não tem a flag; `canSeeFinancial = admin/manager/finance`; leitura global de empresas (`20260903000001`) + sales escreve na carteira (`20260903000002`); só `admin/manager` acessam todas as tabs do detalhe.
- **Infra de cockpits:** `src/pages/CockpitsPage.jsx` (array `cockpits` + `isCockpitEnabled` com fallback `health_cockpit→health`); `src/App.jsx` `<CockpitRoute flagKey="…">` (:128) dentro de `PrivateRoute > AppLayout`; `src/components/settings/SettingsFeatureFlags.jsx` `FLAG_GROUPS`; `src/hooks/useFeatureFlags.js` `isEnabled(key, role)`; `src/pages/ProfissionaisCockpitPage.jsx` (736L, template 1:1); `src/hooks/useProfissionaisCockpit.js` (months via `sync_service_log` service `donc-api`, qualquer status).
- **RPC pattern:** `supabase/migrations/20260830000001_finance_summary_rpc.sql` — `SECURITY DEFINER SET search_path=public` + `REVOKE anon/public + GRANT authenticated` + guard `coalesce(public.get_user_role(),'none')`. `get_finance_summary()` existe em produção.
- **Uso real:** `client_usage` (`client_id`, `ref_month`, `profissionais_versao jsonb`, `pending`) — inalterado; `sync_service_log` (`service_name='donc-api'`) é a fonte dos meses disponíveis.
- **Trigger helper:** `public.set_updated_at()` existe (`20260503031721_remote_schema.sql:369`) — reutilizar em tabelas novas.
- **Icons:** `Wallet`, `Search`, `Clock`, `FileDown`, `Download`, `ArrowLeft` existem em `src/lib/icons.js`; `Percent`/`BadgePercent` **não existem** (adicionar se usados).
- **Validação de regras (2026-09-11):** `docs/sdd/financeiro-cockpit-regras.html` v1.1 validado por Financeiro/Vendas; respostas na ata do BRD 0.6 e nas decisões §6.
- **Fase 1 aplicada (2026-09-11):** migration `20260911191431_financeiro_cockpit_core.sql` — `contract_series.usage_driven` (backfill 26/26 originals) + `correction_anniversary/percent/rule`; `billing_exceptions` (4 tipos; RLS select `admin,manager,finance,sales`, write `admin,finance`; trigger `set_updated_at`); flag `cockpit_financeiro` (`false`, `admin,manager,finance`); RPCs `get_financeiro_cockpit`/`get_financeiro_detalhe`/`get_financeiro_export` + engine privado `_financeiro_series_month`. Smoke `2026-08`: 16 clientes, MRR real R$ 122.692,83, excedente R$ 16.587,36; guard `csm` → 42501; matemática conferida (Multiloja 260 × R$ 58,50 = R$ 15.210,00; Koerich 400 × R$ 40,00 = R$ 16.000,00).
- **Fase 2 implementada (2026-09-11):** `src/lib/financeiro.js` + `src/hooks/useFinanceiroCockpit.js` (`useFinanceiroCockpit`/`useFinanceiroDetalhe`/`useLastDoncSync`) + `src/pages/FinanceiroCockpitPage.jsx` (KPIs T1-T7, toolbar, accordion lazy por mount, banner Q9, CSV sintético); rota `<CockpitRoute flagKey="cockpit_financeiro">` + card no hub + registro em `SettingsFeatureFlags`; `Icons.Percent`; form V2 com `usage_driven` + reajuste (aniversário/regra/percentual) + renovação assistida; `resolveMRR` com paridade (usage_driven sem regras = piso × valor, 0 sem piso). Flag permanece `false` (QA com flag on na Phase 5).

**What does NOT exist and needs to be created:**

- CRUD de exceções (`ExcecaoModal`) + `PaymentToggle` adimplência + espelhos no detalhe (**Phase 3**).
- Exports CSV analítico/PDF (**Phase 4**) e Help do cockpit (**Phase 5**).
- `src/lib/financeiro.js`, `src/hooks/useFinanceiroCockpit.js`, `src/pages/FinanceiroCockpitPage.jsx`.
- `src/components/financeiro/ExcecaoModal.jsx`, `PaymentToggle.jsx`.
- Route `/financeiro-cockpit` (via `CockpitRoute`) + card no `CockpitsPage.jsx` + registro em `SettingsFeatureFlags.jsx`.
- CRUD inline de exceções (row expandida) + espelho read-only no detalhe (`ClientSubDados`) + card read-only para sales na aba Contrato.
- Exports CSV sintético/analítico + PDF com CNPJ/SaaS_ID (sem retroatividade).
- Help do cockpit (Phase 5): adaptar `docs/sdd/financeiro-cockpit-regras.html` v1.1 → `public/help/financeiro-regras.html` + botão de ajuda na página.

### Files to be touched

| File | Change type |
|---|---|
| `docs/sdd/financeiro-cockpit-sdd.md` | Modify — v0.3 (Phase 0.1, done) |
| `docs/sdd/financeiro-cockpit-regras.html` | Modify — v1.1 validado (base do Help) (Phase 0.1, done) |
| `docs/brd/brd-financeiro-cockpit.md` | Modify — adendo 0.6 ata de validação (Phase 0.1, done) |
| `supabase/migrations/20260911191431_financeiro_cockpit_core.sql` | **Create (done Phase 1)** — engine `_financeiro_series_month` + `billing_exceptions` (4 tipos) + `usage_driven`/`correction_*` + flag + 3 RPCs |
| `src/lib/financeiro.js` | **Create (done Phase 2)** — pure helpers |
| `src/lib/contractRules.js` | Modify (done Phase 2) — `resolveMRR` com paridade `usage_driven` |
| `src/components/clients/ClientFormContent.jsx` | Modify (done Phase 2) — checkbox "Cobrar excedente por uso acima do piso" + bloco de reajuste + renovação assistida |
| `src/hooks/useContractCharges.js` | Modify (done Phase 2) — persiste `usage_driven`, `correction_anniversary`, `correction_percent`, `correction_rule` |
| `src/hooks/useFinanceiroCockpit.js` | **Create (done Phase 2)** — queries + lazy detail + last sync |
| `src/pages/FinanceiroCockpitPage.jsx` | **Create (done Phase 2)** — KPIs T1-T7, toolbar, accordion lazy, subtable por série (Help na Phase 5) |
| `src/components/financeiro/ExcecaoModal.jsx` | **Create** — CRUD exceções (escopo cliente/série; 4 tipos) |
| `src/components/financeiro/PaymentToggle.jsx` | **Create** — adimplência por `(client_id, series_id, ref_month)` |
| `src/components/clients/tabs/operacional/ClientSubDados.jsx` | Modify — espelho read-only de exceção vigente + adimplência |
| `src/pages/CockpitsPage.jsx` | Modify (done Phase 2) — card `cockpit_financeiro` |
| `src/components/settings/SettingsFeatureFlags.jsx` | Modify (done Phase 2) — flag no grupo `Cockpits & Dashboards` |
| `src/App.jsx` | Modify (done Phase 2) — rota `<CockpitRoute flagKey="cockpit_financeiro">` |
| `src/lib/icons.js` | Modify (done Phase 2) — `Percent` (alfabético, sem duplicatas) |
| `public/help/financeiro-regras.html` | **Create (Phase 5)** — cópia servida do documento de regras validado (Help do cockpit) |
| `docs/modules/clients.md` | Modify — `usage_driven` + reajuste por série + espelho de exceções (após implementação) |

---

## 1. Global Definitions

### Feature flags

| Key | Enabled | Allowed roles | Dependency |
|---|---|---|---|
| `financial_data` (existing 20260824000006) | `true` | `admin, manager, finance` | — |
| `cockpit_financeiro` (new) | `false` | `admin, manager, finance` | requires `isEnabled('financial_data', role) && isEnabled('cockpit_financeiro', role)` |

Gate: card em `CockpitsPage.jsx` + `<CockpitRoute flagKey="cockpit_financeiro">` em `App.jsx` (padrão de 2026-09-02). `manager` read+export only.

> **Validado 2026-09-11 (Q3):** `sales` **não** acessa o cockpit financeiro (revoga Q4a do BRD v0.3). Em compensação (Q8), sales **lê** as exceções da carteira na aba Contrato do form (`billing_exceptions` SELECT RLS inclui `sales`).

### Roles & permissions

| Role | Cockpit read + export | Exceptions write | Payments write | Exceptions read (client sheet) |
|---|---|---|---|---|
| `admin` | yes | yes | yes | yes |
| `finance` | yes | yes | yes | yes |
| `manager` | yes | **read-only** | read-only | yes |
| `sales` | no | no | no | yes (carteira) |
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
  ├── PageHeader ("Financeiro · Faturamento" + monthDisplay + botão "?" Ajuda → public/help/financeiro-regras.html, Phase 5)
  ├── KpiCards (grid grid-cols-1 sm:grid-cols-3 gap-3)
  │   ├── T1 MRR mínimo garantido (neutral)
  │   ├── T2 MRR real faturável (positive if excedente>0)
  │   └── T3 Excedente T2−T1 (verde if >0)
  ├── SecondaryStats (grid grid-cols-2 sm:grid-cols-4 gap-3)
  │   ├── T4 clientes acima do piso
  │   ├── T5 clientes com exceção vigente no mês
  │   ├── T6 valor em atraso (payment_status='inadimplente')
  │   └── T7 renovações/reajustes 30d (contract_renewal/correction_anniversary)
  ├── Toolbar
  │   ├── select ref_month (from sync_service_log service_name='donc-api', default = mês anterior)
  │   ├── search (client_name / CNPJ / SaaS_ID — client-side filtered)
  │   ├── filter billing_type (por_licenca / por_os / mista)
  │   ├── toggle "Só excedentes" (T3 > 0)
  │   ├── CSV dropdown (Sintético/Analítico, ViewToggle)
  │   └── lastSync (useQuery ['last_donc_sync', refMonth]; banner de falha → suporte DoncCX)
  └── Table (accordion lazy, 1 RPC per first expand)
      └── Row (expandable)
          ├── Collapsed: ▸ | Cliente (CNPJ·SaaS_ID) | Tipo | Piso | Uso | Billable | Valor unit. | MRR mínimo | MRR real | Exceção badge | Adimplência | Δ
          └── Expanded (lazy, bg-bg-secondary/20):
              ├── Barra: ViewToggle + badges (Isento · Suspenso até dd/mm · Reajuste 4,62% em 03/2026) + PaymentToggle + CSV/PDF buttons + "+ Exceção"
              ├── Subtable Séries do mês: Série (label·kind) | Plano | Modo (Travado/Base+excedente) | Mínimo | Uso | Excedente | Exceções | Total
              ├── Subtable Rateio por produto (soma vs base da série ativa, warning ±0,01)
              ├── Exceções vigentes (escopo Cliente/Série, tipo, vigência, motivo, created_by/at) — fatura zerada aparece R$ 0,00 com selo
              ├── Adimplência (última fatura do mês: status, delay_days, paid_at)
              └── Profissionais/OS list (nome/email/ativo/data_ultimo_login/data_ultima_os/codigo_ultima_os) when por_licenca
                  + ExcecaoModal / PaymentToggle drawers
```

**State management:** TanStack Query (`staleTime` cockpit `5min`, months `10min`), `openSet: Set<clientId>`, `detailCache: { [clientId]: {loading, error, data} }`, `exportView: 'geral'|'faturavel'|'isento'`, `csvDropdownOpen`, `exceptionDrawer`, `paymentToggling`.

---

## 4. Data Contracts

### 4.1 Formula per client (series-aware, v0.3)

```
# Séries ativas no mês de competência
series_ativas(ref) = contract_series WHERE client_id=c
                     AND status='ativa'
                     AND billing_start <= last_day(ref)
                     AND (billing_end IS NULL OR billing_end >= first_day(ref))

# Renegociação pausa a original na janela (charges recorrencia em ref)
serie_pausada(s)   = s.kind='original' AND EXISTS renegociacao ativa com recorrencia.ref_month=ref

# Status de cobrança por série (fatura zerada APARECE com R$ 0,00 + selo — Q4)
serie_zerada(s)    = s.billing_status='nao_bilhetavel'
                     OR (s.billing_status='suspenso' AND s.billing_suspended_until >= first_day(ref))

# Uso (client_usage do ref; aplicado só à série usage_driven — original)
uso                = por_licenca: count(profissionais_versao WHERE ativo=true)
                     por_os:       count(dataUltimaOS ∈ ref_month)

# Valor unitário da série (reajuste anual NÃO é calculado aqui — o valor já vem corrigido na série)
unit(s)            = s.billing_base_value − desconto_unidade_vigente(s)   # exceção desconto_unidade
excedente_uso(s)   = por_licenca: max(0, uso − s.billing_floor) × unit(s)
                     por_os tiers: uso > tier.limit_to → (uso − tier.limit_to) × excess_unit_price
                     por_os s/tiers: max(0, uso − floor) × unit(s)

# Valor contratado da série no mês
contratado(s)      = regras recorrencia em ref ? seriesMonthTotal(s.charges, ref, getBaseTotal(s))
                     else getBaseTotal(s) = floor>0 ? base×floor : base

# Modo de cobrança
bruto(s)           = usage_driven=true  ? contratado_com_regra + excedente_uso(s)
                                           # sem regras: bruto = max(uso, floor) × unit(s)
                     : contratado(s)        # travado — uso só informativo
                     (por_os com tiers: tier.fixed_value + excedente acima do limite)

# Exceções: série primeiro, cliente depois (aplicam em min E real)
mrr_min_serie(s)   = contratado(s)
mrr_real_serie(s)  = bruto(s)
                     → aplicar exceções com series_id = s.id
Σseries            = sum(mrr_min_serie), sum(mrr_real_serie)
                     → aplicar exceções com series_id IS NULL (cliente inteiro)

# 4 tipos de exceção:
isencao_total      → 0
desconto_percent   → × (1 − percent/100)
valor_reduzido     → substitui pelo valor mensal fechado (min = real = reduced_value)
desconto_unidade   → reduz o valor unitário (base − unit_discount); piso e excedente permanecem
                     (só faz sentido em série usage_driven; validado no modal)

mrr_min            = min aplicado · mrr_real = real aplicado
excedente          = mrr_real − mrr_min
delta              = coalesce(ROUND((mrr_real_cur − mrr_real_prev)/NULLIF(mrr_real_prev,0)*100,1), NULL)
```

> **Reajuste (validado 2026-09-11):** anual, no aniversário da série (default `contract_signed_date`, configurável via `correction_anniversary`), aplicado sobre `billing_base_value` antes de descontos/exceções; o percentual é **editável** (`correction_percent`, cobre X% fixo, índice IPCA/IGP-M ou o maior via `correction_rule`); **sem retroatividade** — a renovação é criada como nova série com o valor já corrigido e `billing_start` a partir do mês seguinte; meses passados nunca são recalculados. O cockpit apenas exibe o valor da série + selo informativo.
> **Sem retroatividade (Q7.3 + validação):** exceções também "ignoram o passado" — `valid_from` não pode ser anterior ao mês corrente na criação; nenhum fluxo de reemissão/complemento.
> **Regras:** uso é do cliente — se houver mais de uma série `usage_driven`, o uso é aplicado apenas à **original** (primeira por `billing_start`); o form alerta. `valor_reduzido` = valor mensal fechado do escopo.

### 4.2 Tables (supabase-guard: migration required)

**Migration:** `supabase migration new financeiro_cockpit_core` → `supabase/migrations/<timestamp>_financeiro_cockpit_core.sql` (o nome proposto no v0.1 `20260901000001` está obsoleto; já existem migrations `20260907*`).

**`contract_series` — alterations**

```sql
ALTER TABLE public.contract_series
  ADD COLUMN IF NOT EXISTS usage_driven boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_anniversary date,           -- default app: contract_signed_date
  ADD COLUMN IF NOT EXISTS correction_percent numeric
    CHECK (correction_percent IS NULL OR (correction_percent > 0 AND correction_percent <= 50)),
  ADD COLUMN IF NOT EXISTS correction_rule text
    CHECK (correction_rule IS NULL OR correction_rule IN ('percentual','indice','maior'));
COMMENT ON COLUMN public.contract_series.usage_driven IS
  'true = cobrança por uso (uso acima do piso compõe o MRR); false = valor travado na série';
COMMENT ON COLUMN public.contract_series.correction_percent IS
  'Percentual do reajuste anual (editável: X% fixo, índice ou maior). Aplicado na renovação, sem retroatividade';
UPDATE public.contract_series SET usage_driven = (kind = 'original')
WHERE kind = 'original';  -- backfill: preserva o comportamento do BRD (excedente na original)
```

**`billing_exceptions` (híbrida cliente/série, 4 tipos)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | PK | |
| `client_id` | `int not null FK clients(id) ON DELETE CASCADE` | FK | |
| `series_id` | `uuid null FK contract_series(id) ON DELETE CASCADE` | FK | `NULL` = cliente inteiro; set = série |
| `type` | `text not null CHECK (type IN ('isencao_total','desconto_percent','valor_reduzido','desconto_unidade'))` | CHECK | 4 tipos (Q5 + Q10) |
| `percent` | `numeric null CHECK (percent > 0 AND percent <= 100)` | conditional | required if `desconto_percent` |
| `reduced_value` | `numeric null CHECK (reduced_value > 0)` | conditional | required if `valor_reduzido`; valor mensal fechado do escopo |
| `unit_discount` | `numeric null CHECK (unit_discount > 0)` | conditional | required if `desconto_unidade`; R$ off por licença/OS |
| `valid_from` | `date not null` | | vigência início; >= mês corrente na criação (sem retroativo) |
| `valid_to` | `date not null CHECK (valid_to >= valid_from)` | CHECK | vigência fim |
| `reason` | `text not null CHECK (char_length(reason) >= 10)` | | trilha auditável |
| `created_by` | `uuid FK profiles(id)` | | audit |
| `created_at` | `timestamptz default now()` | | |
| `updated_by` | `uuid FK profiles(id)` | | |
| `updated_at` | `timestamptz` | | trigger `public.set_updated_at()` |

Table CHECKs: `CHECK (type <> 'desconto_percent' OR percent IS NOT NULL)` + `CHECK (type <> 'valor_reduzido' OR reduced_value IS NOT NULL)` + `CHECK (type <> 'desconto_unidade' OR unit_discount IS NOT NULL)`.

Indexes: `CREATE INDEX idx_billing_exceptions_client ON billing_exceptions(client_id); CREATE INDEX idx_billing_exceptions_series ON billing_exceptions(series_id); CREATE INDEX idx_billing_exceptions_vigencia ON billing_exceptions(valid_from, valid_to);`

**RLS (pattern `20260625160000` `public.get_user_role()`):**

```sql
ALTER TABLE billing_exceptions ENABLE ROW LEVEL SECURITY;

-- SELECT: admin,manager,finance + sales (Q8 — espelho na ficha da carteira)
CREATE POLICY billing_exceptions_select ON billing_exceptions FOR SELECT
  USING (public.get_user_role() IN ('admin','manager','finance','sales'));

-- INSERT/UPDATE/DELETE: admin,finance (manager read-only)
CREATE POLICY billing_exceptions_write ON billing_exceptions FOR ALL
  USING (public.get_user_role() IN ('admin','finance'))
  WITH CHECK (public.get_user_role() IN ('admin','finance'));

REVOKE ALL ON TABLE billing_exceptions FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE billing_exceptions TO authenticated;
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
--   valor_unit numeric, correction_index text, correction_percent numeric,
--   mrr_min numeric, mrr_real numeric, excedente numeric,
--   series_count int, series_kinds text,   -- ex: 'original+aditivo'
--   excecao_desc text, excecao_escopo text,
--   payment_status text, delay_days int, paid_at date,
--   mrr_delta numeric, contract_renewal date, correction_anniversary date
-- )
-- Logic (CTEs):
--   usage_counts: client_usage + jsonb_array_elements(profissionais_versao) para ref e prev
--   series: contract_series ativas em ref + billing_status/suspended_until + pausa por renegociação
--   charges: contract_charges recorrencia por (series_id, ref_month) → seriesMonthTotal
--   tiers: billing_os_tiers por series_id para valor por faixa
--   eval: aplica usage_driven (uso só na original), exceções 4 tipos (série → cliente);
--         valor da série já inclui reajuste aplicado na renovação (sem cálculo de índice)
--   payments: LEFT JOIN billing_payments (client_id, series_id, ref_month) → status/delay_days
--   SELECT c.fantasy_name, ... ORDER BY c.fantasy_name;

-- 2. get_financeiro_detalhe(p_client_id int, p_ref_month text)
-- RETURNS TABLE(
--   series jsonb,     -- [{series_id,label,kind,billing_type,mode,min,uso,excedente,excecoes,total}]
--   modulos jsonb,    -- [{nome, valor_rateado, pct, status, soma_ok, diff}]
--   excecoes jsonb,   -- [{id,escopo,type,percent,reduced_value,unit_discount,valid_from,valid_to,reason,created_by,created_at}]
--   payment jsonb,    -- {series_id,status,delay_days,paid_at}[] do mês
--   profissionais jsonb  -- [{nome,email,ativo,data_ultimo_login,data_ultima_os,codigo_ultima_os}]
-- )
-- Same guard; 1 RPC por expand (lazy).

-- 3. get_financeiro_export(p_ref_month text)
-- RETURNS TABLE per (client × series) row for CSV analítico:
--   client_name, cnpj, saas_id, series_label, series_kind, billing_type, mode,
--   billing_floor, uso, billable, valor_unit, mrr_min, mrr_real,
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
  correction_index: string | null
  correction_percent: number | null
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
  correction_anniversary: string | null
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
  excecoes: {
    id: string, escopo: 'cliente' | 'serie', type: string,
    percent: number | null, reduced_value: number | null, unit_discount: number | null,
    valid_from: string, valid_to: string, reason: string, created_by: string, created_at: string
  }[]
  payment: { series_id: string, status: string, delay_days: number, paid_at: string | null }[]
  profissionais: { nome: string, email: string, ativo: boolean, data_ultimo_login: string, data_ultima_os: string, codigo_ultima_os: string }[]
}
```

---

## 5. Implementation Phases

### Phase 0 — Docs + validation gate (HTML)

**Status:** Complete (2026-09-11) — validado por Financeiro/Vendas.

**Rationale:** As mudanças de séries (2026-09-07) e de acesso (2026-09-07) invalidaram premissas do SDD v0.1. Antes de escrever DDL, alinhar regras com Financeiro e Vendas num documento não-técnico evita migration errada e retrabalho.

**Scope:** SDD v0.2, adendo BRD 0.5, HTML de regras para validação.

#### Checklist

- [x] **SDD v0.2:** rewrite `docs/sdd/financeiro-cockpit-sdd.md` (séries, `usage_driven`, exceções híbridas, papéis, fases)
- [x] **BRD:** addendum 0.5 em `docs/brd/brd-financeiro-cockpit.md` + linha no Histórico
- [x] **HTML rules doc:** `docs/sdd/financeiro-cockpit-regras.html` (não-técnico, Financeiro + Vendas)
- [x] **Validation:** Financeiro/Vendas responderam as 12 perguntas (2026-09-11) — ver adendo BRD 0.6
- [x] **Index:** `index-updater` — linha do BRD no `.agents/docs-index.md`

#### Implementation Log (Phase 0)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-09-11 | `5ed328d` | `docs/sdd/financeiro-cockpit-sdd.md`, `docs/sdd/financeiro-cockpit-regras.html`, `docs/brd/brd-financeiro-cockpit.md`, `.agents/docs-index.md` | v0.2 série-aware + HTML de validação + adendo BRD |

---

### Phase 0.1 — Ata de validação + regras ajustadas

**Status:** Complete (2026-09-11).

**Rationale:** As respostas do Financeiro simplificaram o escopo (reajuste anual sem retroativo; renovação carrega o valor corrigido) e adicionaram um tipo de exceção (desconto por licença/OS). Registrar a ata e ajustar contratos antes da migration.

**Scope:** SDD v0.3, adendo BRD 0.6 (ata), HTML v1.1 validado (base do Help).

#### Checklist

- [x] **SDD v0.3:** reajuste anual por série (`correction_anniversary`/`correction_percent`/`correction_rule`), sem `billing_corrections`/toggle/retroatividade; 4º tipo `desconto_unidade`; sales lê exceções (Q8); fatura zerada visível (Q4); falha de sync → suporte (Q9); 1 fatura por série (Q11); task do Help
- [x] **BRD:** adendo 0.6 "Ata de validação 2026-09-11" + linha no Histórico
- [x] **HTML v1.1:** selo VALIDADO; seção de reajuste reescrita; desconto por licença/OS; FAQ com as respostas; pronto para virar Help
- [x] **Index:** `index-updater` — BRD `0.5 → 0.6`

#### Implementation Log (Phase 0.1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-09-11 | `4169799` | `docs/sdd/financeiro-cockpit-sdd.md`, `docs/sdd/financeiro-cockpit-regras.html`, `docs/brd/brd-financeiro-cockpit.md`, `.agents/docs-index.md` | v0.3 pós-validação + ata + HTML v1.1 |

---

### Phase 1 — DB core + flag + RLS + RPCs + usage_driven/reajuste

**Status:** Not started

**Rationale:** Base de tudo depende do DDL. Isolar DDL permite `supabase db push --include-all` + rollback limpo antes de tocar React. Flag dedicada dá kill-switch independente de `financial_data`.

**Scope:**
- Migration `financeiro_cockpit_core`: `usage_driven` + `correction_*` + backfill, `billing_exceptions` (4 tipos), flag, RLS, 3 RPCs series-aware

#### Checklist

- [x] **Migration:** `./node_modules/.bin/supabase migration new financeiro_cockpit_core` → `supabase/migrations/20260911191431_financeiro_cockpit_core.sql`:
  - [x] `ALTER TABLE contract_series` — `usage_driven` (+backfill `kind='original'`), `correction_anniversary`, `correction_percent`, `correction_rule` (§4.2) + COMMENTs
  - [x] `CREATE TABLE billing_exceptions` (4 tipos) + CHECKs + indexes + trigger `set_updated_at`
  - [x] Flag `cockpit_financeiro` `enabled false` `[admin,manager,finance]` com `ON CONFLICT DO UPDATE`
  - [x] RLS: SELECT `admin,manager,finance,sales`; ALL `admin,finance`; `REVOKE anon/public` + `GRANT authenticated`
  - [x] RPCs + engine privado `_financeiro_series_month` (`SECURITY DEFINER`, guard, `REVOKE`; helper sem EXECUTE para authenticated)
  - [x] RPC reflete `usage_driven`, pausa de renegociação, tiers por série, 4 tipos de exceção (série→cliente), `billing_payments` PK tripla (T6); **sem** cálculo de índice/retroativo
- [x] **Build:** `npm run build` with no errors
- [x] **DB push:** `./node_modules/.bin/supabase db push --include-all` — aplicada; smoke `2026-08` (16 clientes; MRR real R$ 122.692,83; guard csm 42501); grants verificados
- [x] **Extras:** migration history repair (8 locais `applied` + 8 órfãs remotas `reverted`) + `split_health_cockpit` (pendente antiga) aplicada no mesmo push
- [x] **Commit:** `git add supabase/migrations/20260911191431_financeiro_cockpit_core.sql docs/sdd/financeiro-cockpit-sdd.md && git commit -m "feat(financeiro): phase 1 DB core (series-aware) + flag + RPCs" && git push origin main`

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-09-11 | `a06120e` | `supabase/migrations/20260911191431_financeiro_cockpit_core.sql` | Applied: series-aware engine + `billing_exceptions` (4 types) + `usage_driven`/`correction_*` + flag + 3 RPCs; smoke `2026-08` ok (16 clients, R$ 122.692,83 real MRR) |

---

### Phase 2 — Hook + Base Page + usage_driven/reajuste no form

**Status:** Not started

**Rationale:** Depois do DDL, o esqueleto navegável com dados reais valida o fluxo `DONC API → client_usage → séries → RPC → React Query → tabela`. Os campos no form mantêm a paridade entre o MRR mostrado no contrato e o cockpit.

**Scope:**
- `src/lib/financeiro.js`, `useFinanceiroCockpit`, `FinanceiroCockpitPage` (KPIs T1-T7, toolbar, accordion lazy), rota/card/flag, form (`usage_driven` + reajuste + renovação assistida) + `resolveMRR` parity

#### Checklist

- [x] **Helpers:** Create `src/lib/financeiro.js` — `formatBRL`, `formatPercent`, `monthLabel`, `deltaDisplay`, `defaultRefMonth`, `filterByBillingType`, `isExcecaoVigente`, `seriesModeLabel`, `tierValue`, `renewalSuggestion`
- [x] **Hook:** Create `src/hooks/useFinanceiroCockpit.js`:
  - [x] `useQuery(['financeiro_available_months'])` — `sync_service_log` service `donc-api`, distinct `ref_month` desc, `staleTime 10min`
  - [x] `useQuery(['financeiro_cockpit', refMonth], () => supabase.rpc('get_financeiro_cockpit', {p_ref_month: refMonth}))` — `staleTime 5min`, `enabled !!profile && !!refMonth`
  - [x] `useFinanceiroDetalhe` (lazy por mount) + `useLastDoncSync` (banner Q9)
- [x] **Page:** Create `src/pages/FinanceiroCockpitPage.jsx` (918L, template 1:1):
  - [x] Wrapper + `BackButton → /cockpits` + `PageHeader title="Financeiro · Faturamento" subtitle={monthLabel}`
  - [x] KpiCards T1-T3 + deltas vs mês anterior (clientes filtrados), secondary T4-T7
  - [x] Toolbar (ref_month default mês anterior, search, filter `billing_type`, toggle "Só excedentes", CSV sintético, lastSync)
  - [x] Table com colunas collapsed (§3) + row highlight exceção (`bg-donc-amber/10`) / inadimplente (`bg-donc-red/10`); fatura zerada aparece com R$ 0,00 (Q4)
  - [x] Row expand lazy (`useFinanceiroDetalhe`) + subtable Séries (modo / reajuste) + rateio por produto + exceções + adimplência + profissionais/OS (cap 50, scroll)
  - [x] Banner de falha de sync → `"Uso de {mês} não sincronizou — contate o suporte DoncCX Hub"` (Q9)
- [x] **Routing/Gateway:** `src/App.jsx` `<CockpitRoute flagKey="cockpit_financeiro">`; `CockpitsPage.jsx` card; `SettingsFeatureFlags.jsx` grupo `Cockpits & Dashboards`
- [x] **Icons:** `src/lib/icons.js` — `Percent` (alfabético, sem duplicata)
- [x] **Form (usage_driven + reajuste):** Modify `src/components/clients/ClientFormContent.jsx` (Contrato/Plano de cobrança):
  - [x] Checkbox "Cobrar excedente por uso acima do piso" (default por kind: original=true, aditivo/renegociacao=false)
  - [x] Reajuste da série: `Aniversário do reajuste` (default assinatura, editável), `Regra` (percentual/índice/maior), `Percentual` editável + índice existente
  - [x] Renovação assistida: sugestão `base × (1 + percentual/100)` exibida no plano
  - [x] `src/hooks/useContractCharges.js` persiste os 4 campos; `src/lib/contractRules.js` `resolveMRR` com paridade `usage_driven`
- [x] **Build:** `npm run build` — OK (7.5s, 2805 módulos)
- [x] **Verify:** rota com flag off → redirect `/module-unavailable` (gate); RPC smoke já validado na Phase 1. **QA com flag on adiada para a Phase 5** (flag permanece `false` até o QA de papéis, conforme decisão do SDD)
- [x] **Commit:** `git add src/lib/financeiro.js src/hooks/useFinanceiroCockpit.js src/pages/FinanceiroCockpitPage.jsx src/App.jsx src/pages/CockpitsPage.jsx src/components/settings/SettingsFeatureFlags.jsx src/lib/icons.js src/components/clients/ClientFormContent.jsx src/hooks/useContractCharges.js src/lib/contractRules.js docs/sdd/financeiro-cockpit-sdd.md && git commit -m "feat(financeiro): phase 2 hook + base page + form (usage_driven/reajuste)" && git push origin main`

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-09-11 | `5e1f069` | `src/lib/financeiro.js`, `src/hooks/useFinanceiroCockpit.js`, `src/pages/FinanceiroCockpitPage.jsx`, `src/App.jsx`, `src/pages/CockpitsPage.jsx`, `src/components/settings/SettingsFeatureFlags.jsx`, `src/lib/icons.js`, `src/components/clients/ClientFormContent.jsx`, `src/hooks/useContractCharges.js`, `src/lib/contractRules.js` | Base page (KPIs T1-T7, toolbar, accordion lazy, banner Q9, CSV sintético) + rota/card/flag + form `usage_driven`/reajuste/renovação assistida + paridade `resolveMRR`; build ok |

---

### Phase 3 — Exceptions (4 tipos) & Payment (CRUD, Toggles, Badges, Mirror)

**Status:** Not started

**Rationale:** Com a base navegável validada, adicionar escrita é o maior risco de permissão (admin/finance write, manager read-only, sales read-only na ficha). Isolar CRUD + adimplência permite testar RLS por role sem quebrar exports.

**Scope:**
- CRUD `billing_exceptions` (4 tipos, escopo cliente/série, sem retroativo), `PaymentToggle` adimplência, badges, espelho no detalhe + card para sales

#### Checklist

- [ ] **Exception modal:** Create `src/components/financeiro/ExcecaoModal.jsx` (drawer `fixed right-0 w-[420px]` ou modal `max-w-lg`):
  - [ ] Campos: escopo (`Todas as séries` / série específica via select de `contract_series` ativas), `type` (4 tipos), condicionais `percent` / `reduced_value` / `unit_discount`, `valid_from/to`, `reason textarea >=10`
  - [ ] Validação: `percent > 0 e ≤ 100`, `reduced_value > 0`, `unit_discount > 0` e `< base da série`, `valid_from >= mês corrente` (sem retroativo), `valid_to >= valid_from`, `desconto_unidade` só em série `usage_driven`, aviso de vigência sobreposta mesmo escopo+tipo
  - [ ] Calls: `supabase.from('billing_exceptions').insert/update/delete` (42501 se role sem write) + audit `created_by/updated_by`
  - [ ] Lista inline no row expandido + botões `+ Exceção` / `Editar` gated `canWrite = ['admin','finance'].includes(effectiveRole)` (senão disabled + toast `Ação não permitida`)
- [ ] **Payment toggle:** Create `src/components/financeiro/PaymentToggle.jsx`:
  - [ ] Por `(client_id, series_id, ref_month)`: `status adimplente|inadimplente`, `delay_days`, `paid_at`, `note` → `upsert` `onConflict 'client_id,series_id,ref_month'`; write `admin,finance` (RLS existente)
  - [ ] Badge collapsed `Adimplente` / `Inadimplente 12d`; T6 soma `mrr_real` das faturas inadimplentes
  - [ ] Reusar `useBillingPaymentsMutations` (`src/hooks/useBillingPayments.js`)
- [ ] **Page update:** Modify `FinanceiroCockpitPage.jsx` — badges `Isento` (fatura R$ 0,00 visível), `Desconto 10%`, `Desconto R$ 10/licença`, `Valor reduzido`, `Suspenso até`, `Reajuste X% em MM/AAAA`; row highlight; warning de rateio (`validateRateio` ±0,01); invalidate após mutações
- [ ] **Mirror:** Modify `src/components/clients/tabs/operacional/ClientSubDados.jsx` — card read-only "Exceção vigente" (tipo, escopo, vigência, motivo) + "Adimplência" latest; **card na aba Contrato para sales** (detalhe completo — Q8, gated `['admin','finance','sales'].includes(effectiveRole)`)
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** RLS matrix — `admin/finance` write ok, `manager` read-only (42501 no write), `sales` lê na ficha e 42501 no cockpit, `csm` sem acesso; exceção `isencao_total` de série zera só a série; `desconto_unidade` preserva piso/excedente; sem retroativo (valid_from passado bloqueado)
- [ ] **Commit:** `git add src/components/financeiro/ src/pages/FinanceiroCockpitPage.jsx src/components/clients/tabs/operacional/ClientSubDados.jsx src/components/clients/ClientFormContent.jsx && git commit -m "feat(financeiro): phase 3 exceptions (4 tipos) + payment toggles + mirrors" && git push origin main`

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Exports + Audit (sem retroatividade)

**Status:** Not started

**Rationale:** Exports são o entregável auditável (CNPJ+SaaS_ID). Sem retroatividade (validado 2026-09-11), o export reflete o mês como fechado — sem coluna de delta retroativo nem fluxo de reemissão.

**Scope:**
- CSV sintético/analítico (toolbar + row), PDF `window.print()`

#### Checklist

- [ ] **CSV:** `EXPORT_VIEWS = { faturavel, isento, geral }` (`ViewToggle` segmented); `csvSintetico(rows)` colunas `Cliente | CNPJ | SaaS_ID | Tipo | Piso | Uso | Billable | Valor unit. | MRR mínimo | MRR real | Excedente | Exceção | Escopo | Adimplência | Δ MRR`; `csvAnalitico` via `supabase.rpc('get_financeiro_export')` (global) + `detailCache` (row) com `Série | Modo | Módulo | Valor rateado | %` + profissionais/OS when `por_licenca`
- [ ] **Download:** `downloadFile(content, filename, mime)` com BOM `\uFEFF` (copy `ProfissionaisCockpitPage.jsx:48`); filenames `financeiro-sintetico-${view}-${refMonth}.csv` / `financeiro-analitico-...`
- [ ] **PDF:** `exportPdf(row)` `<!DOCTYPE html><meta charset="utf-8">` + cards `MRR mínimo | MRR real | Excedente` + badges + table `tabular-nums` + header `Financeiro · ${client_name} — ${monthLabel(refMonth)} · ${view.label}` + `CNPJ / SaaS_ID`; `window.open + document.write + w.print()` `@media print .no-print{display:none}`
- [ ] **Build:** `npm run build` with no errors
- [ ] **Verify:** Excel PT-BR abre com BOM, PDF ok, valores batem com a tabela
- [ ] **Commit:** `git add src/pages/FinanceiroCockpitPage.jsx src/hooks/useFinanceiroCockpit.js && git commit -m "feat(financeiro): phase 4 exports CSV/PDF" && git push origin main`

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Polish + Help do cockpit + Deploy + Docs + Flag enable

**Status:** Not started

**Rationale:** Endurecimento antes de habilitar `cockpit_financeiro=true`: QA por role, falha DONC, empty/loading, e o Help in-app reaproveitando o documento de regras validado.

**Scope:**
- Polish UX, role QA, DONC failure banner, **Help do cockpit**, `docs/modules/clients.md`, docs do SDD, enable flag, smoke Vercel

#### Checklist

- [ ] **Polish:** empty `text-center py-12 text-text-tertiary` + skeletons + error `bg-donc-red/10 border` + `Tentar novamente`; manter lazy 1 RPC/expand
- [ ] **DONC failure:** banner when `sync_service_log.status='failed'` para `refMonth` — `"Uso de {refMonth} não sincronizou — contate o suporte DoncCX Hub"` (Q9) + `lastSync`
- [ ] **Help do cockpit (task validada 2026-09-11):** adaptar `docs/sdd/financeiro-cockpit-regras.html` v1.1 → `public/help/financeiro-regras.html` + botão `?`/"Como funciona a cobrança" no `PageHeader` do `FinanceiroCockpitPage` abrindo o Help (nova aba ou drawer/iframe); manter a versão do doc em `docs/sdd/`
- [ ] **Role QA:** `admin/finance` write ok, `manager` read-only, `sales` lê exceções na ficha (sem cockpit), `csm/analyst` 42501 + redirect `/module-unavailable`
- [ ] **Docs:** `docs/modules/clients.md` — `usage_driven`/reajuste no Contrato + espelho de exceções/adimplência no Operacional; `index-updater` se novo domínio
- [ ] **Flags:** `update feature_flags set enabled=true where key='cockpit_financeiro'` (só após QA)
- [ ] **Build & deploy:** `npm run build` — no errors → `git push origin main` → smoke `https://donccx-donccx.vercel.app/financeiro-cockpit`
- [ ] **Docs SDD:** fill all Implementation Logs + §0 + §6 + Histórico
- [ ] **Commit:** `git add docs/sdd/financeiro-cockpit-sdd.md docs/modules/clients.md public/help/financeiro-regras.html src/pages/FinanceiroCockpitPage.jsx && git commit -m "feat(financeiro): phase 5 polish + help + enable + docs" && git push origin main`

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
- `financial_data` enabled (`admin,manager,finance`); `cockpit_financeiro` **existe `enabled false`** (`admin,manager,finance`).
- **Phase 1 aplicada (2026-09-11):** `billing_exceptions` (4 tipos) + `usage_driven`/`correction_*` por série + 3 RPCs + engine; smoke `2026-08` → 16 clientes, MRR real R$ 122.692,83, excedente R$ 16.587,36; grants verificados (anon bloqueado, helper privado).
- **Phase 2 implementada (2026-09-11):** página/hook/helpers + rota/card/flag registrada + form V2 com `usage_driven`/reajuste/renovação assistida + paridade `resolveMRR`. Deploy Vercel pendente do push; flag permanece `false` até a Phase 5.
- **Histórico de migrations reconciliado (2026-09-11):** 8 versões locais marcadas `applied` e 8 órfãs remotas `reverted` (migrations de 02–07/09 aplicadas via MCP com timestamps diferentes). `split_health_cockpit` (pendente antiga) aplicada no mesmo push — flag `health_cockpit` criada.
- Regras validadas por Financeiro/Vendas em 2026-09-11 (ata no BRD 0.6); HTML v1.1 será o Help do cockpit (Phase 5).

### Decisões validadas (2026-09-11)

| # | Resposta | Efeito |
|---|---|---|
| 1 | Modos travado/base+excedente refletem negociações | mantido |
| 2 | Defaults: original base+excedente; aditivo/renegociação travado | mantido |
| 3 | Admin/Finance escrevem; Manager read-only | mantido |
| 4 | Aditivo isento aparece zerado (R$ 0,00) | fatura zerada visível com selo |
| 5 | Valor reduzido mensal OK **+ desconto por licença/OS** | 4º tipo `desconto_unidade` |
| 6 | Sem piso = cobra consumo | mantido |
| 7 | Reajuste é anual, no aniversário (assinatura, configurável), percentual editável (X% e/ou índice), **sem retroativo**, renovação com valor já corrigido | remove `billing_corrections`/toggle/retroativo; `correction_anniversary/percent/rule` na série |
| 8 | Vendas vê detalhes das exceções na ficha | RLS SELECT `sales` + card na aba Contrato (detalhe completo) |
| 9 | Falha no uso do mês → avisar e direcionar ao suporte | banner sem decisão de faturamento |
| 10 | Sem outros tipos de negociação além do item 5 | 4 tipos |
| 11 | 1 fatura por série × mês (A) | mantém PK tripla de `billing_payments` |
| 12 | Vencimento/renovação por série | mantido |
| — | "Ignora o passado" (exceções também) | `valid_from >= mês corrente`; sem reemissão/complemento |

### Architectural decisions

| Decision | Rationale |
|---|---|
| Cockpit restrito a `admin/manager/finance` | Modelo de acesso de 2026-09-07 (`financial_data` sem sales + `SAFE_CLIENT_COLS`); revoga Q4a. Vendas negocia via séries e lê as exceções na ficha. |
| Exceções **híbridas** `series_id NULL` = cliente, set = série | Cobre "10% off geral" (sem criar fatura nova) e "aditivo Rotas 100% off" (zera só a série). |
| **4 tipos** (`isencao_total`, `desconto_percent`, `valor_reduzido`, `desconto_unidade`); `piso_zerado` removido | Q5 validada: percentual e R$/licença coexistem; `desconto_unidade` preserva piso/excedente. Piso é da série; "sem piso" = `floor=0` + `usage_driven`. |
| `contract_series.usage_driven` | Reconcilia contratado × uso: `true` = excedente acima do piso compõe o MRR; `false` = travado, uso informativo. Backfill `(kind='original')`. |
| Uso aplicado só à série original quando há múltiplas `usage_driven` | `client_usage` é do cliente; aplicar em N séries duplicaria excedente. |
| **Reajuste anual sem cálculo no cockpit** (`correction_anniversary` + `correction_percent` editável + `correction_rule`) | Financeiro cria a renovação como nova série com o valor já corrigido; o cockpit exibe o valor da série + selo. Percentual editável cobre X% fixo, índice ou o maior. |
| **Sem retroatividade em correções e exceções** | Validado (Q7.3 + "ignora o passado"): nenhum mês fechado é reprocessado; não há reemissão/complemento nem coluna de delta retroativo. |
| Fatura zerada visível (R$ 0,00 + selo) | Q4: isenção/suspensão/não cobrar aparecem para dar visibilidade à negociação. |
| Falha de sync = aviso + suporte (sem decisão de faturamento) | Q9: o cockpit não fatura pelo piso nem segura em silêncio; direciona ao suporte DoncCX. |
| Adimplência por `(client_id, series_id, ref_month)` | Q11 confirmou 1 fatura por série; trigger espelha `clients.delay_days` para `health_financeiro`. |
| Help do cockpit a partir do documento validado | Conteúdo já aprovado por Financeiro/Vendas; reuso evita Help divergente das regras. |
| Template Profissionais 1:1 | Reuso de `KpiCard`, toolbar, `detailCache` lazy (1 RPC/expand), CSV/PDF `BOM + window.print`. |
| RPCs `SECURITY DEFINER SET search_path=public` + guard `admin,manager,finance` | Mitiga vazamento `CLIENT_SELECT='*'` (gotcha `get_finance_summary`); guard `coalesce(get_user_role(),'none') → 42501`. |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Form e cockpit divergirem no MRR (regras × usage_driven) | `resolveMRR`/preview atualizados na Phase 2; verificação cruzada cockpit × preview do form por cliente. |
| Duplo desconto (renegociação + exceção cliente) | Ordem documentada série→cliente; UI mostra as duas linhas; validado no HTML. |
| Múltiplas séries `usage_driven` duplicando excedente | Uso só na original; form alerta; RPC ignora uso nas demais. |
| `desconto_unidade` em série travada (não faz sentido) | Validação no modal (só `usage_driven`) + CHECK app-level; RPC ignora com flag de aviso. |
| Exceção retroativa burlando "ignora o passado" | Validação `valid_from >= mês corrente` no modal; RPC nunca recalcula meses passados. |
| Reajuste aplicado no mês errado | Aniversário explícito por série (default assinatura, configurável); renovação assistida sugere o novo valor; T7 alerta 30d. |
| DONC API fora no cron → uso desatualizado | Banner com aviso + direcionamento ao suporte DoncCX (Q9) + `lastSync`. |
| Performance N+1 com 200+ clientes | 1 RPC per expand lazy + `staleTime 5min`; query principal única com CTEs no DB. |
| RLS incorreta liberando financeiro a csm/analyst | Guard nas RPCs + policies; QA matrix na Phase 3/5. Sales lê `billing_exceptions` (Q8) mas não acessa cockpit. |
| `usage_driven` backfill errado na original | `UPDATE ... SET usage_driven=(kind='original')`; conferir `select kind, usage_driven, count(*) from contract_series group by 1,2`. |
| Flag habilitada antes do deploy | Migration `enabled false` + enable manual só Phase 5 + gates de card/rota. |

---

## 8. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js` (import at top + alphabetical entry, check duplicates). `Wallet` existe; `Percent` não.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main` — no branches, no worktrees. Push to `origin main`.
- **No local Supabase:** all DB/functions changes go directly to production (`supabase db push --include-all` + `supabase functions deploy`). No Docker.
- **CLI in WSL:** the global `supabase` (Windows npm shim) is broken for linux-x64 — use `./node_modules/.bin/supabase` (v2.109.0) and export `SUPABASE_ACCESS_TOKEN` from `.env.local`.
- **Migration history drift (repaired 2026-09-11):** recent migrations were applied via MCP with timestamps different from the local files. If `db push` reports remote/local mismatches, repair with `migration repair --status applied <local-versions>` + `--status reverted <remote-only-versions>` — never re-apply old files. The local file owns the version going forward.
- **Build verify:** `npm run build` is mandatory before every `git push` (Vite `build.minify false`, `__COMMIT_HASH__` via `vite.config.js`).
- **Vercel:** SPA rewrite `/(.*) -> /index.html` in `vercel.json`.
- **Financeiro-specific:**
  - Billing is **per series**: do NOT read `clients.billing_*` as source of truth — resolve via `contract_series` (`resolveMRR`, `seriesMonthTotal`); `clients.*` é espelho da original.
  - `contract_charges` has `series_id` + `ref_month` (join direct by `ref_month`); `billing_os_tiers` PK `(client_id, series_id, tier_order)`; `billing_payments` PK `(client_id, series_id, ref_month)`.
  - **No correction calculation in the cockpit**: the series value already carries the annual adjustment (renewal); `correction_anniversary`/`correction_percent`/`correction_rule` are contract metadata + badge. No `billing_corrections`, no retroactive reprocessing.
  - Exceções: `series_id NULL` = cliente; set = série; 4 tipos; aplicar série → soma → cliente; nunca criar `piso_zerado`; `desconto_unidade` só em série `usage_driven`; `valid_from >= mês corrente`.
  - `sync_service_log` é a fonte de `ref_month`, não `client_usage` distinct.
  - RLS via `get_user_role()` + `42501`; matrix `admin/finance` write, `manager` read, `sales` read exceptions only, `csm/analyst` 403.
  - `ClientForm.jsx` **não existe** — qualquer referência é o `ClientFormContent.jsx` (rotas V2 sem flag).
  - Help do cockpit consome `docs/sdd/financeiro-cockpit-regras.html` (v1.1) — manter `public/help/` sincronizado.

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
| 0.2 | 2026-09-11 | DoncCX Hub | Reescrita série-aware: `contract_series`/`contract_charges`/`billing_os_tiers`; `usage_driven`; exceções híbridas (3 tipos, `piso_zerado` removido); papéis `admin/manager/finance` (sales fora); correções client-month; Fase 3.5/billing.js marcados concluídos; HTML de validação Financeiro/Vendas |
| 0.3 | 2026-09-11 | DoncCX Hub | Pós-validação: reajuste anual por série (`correction_anniversary/percent/rule`; renovação com valor corrigido; sem retroativo; remove `billing_corrections`/toggle); 4º tipo `desconto_unidade`; sales lê exceções (Q8); fatura zerada visível (Q4); falha de sync → suporte (Q9); "1 fatura por série" confirmado (Q11); task do Help do cockpit a partir do HTML validado |
| 0.4 | 2026-09-11 | DoncCX Hub | Phase 1 implementada: migration `20260911191431_financeiro_cockpit_core` aplicada (engine series-aware, `billing_exceptions` 4 tipos, `usage_driven`/`correction_*`, flag, 3 RPCs); histórico de migrations reconciliado; smoke `2026-08` ok |
| 0.5 | 2026-09-11 | DoncCX Hub | Phase 2 implementada: página/hook/helpers, rota + card + flag registrada, form V2 (`usage_driven` + reajuste + renovação assistida), paridade `resolveMRR`; flag permanece off até a Phase 5 |

---

## Validation checklist — before publishing (Sdd-specification § Validation)

- [x] Section 0 reflects actual current state (migrations `20260907*`, `20260902000004`, production `information_schema`/`pg_policies`, `contractRules.js`, `billing.js`, `useClients.js`, `App.jsx`, `CockpitsPage.jsx`)
- [x] Files to be touched verified to exist (or confirmed not to exist): `ClientFormContent.jsx` (exists), `ClientForm.jsx` (deleted `aa87554`), `billing_exceptions` (absent), `usage_driven` (absent), `Percent` icon (absent)
- [x] Data contracts reference real column names (`contract_series.billing_*` + novos `correction_*`/`usage_driven`, `contract_charges.series_id/ref_month/due_date`, `billing_os_tiers.series_id`, `module_pricing.series_id`, `billing_payments` PK tripla)
- [x] Color tokens, icon names, component APIs verified (`tailwind.config.js #173557/#1D9E75/#f7f7f5`, `Wallet` in `src/lib/icons.js`, `CockpitRoute` in `App.jsx:128`)
- [x] Active phase clearly identified (Phase 1 ready to start)
- [x] Gotchas includes project-wide traps (icons, Supabase deploy, branch)
- [x] Language convention followed (English for LLM instructions/data contracts, Portuguese for rationale)
