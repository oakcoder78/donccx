# SDD — Formulário de Empresas v2 (ClientForm → Página + Contrato + Handoff)

## Purpose

Spec-Driven Development artifact — single source of truth para a reformulação do cadastro de empresas (`src/components/clients/ClientForm.jsx`, tabela `public.clients`, `src/hooks/useClients.js`). Fonte: discovery via 3 sub-agentes `explore` + decisões do solicitante em 4 rodadas (tabs, bilhetagem 3 estados, motor de contrato, handover 10 perguntas, modal→página, intervalos contíguos, inadimplência no cockpit).

Designed to be read by humans and LLM agents so work can be resumed, implemented, and documented without external context.

Reference BRDs: `docs/brd/brd-financeiro-cockpit.md` (Q2 rateio, Q4a/b exceções) · `docs/sdd/financeiro-cockpit-sdd.md` (cockpit financeiro base)
Template UI: `src/pages/ProfissionaisCockpitPage.jsx:1-736` + `src/pages/ReportEditorPage.jsx` (página complexa) + `docs/ui-patterns.md`

### How to use this document

1. **Before implementing:** Read fully. Understand data contracts, component tree, business rules before touching any file.
2. **During implementation:** Follow checklist for active phase only. Do not skip ahead.
3. **After implementation:** Fill Implementation Log for completed phase before starting next one.

---

## 0. Current System State

> **Read this first.** Starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx-donccx.vercel.app` (Vercel auto-deploy on `git push origin main`)
- **Active phase:** Phase 1 — Not started

**What already exists related to this work:**

- `src/components/clients/ClientForm.jsx:14,778L` — `TABS=['Dados da Empresa','Contrato','Operacional','Endereço']`, `EMPTY` 30 campos, `Modal max-w-3xl`, navegação `Anterior/Próximo` + `validateMods()` na aba Contrato, `fmtBRL`, `maskCNPJ/maskCEP`, `fetchCEP` ViaCEP, upload `company-logos`, cálculo `unitValue=calculateUnitValue(base, activeMods)` + `mrrMinimo=floor*unitValue` (`src/lib/billing.js:7` BUG soma vs rateio Q2)
- `public.clients` (`supabase/migrations/20260503031721_remote_schema.sql:618-674`) — `name NOT NULL`, `fantasy_name`, `cnpj`, `segment_id FK segments`, `csm_id/comercial_id FK profiles`, `abc_class CHECK A/B/C`, `site`, `contract_active bool`, `lifecycle_stage CHECK lead/prospect/cliente/parceiro/teste`, `unidades_total/donc int`, `billing_type CHECK por_licenca/por_os`, `billing_base_value numeric`, `billing_floor int`, `contract_signed_date/start/renewal date`, `correction_index text`, `mrr numeric`, `stage_id FK stages`, `onb_start/golive date` (legado, será removido), `description text` (será migrado), `address_* 7 cols`, `freshdesk_company_ids bigint[]`, `delay_days` (legado financeiro), `health_*` dims. Evoluções: `comercial_id` (20260824000008), `health_trend` (20260519000001), `app_code/url_donc` removidas para `client_donc_instances`
- Satélites: `client_catalog(client_id,catalog_item_id,status)`, `module_pricing(client_id,catalog_item_id,additional_value numeric)`, `catalog_items(type servico|solucao)`, `segments`, `stages`, `client_donc_instances`, `projects/onboardings/onboarding_fases/activities`, `client_usage(profissionais_versao jsonb)`, `sync_service_log`, `feature_flags`, `brief_templates/instances` (template handover inspirador)
- Hooks: `useClients` (`CLIENT_SELECT='*'`, `create/update` + `catalogItems` + `logAction`), `useClient(id)` detalhe profundo, `useModulePricing`, `useCatalog`, `useStages`, `useSegments`, `useProfiles`, `useFeatureFlags`
- Detail: `ClientsPage.jsx` (grid + `showForm→<ClientForm>`) + `ClientDetail.jsx` (header + `showEdit→<ClientForm>`, tabs `overview/atividades/operacional/health/contatos/anexos` via `?tab=`, subs `dados/uso/projetos/suporte/relatorios` em `ClientTabOperacional.jsx:11`), `ClientSubDados.jsx:274-292` (InfoRow contrato/operacional, `canViewFinancialEffective`, 5 sub-tabs)
- Health: `src/lib/healthScore.js:179` (`refDate=golive||contract_start`, `monthsSinceGoLive` → `nd_m*`, `ob_late`), `supabase/functions/health-recalc/index.ts:209,481`, `ClientTabOverview.jsx:199,219,503`, `ClientHealthDrawer.jsx:349`
- `src/lib/icons.js` — never import from `lucide-react` directly
- Flags: `financial_data` (20260824000006), `cockpit_financeiro` (20260901000001 proposto), `profissionais_cockpit`
- `supabase/migrations/20260830000001_finance_summary_rpc.sql` — pattern `SECURITY DEFINER SET search_path=public` + `REVOKE anon/public`
- `vite.config.js` injects `__COMMIT_HASH__`, `vercel.json` SPA rewrite, `build.minify false`, `QueryClient staleTime 30s`

**What does NOT exist and needs to be created:**

- Página `src/pages/ClientFormPage.jsx` + rotas `/empresas/nova` e `/empresas/:id/editar` + refator `ClientForm.jsx` → `ClientFormContent.jsx` (sem Modal)
- Colunas `billing_status enum(ativo,suspenso,nao_bilhetavel) + billing_suspended_until date` + `erp text + ti_tipo enum` em `clients`
- `ALTER billing_base_value/module_pricing.additional_value TYPE numeric(12,4)`
- `DROP COLUMN onb_start, golive` + `DROP description` (após migração handover)
- Tabelas `contract_charges`, `billing_os_tiers`, `client_handovers` (+ `client_handover_templates` opcional) + RLS + triggers + índices
- Hook `useClientHandovers`, `useContractCharges`, `useBillingOsTiers` + helpers `src/lib/contractRules.js`
- Componentes `ContractChargesSection`, `OsTiersSection`, `HandoverSection`, `BillingStatusField` (ou dentro do form page)
- RPC `get_financeiro_cockpit` ampliado para ler `contract_charges/billing_os_tiers/billing_status` + `billing_payments` (adimplência)
- Tabela `billing_payments(client_id,ref_month,status,delay_days,paid_at)` (adimplência — ver §4.6; implementada no SDD Financeiro, consumida aqui read-only)
- Exibição read-only handover em `ClientSubDados` + espelho em `ClientSubProjetos`/`OnboardingDetailPage`
- Migration `description → client_handovers.answers->>'contexto'` ("Handoff Comercial → Onboarding")

### Files to be touched

| File | Change type |
|---|---|
| `supabase/migrations/20260902000001_empresas_form_v2_core.sql` | **Create** — `billing_status` enum + col, `suspended_until`, `billing_base_value` 4 decimais, `erp/ti_tipo`, satellite tables, RLS, triggers, fallback `contract_active` |
| `supabase/migrations/20260902000002_empresas_form_v2_handover.sql` | **Create** — `client_handovers` + `client_handover_templates` + migration `description` → `contexto`, `DROP onb_start/golive/description` |
| `supabase/migrations/20260902000003_empresas_form_v2_contract.sql` | **Create** — `contract_charges`, `billing_os_tiers` + indexes + RLS + `fn_check_*` triggers |
| `src/lib/billing.js` | Modify — `calculateUnitValue/mrr` com `mode='rateio'` + 4 decimais, `fmtBRL` com `minimumFractionDigits` variável |
| `src/lib/contractRules.js` | **Create** — `expandRulesToCharges(rules, N)`, `validateRulesContiguous`, `previewMRR`, `validateOsTiers`, `handoverKeys` |
| `src/lib/icons.js` | Modify — add `Building2/Wallet/Handshake/FileText/CalendarOff` se faltar, alfabético, check duplicates |
| `src/components/clients/ClientFormContent.jsx` | **Create** — extrair de `ClientForm.jsx` (sem `Modal`, recebe `client, onSuccess`, 4 abas reordenadas) |
| `src/components/clients/ClientForm.jsx` | Modify — virar wrapper compatível `<Modal><ClientFormContent/></Modal>` até sunset |
| `src/pages/ClientFormPage.jsx` | **Create** — `p-6 max-w-6xl mx-auto` + stepper lateral 240px + header sticky + `ClientFormContent` |
| `src/components/clients/sections/ContractChargesSection.jsx` | **Create** — eventuais parcelados + recorrência regras contíguas + preview 1..N |
| `src/components/clients/sections/OsTiersSection.jsx` | **Create** — 1..5 tiers + excedente + franquia (=tier1) |
| `src/components/clients/sections/HandoverSection.jsx` | **Create** — 10 perguntas accordion, template-driven, obrigatório se `lifecycle_stage=cliente` |
| `src/components/clients/sections/BillingStatusField.jsx` | **Create** — 3 estados + `suspended_until` date |
| `src/hooks/useContractCharges.js` | **Create** — `useContractCharges(clientId)`, `useContractChargesMutations` |
| `src/hooks/useBillingOsTiers.js` | **Create** — `useBillingOsTiers(clientId)` |
| `src/hooks/useClientHandovers.js` | **Create** — `useClientHandovers(clientId)`, template fetch |
| `src/hooks/useClients.js` | Modify — `CLIENT_SELECT` inclui `billing_status/suspended_until/erp/ti_tipo` (ou mantém `*`), `catalogItems` dedup compat |
| `src/hooks/useClient.js` | Modify — join `client_handovers`, `contract_charges`, `billing_os_tiers`, `billing_payments latest` |
| `src/components/clients/tabs/operacional/ClientSubDados.jsx` | Modify — exibir `billing_status`, `erp/ti_tipo`, `handover` read-only, `unidades_total` (potencial), remover `onb_start/golive` InfoRows |
| `src/components/clients/tabs/operacional/ClientSubProjetos.jsx` | Modify — espelho read-only handover (card "Handoff Comercial → Onboarding") |
| `src/lib/healthScore.js` | Modify — `refDate = project.start_date \|\| contract_start` fallback após `DROP golive` |
| `supabase/functions/health-recalc/index.ts` | Modify — mesmo fallback `golive → project.start_date` |
| `src/components/clients/ClientTabOverview.jsx` | Modify — `monthsSinceGoLive` → `monthsSinceProjectStart` |
| `src/components/clients/ClientHealthDrawer.jsx` | Modify — idem |
| `src/App.jsx` | Modify — `import ClientFormPage` + `<Route path="/empresas/nova" .../>` + `<Route path="/empresas/:id/editar" .../>` inside `PrivateRoute > AppLayout` + labs alias `/labs/empresas_v2` + `/labs/empresas_v2/:id/editar` inside `AdminOnlyRoute` |
| `src/pages/labs/EmpresasV2Page.jsx` | **Create** — isolated labs playground (admin-only) reusing `ClientFormContent`, banner amber, `TABS_V2` new order, handover preview, billing_status mapping to `contract_active` fallback |
| `src/components/layout/Navbar.jsx` | Modify — add `mainNavLinks` entry `'/labs/empresas_v2' adminOnly:true` (Labs → Empresas v2) |
| `src/lib/icons.js` | Modify — add `FlaskConical` alphabetically |
| `supabase/migrations/20260902000004_empresas_form_v2_cockpit_adimplencia.sql` | **Create** — `billing_payments` (ver §4.6; pode viver no SDD Financeiro Phase 3.5, mas referenciado aqui) |
| `docs/sdd/financeiro-cockpit-sdd.md` | Modify — §4.2 add `billing_payments` + T6 wiring + Phase 3.5 checklist |
| `docs/sdd/empresas-form-v2-sdd.md` | **Create** — this SDD |

---

## 1. Global Definitions

### Feature flags

| Key | Enabled | Allowed roles | Dependency |
|---|---|---|---|
| `financial_data` (existing 20260824000006) | `true` | `admin,manager,finance` | — |
| `cockpit_financeiro` (new 20260901000001) | `false` | `admin,manager,finance,sales` | requires `financial_data` |
| `empresas_form_v2` (new) | `false` | `admin,manager,finance,sales,csm` | gates `/empresas/nova` + `/empresas/:id/editar` page vs modal fallback |

Gate in `ClientFormPage.jsx` + `ClientsPage.jsx` CTA: `if (!isEnabled('empresas_form_v2', role)) render <ClientForm modal>` else page link. Sunset modal after 1 sprint.

**Labs isolation (`/labs/empresas_v2`):** Additive-only Phase 1 (no `DROP`) + same `ClientFormContent` reused in `src/pages/labs/EmpresasV2Page.jsx` under `AdminOnlyRoute` (`effectiveRole==='admin'`) with `adminOnly:true` Navbar entry. Same DB (`VITE_SUPABASE_URL` prod), but production `/empresas` modal stays untouched until `empresas_form_v2` enabled. Labs page maps `billing_status → contract_active` fallback if migration not yet pushed, so works both before/after `supabase db push`. See `docs/sdd/labs-dashboard-sdd.md` pattern (`/labs/dashboard` preserve monolito).

### Roles & permissions

| Role | Empresas create/edit | Contract charges/tiers write | Handover write | Billing status write | Adimplência write (cockpit) |
|---|---|---|---|---|---|
| `admin` | yes | yes | yes | yes | yes |
| `finance` | yes | yes | yes | yes | yes |
| `sales` | yes | yes | yes (comercial) | yes | read-only |
| `manager` | yes | read-only | read-only | read-only | read-only |
| `csm` | yes (operacional) | read-only | read-only | read-only | no |
| `analyst` | no | no | no | no | no |

Sales escreve handover/billing_status/contract (negociação nasce no comercial — espelha Q4a financeiro).

### Color tokens / UX (reuse Profissionais + ReportEditor)

`bg-bg-primary #ffffff`, `border-border-tertiary #e8e7e3`, `bg-donc-navy #173557`, `bg-donc-verde #1D9E75`, `bg-donc-red #E24B4A`, `bg-donc-amber #BA7517`, `text-text-tertiary #888780`, `tabular-nums`, `PageHeader` + `BackButton → /empresas`.

### Tab order (new)

```
TABS = ['Dados da Empresa', 'Endereço', 'Contrato', 'Operacional']
  0 Dados: logo, razao, fantasia, lifecycle, cnpj, segmento, csm, comercial, contract_active (legado, espelha billing_status)
  1 Endereço: cep (ViaCEP), street, number, complement, neighborhood, city, state + site (movido de Dados)
  2 Contrato: billing_type, billing_base_value (4 dec), billing_floor, dates, correction_index, mrr preview, billing_status 3 estados + suspended_until, eventuais parcelados, recorrência regras contíguas, tiers OS
  3 Operacional: stage, unidades_total (potencial expansão), unidades_donc (previstas p/ início — renomeado), abc_class (movido), erp, ti_tipo, serviços/soluções chips, Handoff 10 perguntas
```

---

## 2. Design System Reference

**Template página:** `src/pages/ReportEditorPage.jsx` (sidebar 200px + editor 320px + preview, Dnd, autosave, header sticky) + `src/pages/ProfissionaisCockpitPage.jsx` (KpiCard, toolbar, table navy)

Follow:
- Wrapper `p-6 max-w-6xl mx-auto` + `BackButton → /empresas` + `PageHeader title="Nova Empresa | Editar Empresa — {fantasy_name}"`
- Header sticky `h-14 border-b bg-bg-primary` com `[Cancelar] [Salvar rascunho] [Salvar]` (Salvar desabilitado se erro)
- Layout `grid grid-cols-[240px_1fr_320px] gap-6` (desktop) → `tabs sticky top-14` (mobile <768px): stepper lateral 240px `sticky top-16` com progress `4/4` + badges erro
- Stepper item: `flex items-center gap-2 px-3 py-2 rounded-lg {active bg-donc-navy text-white, error bg-donc-red/10 text-donc-red, done text-donc-verde}`
- Conteúdo 720px + Resumo 320px sticky (MRR live, tiers preview, handover progress `6/10`)
- `label-sm text-xs font-medium text-text-secondary mb-1` + `input-base border border-border-tertiary rounded-lg px-3 py-2 focus:ring-donc-sky`
- `KpiCard bg-bg-primary border rounded-xl px-5 py-4` para MRR preview no Contrato
- `Modal` legado `fixed inset-0 z-50 bg-black/20 + max-w-3xl` (mantido para sunset)
- Skeletons `animate-pulse h-3 bg-bg-secondary rounded`, empty `py-12 text-text-tertiary`, error `bg-donc-red/10 border`

---

## 3. Component Tree

```
ClientsPage (/empresas)
  ├── Header + [+ Nova Empresa] → if flag on: navigate('/empresas/nova') else showForm→<ClientForm modal>
  └── Grid CompanyCard (search, chips, lifecycle_stage filter)

ClientDetail (/empresas/:id)
  ├── Header (logo, fantasy_name, StagePill, Badge ABC, HealthScore, csm/comercial)
  ├── Tabs ?tab=overview|atividades|operacional|health|contatos|anexos
  │   └── Operacional ?sub=dados|uso|projetos|suporte|relatorios
  │       ├── ClientSubDados (Dados) — InfoRows + DoncInstancesSection + catalog chips
  │       │   ├── BillingStatusBadge (billing_status + suspended_until)
  │       │   ├── HandoverCard read-only (10 Q, collapsed accordion, "Ver no projeto →")
  │       │   └── AdimplenciaBadge (billing_payments latest, read-only mirror)
  │       ├── ClientSubUso / Suporte (RegistrarDadosModal)
  │       ├── ClientSubProjetos — accordion projects + HandoverMirrorCard read-only
  │       └── ClientSubRelatorios / Anexos
  └── [Editar] → if flag on: navigate('/empresas/:id/editar') else showEdit→<ClientForm modal>

ClientFormPage (/empresas/nova, /empresas/:id/editar)  [NEW]
  ├── PageHeader + BackButton
  ├── Stepper lateral (4 steps, sticky)
  ├── ClientFormContent (shared)
  │   ├── Step 0 Dados da Empresa
  │   │   ├── Logo upload (company-logos)
  │   │   ├── Razão*, Fantasia, lifecycle, CNPJ mask, segmento (+Novo), csm, comercial, contract_active toggle (deprecated mirror)
  │   │   └── Validation: name required, cnpj 14 digits if filled
  │   ├── Step 1 Endereço
  │   │   ├── CEP mask + onBlur ViaCEP, street, number, complement, neighborhood, city, state (UF 2 chars)
  │   │   └── site (https://) ← movido de Dados
  │   ├── Step 2 Contrato
  │   │   ├── billing_type radio por_licenca|por_os
  │   │   ├── billing_base_value number step 0.0001 (4 dec), billing_floor, dates, correction_index, mrr preview
  │   │   ├── BillingStatusField (3 estados: ativo/suspenso/nao_bilhetavel + suspended_until date required if suspenso)
  │   │   ├── ContractChargesSection
  │   │   │   ├── Eventuais (table: label, amount R$ 2 dec, installments 1..120, grupo uuid, due_date, reason)
  │   │   │   ├── Recorrência — Regras contíguas (intervalo 1..N, mode absoluto|percent, value, preview expand 1..N)
  │   │   │   └── Preview table Mês|Valor|Modo|Acumulado + MRR total
  │   │   └── OsTiersSection (only if billing_type=por_os)
  │   │       └── 1..5 tiers (até int, valor R$ 2 dec) + excess_unit_price R$ 0.0000 + franquia (=tier1.limit_to)
  │   └── Step 3 Operacional
  │       ├── stage, unidades_total (potencial expansão), unidades_donc (previstas p/ início), abc_class, erp (text livre), ti_tipo select
  │       ├── Serviços chips (editáveis) + Soluções read-only (derivadas de Contrato)
  │       └── HandoverSection (10 Q accordion, template-driven, required if lifecycle=cliente)
  └── Resumo sticky 320px (MRR live, tiers summary, handover 6/10, billing_status badge)
      + Footer: [Cancelar] [Salvar rascunho] [Salvar] + dots progress + Anterior/Próximo (validate per step)

ClientForm (legacy wrapper)
  └── <Modal max-w-3xl><ClientFormContent /></Modal>
```

State: `activeStep 0..3`, `form` (controlled), `logoFile`, `selectedCatalog`, `modPricing`, `contractRules`, `osTiers`, `handoverAnswers`, `errors` per step, `autosave draft localStorage` debounce 800ms (like `FasePanel`).

---

## 4. Data Contracts

### 4.1 Formula per client (Q1+Q2+ cockpit)

```
uso            = por_licenca: count(profissionais_versao WHERE ativo=true @ ref_month)
                 por_os:       count(dataUltimaOS ∈ ref_month)  // mesma fonte client_usage
                 por_os_tiers: uso acima mapeado em billing_os_tiers tier aplicável
piso_efetivo   = billing_status=nao_bilhetavel ? 0 : (excecao piso_zerado ? 0 : billing_floor)
valor_corr     = correction applied ? billing_base_value*(1+percent/100) : billing_base_value
billable_lic   = max(uso, piso_efetivo)
billable_os    = tier.fixed_value + max(0, uso - tier.limit_to)*excess_unit_price  // quando por_os + tiers
mrr_min        = piso_efetivo * valor_corr  (lic) ou tier1.fixed_value (os)
mrr_real_bruto = billable * valor_corr  (+ sum eventuais/parcelas do mês via contract_charges)
mrr_real       = isencao_total→0 | desconto_percent→bruto*(1-p%) | valor_reduzido→billable*reduced | piso_zerado→já em piso_ef
excedente      = mrr_real - mrr_min
billing_status = ativo → mrr conta; suspenso (until >= ref_month) → mrr=0 mas T6 suspensos; nao_bilhetavel → mrr=0 sempre
adimplente     = billing_payments.status='adimplente' (ver §4.6) → delay_days=0; inadimplente → delay_days>0 → health_financeiro penalizado
```

> Q1 always `ref_month`. Q2 rateio: `unitValue = base` (mods breakdown only). `billing_base_value` 4 dec, `excess_unit_price` 4 dec, `fixed_value` 2 dec.

### 4.2 Tables (supabase-guard: migration required)

**Migration:** `supabase migration new empresas_form_v2_core` → `supabase/migrations/20260902000001_empresas_form_v2_core.sql`

**`clients` alterations**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `billing_status` | `text NOT NULL DEFAULT 'ativo' CHECK (billing_status IN ('ativo','suspenso','nao_bilhetavel'))` | CHECK | 3 states (decision 3b). `contract_active` deprecated, kept as generated `contract_active = (billing_status='ativo')` via trigger or view for compat |
| `billing_suspended_until` | `date` | `CHECK (billing_status!='suspenso' OR billing_suspended_until IS NOT NULL)` + `CHECK (billing_suspended_until > CURRENT_DATE)` app-level | required if suspenso |
| `billing_base_value` | `numeric(12,4)` | `CHECK (billing_base_value >=0)` | was `numeric default 0`, now 4 dec (decision 6) |
| `erp` | `text` | | livre informativo (decision 9) |
| `ti_tipo` | `text CHECK (ti_tipo IN ('interna','terceirizada','hibrida','nao_possui'))` | | decision 10 |
| `onb_start` | `date` | DROP | legado → `projects.start_date` (decision 13) |
| `golive` | `date` | DROP | legado → `onboarding_fases GoLive occurred_at` |
| `description` | `text` | DROP after migration → `client_handovers` (decision 12) | `UPDATE client_handovers SET answers=jsonb_build_object('contexto',description)` |
| `unidades_total` | `int` | moved to Operacional (semantic potencial expansão) | no DDL, just UI |
| `abc_class` | `text` | moved to Operacional | no DDL |
| `site` | `text` | moved to Endereço | no DDL |

Indexes: `CREATE INDEX idx_clients_billing_status ON clients(billing_status); CREATE INDEX idx_clients_billing_suspended_until ON clients(billing_suspended_until) WHERE billing_status='suspenso';`

RLS: no change (existing `authenticated` SELECT; `clients_finance_update` for `finance` role covers `billing_*`).

Feature flag:

```sql
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES ('empresas_form_v2','Formulário Empresas v2 — página + contrato motor + handoff', false, ARRAY['admin','manager','finance','sales','csm'], now())
ON CONFLICT (key) DO UPDATE SET allowed_roles = ARRAY['admin','manager','finance','sales','csm'], updated_at = now();
```

**`module_pricing` alteration**

```sql
ALTER TABLE public.module_pricing ALTER COLUMN additional_value TYPE numeric(12,4);
```

**`contract_charges` (eventuais parcelados + recorrência expandida)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | PK | |
| `client_id` | `int FK clients(id) ON DELETE CASCADE NOT NULL` | FK | |
| `kind` | `text CHECK (kind IN ('implantacao','recorrencia')) NOT NULL` | | `implantacao`=eventual, `recorrencia`=mensal |
| `mode` | `text CHECK (mode IN ('absolute','percent')) NOT NULL` | | absolute R$ or % do base |
| `month_index` | `smallint CHECK (month_index BETWEEN 1 AND 120) NOT NULL` | | 1..N sem limite (ex: 60, 120) |
| `amount` | `numeric(12,2) CHECK (amount >0)` | conditional | required if `absolute` |
| `percent` | `numeric(5,2) CHECK (percent >0 AND percent <=100)` | conditional | required if `percent` |
| `installment_group` | `uuid` | | groups parcelas de mesma implantação |
| `installments_total` | `smallint CHECK (installments_total BETWEEN 1 AND 120)` | | for display |
| `label` | `text` | | ex: "Implantação", "Mensalidade" |
| `reason` | `text CHECK (char_length(reason) >=10)` | | trilha |
| `created_by` | `uuid FK profiles(id)` | | audit |
| `created_at` | `timestamptz default now()` | | |
| `UNIQUE (client_id, kind, month_index, installment_group)` | | | prevents dup |
| `CHECK ((mode='absolute' AND amount IS NOT NULL AND percent IS NULL) OR (mode='percent' AND percent IS NOT NULL AND amount IS NULL))` | | | xor |

Indexes: `CREATE INDEX idx_charges_client_month ON contract_charges(client_id, month_index); CREATE INDEX idx_charges_group ON contract_charges(installment_group);`
RLS: `SELECT admin,manager,finance,sales,csm` / `ALL admin,finance,sales` (manager read-only) via `get_user_role()`.
Trigger: `fn_check_charges_contiguous()` ensures no gaps in `month_index` per `client_id, kind` (warning not error for draft).

**`billing_os_tiers` (1..5 tiers configuráveis, franquia=tier1)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `client_id` | `int FK clients(id) ON DELETE CASCADE NOT NULL` | PK part | |
| `tier_order` | `smallint CHECK (tier_order BETWEEN 1 AND 5) NOT NULL` | PK part | 1..5, configurável (se 3, só 3 rows) |
| `limit_to` | `int CHECK (limit_to >0) NOT NULL` | | upper bound inclusive; last tier = max |
| `fixed_value` | `numeric(12,2) CHECK (fixed_value >0) NOT NULL` | | ex: 3850, 4620 |
| `excess_unit_price` | `numeric(12,4) DEFAULT 0.95 CHECK (excess_unit_price >=0)` | | por serviço além do último tier |
| `PRIMARY KEY (client_id, tier_order)` | | | |

Index: `idx_os_tiers_client` (PK covers).
RLS: same as charges.
Trigger: `fn_check_os_tiers_order()` ensures `limit_to` strictly increasing per client (decision 7/8): `tier.limit_to` crescente, `franquia_min = tier1.limit_to` (ex: 2000).

**`client_handovers` (Handoff Comercial → Onboarding, 10 perguntas, JSONB hybrid)**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `client_id` | `int PK FK clients(id) ON DELETE CASCADE` | PK | 1:1 |
| `template_version` | `text NOT NULL DEFAULT 'v1'` | | for future template evolution |
| `answers` | `jsonb NOT NULL DEFAULT '{}'::jsonb` | `CHECK (answers ? 'contexto')` when `lifecycle=cliente` enforced app-level | keys: `contexto, como_trabalha, problemas, impactos, necessidades, resultados_esperados, criterios_sucesso, pessoas, expectativas, riscos, motivo_compra` (10 Q) |
| `migrated_from_description` | `boolean DEFAULT false` | | true if `description` → `contexto` |
| `updated_by` | `uuid FK profiles(id)` | | |
| `updated_at` | `timestamptz default now()` | | |
| `created_at` | `timestamptz default now()` | | |

Optional template table `client_handover_templates(id, version, structure jsonb {sections:[{questions:[{key,label,placeholder,required}]}]})` like `brief_templates`.

Index: `GIN (answers)` + `idx_handovers_client`.
RLS: `SELECT admin,manager,finance,sales,csm` / `ALL admin,manager,sales` (write), `anon/public` REVOKE.
Migration: `INSERT INTO client_handovers (client_id, answers, migrated_from_description) SELECT id, jsonb_build_object('contexto', description), true FROM clients WHERE description IS NOT NULL ON CONFLICT DO NOTHING;` then `COMMENT ON COLUMN clients.description IS 'deprecated: use client_handovers';` + later DROP.

**`billing_payments` (adimplência — decision §4.6, lives in financeiro-cockpit SDD but referenced here)**

```sql
CREATE TABLE billing_payments (
  client_id int REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  ref_month text CHECK (ref_month ~ '^[0-9]{4}-[0-9]{2}$') NOT NULL,
  status text CHECK (status IN ('adimplente','inadimplente')) NOT NULL,
  delay_days int DEFAULT 0 CHECK (delay_days >=0),
  paid_at date,
  note text,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, ref_month)
);
-- RLS SELECT admin,manager,finance,sales / WRITE admin,finance
-- Trigger AFTER INSERT/UPDATE → UPDATE clients.delay_days = (SELECT delay_days FROM billing_payments WHERE client_id=NEW.client_id ORDER BY ref_month DESC LIMIT 1)
-- RPC get_financeiro_cockpit LEFT JOIN billing_payments for T6 Valor em atraso + health_financeiro
```

### 4.3 Contract motor — Regras contíguas → expansão

**UX (ContractChargesSection):**

- Input `Duração do contrato: [36] meses` (1..120, default 36, placeholder "ex: 120")
- Regras: `[{from:1,to:2,mode:'absolute',value:2000}, {from:3,to:3,mode:'percent',value:80}, {from:4,to:36,mode:'base',value:3850}]` where `mode=base` is sugar for `absolute=valor_corr`
- Rules must be contiguous, cover `1..N`, no gaps/overlaps, sorted by `from`. Validation `validateRulesContiguous` client + trigger `fn_check_charges_contiguous` DB (soft warning for draft).
- **Preview:** expand rules to 1..N table `Mês | Valor (BRL) | Modo | Acumulado | MRR` via `expandRulesToCharges(rules, N)` (`src/lib/contractRules.js:expandRulesToCharges`). Click month → override modal (single `contract_charges` row with `reason`).
- **Eventuais:** separate table `+ Adicionar eventual [Implantação] [R$ 5000] [3 parcelas] [grupo]` → creates 3 rows `month_index 1..3` with same `installment_group`, `label`, `due_date` logic (parcela 1 = `contract_start`, rest +1 month).
- **Persistência:** on save, `expandRulesToCharges` → `DELETE FROM contract_charges WHERE client_id=$1 AND kind='recorrencia'` + `INSERT` expanded rows (upsert). Eventuais `INSERT` with `installment_group`.

**Cockpit wiring:** `get_financeiro_cockpit(p_ref_month)` computes `month_idx = months_between(contract_start, p_ref_month::date)`, then `LEFT JOIN contract_charges cc ON cc.client_id=c.id AND cc.month_index=month_idx` → `mrr_real = coalesce(cc.amount, cc.percent*valor_corr/100, tier_or_base)` (see §4.1).

### 4.4 Handover — 10 perguntas

Keys (decision 11, 10 Q + contexto renomeado "Handoff"):

```
contexto              → Handoff Comercial → Onboarding (migrado de description)
como_trabalha         → Como o cliente trabalha hoje? (situação atual, processos, ferramentas, volume)
problemas             → Quais problemas o cliente quer resolver?
impactos              → Quais são as consequências desses problemas?
necessidades          → O que o cliente precisa que a solução resolva?
resultados_esperados  → Quais resultados concretos o cliente espera alcançar?
criterios_sucesso     → Como saberemos que o projeto foi bem-sucedido?
pessoas               → Quem são os principais envolvidos, usuários, decisores e patrocinadores?
expectativas          → Que expectativas ou compromissos foram estabelecidos durante a venda?
riscos                → Quais riscos, resistências ou particularidades o onboarding precisa conhecer?
motivo_compra         → Por que o cliente escolheu nossa solução?
```

- Template: `client_handover_templates.structure jsonb` like `brief_templates` — `sections:[{title:"Handoff", questions:[{key,label,placeholder,required, type:"textarea"}]}]`
- UI: `HandoverSection.jsx` accordion 10 `textarea` (rows 3), progress `6/10`, required if `lifecycle_stage='cliente'` (block save + scrollTo first error). Draft autosave.
- Display: `ClientSubDados` card "Handoff Comercial → Onboarding" collapsed (show `contexto` preview + `+ Ver 10 perguntas`), expand accordion read-only. `ClientSubProjetos` mirror same card read-only (decision 11b).

### 4.5 Frontend data shapes

```typescript
interface ContractRule { from: number, to: number, mode: 'absolute'|'percent'|'base', value: number, label?: string }
interface ContractCharge { month_index: number, kind: 'implantacao'|'recorrencia', mode, amount?, percent?, installment_group?, label? }
interface OsTier { tier_order: 1..5, limit_to: number, fixed_value: number, excess_unit_price: number }
interface HandoverAnswers { contexto: string, como_trabalha: string, problemas: string, impactos: string, necessidades: string, resultados_esperados: string, criterios_sucesso: string, pessoas: string, expectativas: string, riscos: string, motivo_compra: string }
type BillingStatus = 'ativo'|'suspenso'|'nao_bilhetavel'
interface BillingPayment { ref_month: string, status: 'adimplente'|'inadimplente', delay_days: number, paid_at?: string }
```

### 4.6 Adimplência — separação de responsabilidade (decision do usuário: cockpit, não form)

- **Form Empresas v2:** NÃO contém `delay_days`, `adimplente`, `paid_at`. Apenas `billing_status` contratual.
- **Cockpit Financeiro:** owns `billing_payments(client_id,ref_month)` (tabela criada no SDD Financeiro Phase 3.5, referenciada aqui). Finance marca `status`/`delay_days`/`paid_at` por `ref_month` na linha expandida (badge `Adimplente` verde / `Inadimplente 12d` vermelho, toggle `applied` já existente para correção, novo `paid_at` date).
- **Health wiring:** `billing_payments` trigger mirrors `clients.delay_days` (latest `ref_month`) so `healthScore.js:179` + `health-recalc` unchanged. `ClientSubDados` shows read-only mirror `Último status: Inadimplente (12 dias) — ref 2026-08` via `useClient` join `billing_payments ORDER BY ref_month DESC LIMIT 1`.

---

## 5. Implementation Phases

### Phase 1 — DB core + flag + página esqueleto (sem contrato motor)

**Status:** Not started

**Rationale:** Base DDL + página navegável já valida reordenação tabs, 4 decimais e billing_status sem risco do motor complexo. Flag kill-switch.

#### Checklist

- [ ] **Migration core:** `supabase migration new empresas_form_v2_core` → `20260902000001_empresas_form_v2_core.sql`:
  - [ ] `ALTER TABLE clients ADD COLUMN billing_status text NOT NULL DEFAULT 'ativo' CHECK (ativo,suspenso,nao_bilhetavel)` + `ADD billing_suspended_until date` + `CHECK (status!='suspenso' OR suspended_until IS NOT NULL)` + indexes `idx_clients_billing_status`, `partial idx_clients_billing_suspended_until`
  - [ ] `ALTER TABLE clients ALTER COLUMN billing_base_value TYPE numeric(12,4)` + `ALTER TABLE module_pricing ALTER COLUMN additional_value TYPE numeric(12,4)`
  - [ ] `ALTER TABLE clients ADD COLUMN erp text` + `ADD ti_tipo text CHECK (interna,terceirizada,hibrida,nao_possui)`
  - [ ] `CREATE TRIGGER trg_sync_contract_active` — `NEW.contract_active = (NEW.billing_status='ativo')` for compat `useClients` + `ClientDetail` filters
  - [ ] `INSERT feature_flags ('empresas_form_v2', false, [admin,manager,finance,sales,csm])`
  - [ ] `REVOKE/GRANT` not needed (existing RLS covers `clients`)
- [ ] **Extract content:** Create `src/components/clients/ClientFormContent.jsx` — move `TABS`, `EMPTY`, `form` state, `maskCNPJ/maskCEP/fetchCEP`, `handleLogoChange/uploadLogo`, `selectedCatalog/modPricing`, `validateMods` from `ClientForm.jsx:14-327` unchanged, props `{client, onSuccess}` (no `Modal`), keep `fmtBRL` with 4 dec support
- [ ] **Wrapper compat:** Modify `src/components/clients/ClientForm.jsx` — `export function ClientForm(props){ return <Modal max-w-3xl><ClientFormContent {...props} onSuccess={props.onClose}/></Modal>}` + re-export `ClientFormContent` for page
- [ ] **Page:** Create `src/pages/ClientFormPage.jsx`:
  - [ ] `useParams id`, `useClient(id)` (when edit), `useAuth`, `useFeatureFlags` gate `empresas_form_v2` → if off `Navigate to /empresas` + toast
  - [ ] Wrapper `p-6 max-w-6xl mx-auto` + `BackButton → /empresas` + `PageHeader title={isEdit?Edit:Nova}` + header sticky `Cancelar/Salvar rascunho/Salvar`
  - [ ] `TABS` new order `['Dados da Empresa','Endereço','Contrato','Operacional']`, stepper lateral 240px `sticky top-16`, dots progress, `activeStep` state
  - [ ] Step 0 Dados: move `site` out, keep `name*, fantasy, lifecycle, cnpj, segment, csm, comercial, contract_active toggle` (deprecated mirror)
  - [ ] Step 1 Endereço: full `address_*` + `site` input `https://`, `fetchCEP` onBlur
  - [ ] Step 2 Contrato skeleton: `billing_type`, `billing_base_value step 0.0001`, `billing_floor`, dates, `correction_index`, `mrrMinimo` card, `BillingStatusField` (3 states + date), placeholder `ContractChargesSection` + `OsTiersSection` (empty)
  - [ ] Step 3 Operacional skeleton: `stage`, `unidades_total` (label "Total de unidades/lojas da rede — potencial expansão"), `unidades_donc` (label "Unidades previstas para início do projeto"), `abc_class`, `erp`, `ti_tipo`, catalog chips, placeholder `HandoverSection`
  - [ ] Resumo sticky 320px `MRR live + billing_status badge`
  - [ ] `validateStep(step)` per step + `Anterior/Próximo` + `dots` + final `Salvar` calls `handleSubmit` → `useClientMutations` + `saveModPricing`
- [ ] **Routing:** Modify `src/App.jsx` — `import ClientFormPage` + `<Route path="/empresas/nova" element={<ClientFormPage/>}/>` + `<Route path="/empresas/:id/editar" element={<ClientFormPage/>}/>` inside `PrivateRoute > AppLayout`, before `:id` route (order matters)
- [ ] **CTA:** Modify `src/components/clients/ClientsPage.jsx` — `+ Nova Empresa` → `if isEnabled('empresas_form_v2') navigate('/empresas/nova') else setShowForm(true)`; `ClientDetail.jsx` `Editar` similarly
- [ ] **Helpers:** Create `src/lib/contractRules.js` — `validateRulesContiguous(rules,N)`, `expandRulesToCharges`, `fmtBRL4`, `handoverKeys` const (10 keys), `tiTipoOptions`
- [ ] **Icons:** Verify `src/lib/icons.js` — add `Building2, MapPin, Wallet, Handshake, FileText, CalendarOff` alphabetically if missing, check duplicates
- [ ] **Build:** `npm run build` with no errors
- [ ] **DB push:** `supabase db push --include-all` — verify `billing_status` + `erp/ti_tipo` in Table Editor + `feature_flags empresas_form_v2` exists `enabled false`
- [ ] **Commit:** `git add supabase/migrations/20260902000001_empresas_form_v2_core.sql src/components/clients/ClientFormContent.jsx src/components/clients/ClientForm.jsx src/pages/ClientFormPage.jsx src/hooks/useClients.js src/lib/contractRules.js src/lib/billing.js src/lib/icons.js src/App.jsx src/components/clients/ClientsPage.jsx src/components/clients/ClientDetail.jsx && git commit -m "feat(empresas): phase 1 core + page skeleton + billing_status + 4dec" && git push origin main`

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 2 — Handover + Operacional + health fallback

**Status:** Not started

**Rationale:** Handover é o maior campo novo textual, mas sem dependência do motor financeiro. Isolar permite validar template JSONB + migração `description` → `contexto` antes de tocar `contract_charges`.

#### Checklist

- [ ] **Migration handover:** `supabase migration new empresas_form_v2_handover` → `20260902000002_empresas_form_v2_handover.sql`:
  - [ ] `CREATE TABLE client_handover_templates (id uuid PK default gen_random_uuid(), version text UNIQUE NOT NULL, structure jsonb NOT NULL, created_at timestamptz default now())` + seed `v1` with 10 Q structure
  - [ ] `CREATE TABLE client_handovers (client_id int PK FK clients ON DELETE CASCADE, template_version text NOT NULL DEFAULT 'v1', answers jsonb NOT NULL DEFAULT '{}', migrated_from_description boolean DEFAULT false, updated_by uuid FK profiles, updated_at/created_at)` + `GIN (answers)` + RLS `SELECT admin,manager,finance,sales,csm` / `ALL admin,manager,sales` + `REVOKE anon/public GRANT authenticated`
  - [ ] `INSERT INTO client_handovers (client_id, answers, migrated_from_description) SELECT id, jsonb_build_object('contexto', description), true FROM clients WHERE description IS NOT NULL ON CONFLICT DO NOTHING;`
  - [ ] Keep `clients.description` deprecated (COMMENT) — DROP in Phase 5 after verification
- [ ] **Hooks:** Create `src/hooks/useClientHandovers.js` — `useClientHandovers(clientId)` `select * from client_handovers where client_id=eq`, `useHandoverTemplates`, `useHandoverMutations` (upsert)
- [ ] **Component:** Create `src/components/clients/sections/HandoverSection.jsx`:
  - [ ] Props `{value: HandoverAnswers, onChange, errors, template}` — maps `handoverKeys` (10) to `textarea rows 3` inside accordion `border rounded-lg` per Q, `label-sm` + `placeholder` from template, `required` asterisk if `lifecycle=cliente`
  - [ ] Progress `6/10` + `expand all/collapse` + `validateHandover` (all 10 required if `cliente`, else `contexto` required)
  - [ ] Autosave debounce 800ms (optional) via `onChange`
- [ ] **Integrate:** Modify `src/components/clients/ClientFormContent.jsx` Step 3 Operacional:
  - [ ] Replace `textarea description` (was `ClientForm.jsx:689-699`) with `<HandoverSection value={handover} onChange={setHandover} errors={handoverErrors} />`
  - [ ] Add `erp` text input + `ti_tipo` select (4 options) + move `abc_class` from Dados, keep `unidades_total/donc` with new labels
  - [ ] Remove `onb_start/golive` inputs (keep state for compat, but hide)
  - [ ] On submit: `await supabase.from('client_handovers').upsert({client_id, answers:handover, template_version:'v1', updated_by:profile.id})` after `clientId` resolved
- [ ] **Display:** Modify `src/components/clients/tabs/operacional/ClientSubDados.jsx`:
  - [ ] Remove `InfoRow Início Onboarding / Go Live` (lines 278-279)
  - [ ] Add `InfoRow ERP / TI` + `InfoRow Unidades total (potencial)` + `InfoRow ABC` (moved)
  - [ ] Add card `Handoff Comercial → Onboarding` — collapsed shows `answers.contexto` preview (line-clamp 3) + `+ Ver 10 perguntas` expand accordion read-only (reuse `HandoverSection` with `readOnly` prop)
  - [ ] Add mirror `Adimplência` badge read-only `Último status: Inadimplente (12d) — ref 2026-08` via `billing_payments` latest (if exists) else `clients.delay_days` fallback
- [ ] **Mirror:** Modify `src/components/clients/tabs/operacional/ClientSubProjetos.jsx` — add same HandoverMirrorCard read-only at top (decision 11b)
- [ ] **Health fallback:** Modify `src/lib/healthScore.js:179` — `const refDate = client.projects?.[0]?.start_date || client.contract_start` (replace `golive`), update `ClientTabOverview.jsx:199,219,503` `monthsSinceGoLive → monthsSinceProjectStart`, `ClientHealthDrawer.jsx:349`, `supabase/functions/health-recalc/index.ts:209,481` — fallback to `project.start_date` or `contract_start`
- [ ] **Hooks:** Modify `src/hooks/useClient.js` — `select` includes `client_handovers(*)` + `projects(start_date,end_date)` + latest `billing_payments` (via `order ref_month desc limit 1` or view)
- [ ] **Build:** `npm run build`
- [ ] **DB push:** `supabase db push --include-all` — verify `client_handovers` populated with migrated `description`
- [ ] **Verify:** create client `lifecycle=cliente` without handover → block save + scrollTo; edit existing with `description` → shows in `contexto`; detail `ClientSubDados` no longer shows `onb_start/golive`
- [ ] **Commit:** `git add supabase/migrations/20260902000002_empresas_form_v2_handover.sql src/hooks/useClientHandovers.js src/components/clients/sections/HandoverSection.jsx src/components/clients/ClientFormContent.jsx src/components/clients/tabs/operacional/ClientSubDados.jsx src/components/clients/tabs/operacional/ClientSubProjetos.jsx src/lib/healthScore.js supabase/functions/health-recalc/index.ts src/components/clients/ClientTabOverview.jsx src/components/clients/ClientHealthDrawer.jsx src/hooks/useClient.js && git commit -m "feat(empresas): phase 2 handover + operacional + health fallback" && git push origin main`

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 3 — Motor de contrato (regras contíguas, tiers, eventuais)

**Status:** Not started

**Rationale:** Maior risco financeiro. Isolado após handover para testar `contract_charges` expansão + `billing_os_tiers` sem travar página inteira. Reuso `contractRules.js` + cockpit `billing_status` 3 states.

#### Checklist

- [ ] **Migration contract:** `supabase migration new empresas_form_v2_contract` → `20260902000003_empresas_form_v2_contract.sql`:
  - [ ] `CREATE TABLE contract_charges` (§4.2) + `UNIQUE` + `CHECK xor` + indexes + RLS
  - [ ] `CREATE TABLE billing_os_tiers` (§4.2) + `PRIMARY KEY (client_id,tier_order)` + RLS
  - [ ] `CREATE OR REPLACE FUNCTION fn_check_os_tiers_order()` + `TRIGGER trg_os_tiers_order BEFORE INSERT OR UPDATE`
  - [ ] `CREATE OR REPLACE FUNCTION fn_check_charges_xor()` (if not CHECK) + `REVOKE/GRANT`
  - [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policies `SELECT admin,manager,finance,sales,csm` / `ALL admin,finance,sales`
- [ ] **Helpers:** Complete `src/lib/contractRules.js`:
  - [ ] `expandRulesToCharges(rules: ContractRule[], N: number): ContractCharge[]` — iterate `from..to` contiguous, map `mode percent → percent`, `absolute/base → amount`
  - [ ] `validateRulesContiguous(rules,N) → {ok, error, gapAt}` — sorted, cover 1..N, no overlap
  - [ ] `validateOsTiers(tiers) → {ok, error}` — `limit_to` strictly increasing, `1..5` rows, `excess >=0`
  - [ ] `previewMRR(rules, tiers, base, refMonth) → {mrr, tierApplied}`
  - [ ] `formatBRL4(n)` + `parseBRL4`
- [ ] **Hooks:** Create `src/hooks/useContractCharges.js` + `src/hooks/useBillingOsTiers.js` — `useQuery ['contract_charges', clientId]` + `useMutation saveAll` (delete+insert), `useBillingOsTiers` similarly
- [ ] **Component Eventuais+Recorrência:** Create `src/components/clients/sections/ContractChargesSection.jsx`:
  - [ ] Props `{rules, onChange, N, onNChange, charges, readOnly}` — duration input `N 1..120`, rules table `Meses de-até | Modo select absoluto|percent|base | Valor input | Ações +/−`, `+ Adicionar regra` (auto `from=last.to+1, to=N`)
  - [ ] Eventuais subsection: table `Label | Valor R$ | Parcelas | Grupo | + Adicionar eventual` → on add creates `installment_group uuid`
  - [ ] Preview expand `Mês | Valor | Modo` collapsible (default hidden, show on `Preview 1..N ▼`), `totalMRR` card
  - [ ] Validation `validateRulesContiguous` inline `gap at mês X` + red border
  - [ ] On save: `expandRulesToCharges(rules,N)` → `await saveContractCharges({clientId, charges: expanded})`
- [ ] **Component Tiers:** Create `src/components/clients/sections/OsTiersSection.jsx`:
  - [ ] Props `{tiers, onChange, billingType}` — only render if `por_os`, `1..5` rows `Até (serviços) | R$/mês | Excedente R$/serviço (only last row editable, others 0)` + `+ Adicionar tier` (max 5) / `Remover`, `limit_to` increasing validation live
  - [ ] Info `Franquia mínima = Até do tier 1 (ex: 2000 serviços)` + `excedente_unit_price` input `step 0.0001`
  - [ ] On save: `saveBillingOsTiers({clientId, tiers})`
- [ ] **Billing status:** Create `src/components/clients/sections/BillingStatusField.jsx`:
  - [ ] `select billing_status ativo|suspenso|nao_bilhetavel` + if `suspenso` show `suspended_until date` required `> today`, inline error
- [ ] **Integrate:** Modify `src/components/clients/ClientFormContent.jsx` Step 2 Contrato:
  - [ ] Replace skeleton with `<BillingStatusField/>` + `<ContractChargesSection/>` + `<OsTiersSection/>` (conditional `por_os`)
  - [ ] Keep `billing_type/base/floor/dates/correction/mrr` + move `correction_index` to here
  - [ ] On submit: after `clientId`, `await saveContractCharges` + `saveBillingOsTiers` (if `por_os`)
  - [ ] `validateStep(2)` checks `billing_base_value` 4 dec, `suspended_until`, `rules contiguous`, `tiers increasing`
- [ ] **Build:** `npm run build`
- [ ] **DB push:** `supabase db push --include-all` — verify `contract_charges` + `billing_os_tiers` RLS via `get_user_role` matrix
- [ ] **Verify:** create client `billing_type=por_os`, N=60, 3 rules (1-2 absoluto 2000, 3 percent 80, 4-60 base 3850), 3 tiers + excedente 0.95 → save → `select * from contract_charges where client_id=X order by month_index` shows 60 rows + tiers 3 rows → `get_financeiro_cockpit('2026-09')` returns correct `mrr_real` (if cockpit phase done) else manual `previewMRR` matches DB
- [ ] **Commit:** `git add supabase/migrations/20260902000003_empresas_form_v2_contract.sql src/lib/contractRules.js src/hooks/useContractCharges.js src/hooks/useBillingOsTiers.js src/components/clients/sections/ContractChargesSection.jsx src/components/clients/sections/OsTiersSection.jsx src/components/clients/sections/BillingStatusField.jsx src/components/clients/ClientFormContent.jsx && git commit -m "feat(empresas): phase 3 motor contrato (regras contíguas + tiers OS)" && git push origin main`

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Adimplência wiring + cockpit integration + polish

**Status:** Not started

**Rationale:** Adimplência pertence ao cockpit (decision §4.6), mas form precisa espelho read-only. Fase integra `billing_payments` (criada no SDD Financeiro Phase 3.5) e poli página.

#### Checklist

- [ ] **DB adimplência (if not yet in financeiro SDD):** `supabase migration new empresas_form_v2_cockpit_adimplencia` → `20260902000004_empresas_form_v2_cockpit_adimplencia.sql`:
  - [ ] `CREATE TABLE billing_payments` (§4.2) + RLS `SELECT admin,manager,finance,sales` / `ALL admin,finance` + `REVOKE anon/public GRANT authenticated`
  - [ ] `CREATE OR REPLACE FUNCTION sync_delay_days() RETURNS trigger` + `TRIGGER trg_sync_delay_days AFTER INSERT OR UPDATE ON billing_payments FOR EACH ROW EXECUTE FUNCTION sync_delay_days()` (mirrors latest `delay_days` to `clients`)
  - [ ] `CREATE OR REPLACE FUNCTION get_billing_status_effective(client_id int, ref_month text)` helper for cockpit (optional)
- [ ] **Cockpit wiring:** Modify `docs/sdd/financeiro-cockpit-sdd.md` Phase 3.5 — add `billing_payments` table + RPC `get_financeiro_cockpit` `LEFT JOIN billing_payments` + T6 badge `Inadimplente`
- [ ] **Display:** Modify `src/components/clients/tabs/operacional/ClientSubDados.jsx` — add `BillingPaymentsMirror` read-only `Último status: Inadimplente (12d) — ref 2026-08` via `useClient` latest `billing_payments`
- [ ] **Polish:** Modify `src/pages/ClientFormPage.jsx`:
  - [ ] Stepper mobile `tabs sticky top-14`, autosave draft `localStorage empresas_draft_{id}` debounce 800ms, `Salvo 14:32 / Não salvo` indicator
  - [ ] Skeletons `animate-pulse`, empty `py-12`, error `bg-donc-red/10` + retry, `__COMMIT_HASH__` footer
  - [ ] `billing_status` badge colors `ativo bg-donc-verde/10 text-donc-verde`, `suspenso bg-donc-amber/10 text-donc-amber`, `nao_bilhetavel bg-border-tertiary`
- [ ] **Validation global:** `validateStep` all steps + final `lifecycle=cliente` requires `handover.answers.contexto` + all 10 if template `required`, `billing_base_value` 4 dec parse, `suspended_until` required, `rules contiguous`, `tiers increasing`
- [ ] **Fix billing.js:** Modify `src/lib/billing.js` — `calculateUnitValue/base` with 4 dec, `mode='rateio'` default, `validateRateioSum` warning ±0.01 in Contract preview
- [ ] **Build:** `npm run build`
- [ ] **DB push:** `supabase db push --include-all` (if adimplência migration new)
- [ ] **Verify:** finance marks `billing_payments` in cockpit for `2026-08` `inadimplente 12d` → detail `ClientSubDados` shows mirror; health `health_financeiro` drops; `billing_status=suspenso until 2026-12-31` → `get_financeiro_cockpit('2026-09')` returns `mrr_real=0` and `ClientSubDados` badge `Suspenso até 31/12/2026`
- [ ] **Commit:** `git add supabase/migrations/20260902000004_empresas_form_v2_cockpit_adimplencia.sql src/components/clients/tabs/operacional/ClientSubDados.jsx src/pages/ClientFormPage.jsx src/lib/billing.js docs/sdd/financeiro-cockpit-sdd.md && git commit -m "feat(empresas): phase 4 adimplencia mirror + polish" && git push origin main`

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — DROP legado + flag enable + docs + Vercel smoke

**Status:** Not started

**Rationale:** Endurecimento antes de habilitar `empresas_form_v2=true` em produção. Remove `onb_start/golive/description` legado após confirmar migração.

#### Checklist

- [ ] **DROP legado:** `supabase migration new empresas_form_v2_drop_legacy` → `20260902000005_drop_legacy.sql`:
  - [ ] `ALTER TABLE clients DROP COLUMN IF EXISTS onb_start, DROP COLUMN IF EXISTS golive;` (keep `description` until handover verified, then DROP)
  - [ ] `COMMENT ON COLUMN clients.contract_active IS 'deprecated: use billing_status';`
  - [ ] Verify `health-recalc` + `healthScore.js` no longer reference `golive`/`onb_start` (already patched Phase 2)
- [ ] **Sunset modal:** Modify `src/components/clients/ClientsPage.jsx` + `ClientDetail.jsx` — remove `showForm/showEdit` modal paths, always `navigate('/empresas/...')`; keep `ClientForm.jsx` wrapper for 1 sprint deprecated then delete
- [ ] **Flag enable:** `UPDATE feature_flags SET enabled=true WHERE key='empresas_form_v2'` via SQL (only after QA)
- [ ] **Docs:** Update this SDD — fill all Implementation Logs, update `## 0. Current System State` + `## 6. Current Checkpoint`, add decisions to table
- [ ] **Build & deploy:** `npm run build` — no errors → `git push origin main` → verify Vercel `https://donccx-donccx.vercel.app/empresas/nova` + `/empresas/:id/editar` + detail mirrors
- [ ] **Role QA:** Manual matrix — `admin/finance/sales` write contract/handover/billing_status ok, `manager` read-only, `csm` read-only, `analyst` forbidden; `validateRulesContiguous` gap error, `tiers` increasing error, `handover required` if `cliente`
- [ ] **DONC failure:** no change (cockpit handles `sync_service_log failed` banner)
- [ ] **Commit:** `git add docs/sdd/empresas-form-v2-sdd.md supabase/migrations/20260902000005_drop_legacy.sql src/components/clients/ClientsPage.jsx src/components/clients/ClientDetail.jsx && git commit -m "feat(empresas): phase 5 drop legacy + enable + docs" && git push origin main`

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 6. Current Checkpoint

### Production state

- SDD v1.0 draft criado (this file). Nenhuma fase implementada. Next: Phase 1 `supabase migration new empresas_form_v2_core`.
- **UI/UX pass (2026-09-02):** aba Contrato reorganizada em blocos planos `<FormSection>` (ver `docs/ui-patterns.md` #25) para linguagem de comercial/financeiro — sem nomes de tabela/coluna na tela ("Motor de contrato — recorrência" → "Evolução da recorrência (MRR)"; "Valores eventuais" → "Cobranças Eventuais"; "Rateio por módulo" → "Divisão do MRR por produto"; "Não bilhetável" → "Não cobrar"; "Mensalidade base" → "MRR base"). Explicações movidas para `<InfoHint>` (popover `?`); validação só exibe banner em erro. Toggle "Contrato ativo" removido da aba Dados (derivado de `billing_status` no save). Ver `docs/modules/clients.md` → "Empresas Form v2 — dedicated page".
  - **Decisão revista — handover nunca é obrigatório.** As linhas "required if `lifecycle=cliente`" / "block save + scrollTo" / `validateHandover` (§3, §4.4, §5, §7) **não valem mais**: nenhum `lifecycle_stage` bloqueia o save por causa do handoff. Gravação em `client_handovers` dispara se qualquer um dos 10 campos estiver preenchido.
  - **Regra de gravação — MRR:** `clients.mrr` grava `0` quando `billing_status != 'ativo'` (era: sempre o mínimo contratual).
  - `EmpresasV2Page` ganhou seletor "Editar empresa existente" (`useAllClients`). Bugs corrigidos: motor não persistia no cadastro novo (`client_id=undefined`); form não recarregava ao reeditar (`key` + `removeQueries`).
- `empresas_form_v2` flag não existe (criado Phase 1 `enabled false`).
- `financial_data` enabled true; `cockpit_financeiro` pending (SDD Financeiro Phase 1).
- `onb_start/golive/description` ainda em `clients` (serão dropados Phase 2/5).

### Architectural decisions

| Decision | Rationale |
|---|---|
| Página dedicada `/empresas/nova` + `/empresas/:id/editar` (not modal) | Modal `max-w-3xl` já no limite 778L (`ClientForm:14`); contrato motor 120 meses + 5 tiers + handover 10 Q estoura scroll/accordion. Precedente `ReportEditorPage` + `OnboardingDetailPage` prova que edição complexa = rota. Reuso `ClientFormContent` mantém compat 1 sprint. |
| Tabs reordenadas `Dados → Endereço → Contrato → Operacional` | Solicitante: fluxo mais natural; `site` → Endereço, `unidades_total` → Operacional (potencial expansão), `abc_class` → Operacional. |
| `billing_status ativo/suspenso/nao_bilhetavel + suspended_until` | 3 states (decision 3b). `suspenso` zera MRR no mês (`billing_status!='ativo' → mrr=0`, decision 4b). `contract_active` mantido via trigger compat. |
| `billing_base_value/excess_unit_price numeric(12,4)` | Suporta 4 decimais (R$0,95 exigido + futuro 1,2345). |
| Motor de contrato: regras contíguas → expansão 1..N | Evita preencher 120 linhas; 2-4 regras cobrem `1..N` (decision intervals contíguos, 36 média, 60/120 sem limite). `mode absolute|percent` cobre valor fixo ou % do base por intervalo. Expansão para `contract_charges` 1 row per month facilita `JOIN month_index` no cockpit. |
| Eventuais com `installment_group uuid` | Implantação parcelada (ex: 3x) groups rows via `installment_group`. |
| `billing_os_tiers` 1..5 normalizado, franquia=tier1 | 1..5 configurável (decision 7), franquia mínima = tier1.limit_to (2000). `limit_to` strictly increasing via trigger. Excedente `excess_unit_price` 4 dec (0,95). |
| Handover 10 Q JSONB hybrid `client_handovers` | Texto livre, sem agregação, template versionável como `brief_templates`. JSONB evita 10 `ALTER ADD COLUMN` por pergunta nova. Hybrid satélite dá `FK/RLS/audit` sem inflar `clients`. Decision 11: template like brief, required if `lifecycle=cliente`, read-only mirror in Projetos. `description` → `contexto` ("Handoff Comercial → Onboarding", decision 12). |
| Normalizado para financeiro (`contract_charges/billing_os_tiers`), JSONB para documentação (`handovers`) | BRD §14 already rejected `jsonb exceptions` for financeiro (needs `SUM/WHERE`, `CHECK`, `RLS`). Same split here. |
| `erp` livre + `ti_tipo` enum | Informativo (decision 9/10). |
| `onb_start/golive` → `projects.start_date / onboarding GoLive occurred_at` | Legado (decision 13); `healthScore.js:179` fallback already exists `golive||contract_start`, now `project.start_date||contract_start`. |
| Adimplência no Cockpit (`billing_payments`), não no Form | Cobrança externa sem integração (decision §4.6). Finance marca por `ref_month` no cockpit (onde já faz MRR), trigger mirrors `clients.delay_days` for health. Form shows read-only mirror latest. |
| Feature flag `empresas_form_v2` dedicated | Kill-switch independente, sunset modal gradual. |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `billing.js` soma `base+sum(mods)` diverge de Q2 rateio, infla MRR | Phase 4: `mode='rateio'` default + `validateRateioSum` warning ±0,01 na UI; manter `mode='legacy'` for callers antigos. Teste com Exemplo A/B BRD §6. |
| Regras não contíguas (gap/overlap) gera `mrr_real` errado no cockpit | `validateRulesContiguous` client + `fn_check_charges_contiguous` DB (soft warning draft, error on `empresas_form_v2=true` strict). Preview 1..N mostra gaps em vermelho. |
| Tiers com `limit_to` fora de ordem quebram `billable_os` | Trigger `fn_check_os_tiers_order` raises `23514 tier limit_to must be strictly increasing`; UI validates live before save. |
| Handover sem `contexto` quando `lifecycle=cliente` | `validateHandover` blocks save + `scrollTo first error` + `CHECK answers ? 'contexto'` (app-level when `lifecycle=cliente`). |
| `onb_start/golive` DROP quebra health | Phase 2 patches `healthScore.js`, `ClientTabOverview`, `ClientHealthDrawer`, `health-recalc` to `project.start_date` fallback + verify `health_trend` recalc. |
| `suspended_until` null when `suspenso` | `CHECK (billing_status!='suspenso' OR suspended_until IS NOT NULL)` + `validateStep` error + date `> today`. |
| `billing_base_value` 4 dec rounding diverges `mrr` | `numeric(12,4)` + `fmtBRL4` with `minimumFractionDigits 2` (display) but DB keeps 4; `calculateUnitValue` uses full precision. |
| Flag enabled before DB push | Migrations `enabled false` + enable manual only Phase 5 via SQL + `isEnabled` gate in route + CTA. |
| Modal sunset breaks `+ Nova Empresa` fast path | Keep wrapper compat `ClientForm` → `Modal+Content` until Phase 5, CTA checks flag; no breaking. |
| Performance `contract_charges` 60k rows (500*120) | `B-tree (client_id, month_index)` + `LEFT JOIN` single month per cockpit row (~5ms); not `jsonb_array_elements` per query. |
| Retroatividade handover `description` migration lost | `INSERT ... ON CONFLICT DO NOTHING` + `migrated_from_description` flag + verify `SELECT count(*) FROM client_handovers JOIN clients ON clients.description IS NOT NULL` before DROP. |

---

## 8. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js` (import at top + alphabetical entry, check duplicates before adding).
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main` — no branches, no worktrees. Push to `origin main`.
- **No local Supabase:** all DB/functions changes go directly to production (`supabase db push --include-all` + `supabase functions deploy`). No Docker.
- **Build verify:** `npm run build` is mandatory before every `git push` (Vite `build.minify false`, `__COMMIT_HASH__` via `vite.config.js`).
- **Vercel:** SPA rewrite `/(.*) -> /index.html` in `vercel.json`.
- **Empresas-specific:**
  - `TABS` order is `Dados, Endereço, Contrato, Operacional` — do NOT revert to old `Dados, Contrato, Operacional, Endereço` (`ClientForm.jsx:14`).
  - `unidades_total` lives in Operacional (potencial), not Dados; `abc_class` Operacional; `site` Endereço.
  - `billing_base_value` step `0.0001` (4 dec), not `0.01`; `excess_unit_price` 4 dec.
  - `billing_status` 3 states + `suspended_until` required if `suspenso`; `contract_active` is deprecated mirror.
  - `onb_start/golive/description` are deprecated — do NOT add new refs; use `projects.start_date`, `onboarding GoLive`, `client_handovers`.
  - After `supabase functions deploy`, "Verify JWT" re-enables — check Dashboard.
  - Work on `main` directly — no branches.

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

- [x] Section 0 reflects actual current state (verified `20260503031721`, `ClientForm.jsx:14`, `ClientSubDados.jsx:274`, `healthScore.js:179`)
- [x] Files to be touched verified to exist (or confirmed not to exist): `src/components/clients/ClientForm.jsx`, `src/pages/ReportEditorPage.jsx`, `src/hooks/useClients.js`, `supabase/migrations/*`
- [x] Data contracts reference real column names (`clients.billing_status/billing_base_value/erp/ti_tipo`, `contract_charges`, `billing_os_tiers`, `client_handovers`)
- [x] Color tokens, icon names, component APIs verified (`tailwind.config.js #173557/#1D9E75/#f7f7f5`, `Wallet` in `src/lib/icons.js`)
- [x] Active phase clearly identified (Phase 1 — Not started)
- [x] Gotchas includes project-wide traps (icons, Supabase deploy, branch)
- [x] Language convention followed (English for LLM instructions/data contracts, Portuguese for rationale where product decision)

---

## Histórico

| Versão | Data | Autor | Mudança |
|---|---|---|---|
| 1.0 | 2026-09-01 | DoncCX Hub | Draft inicial pós-discovery (3 sub-agentes) + decisões 1–14 + motor regras contíguas + adimplência no cockpit |

---

## Aprovação

| Papel | Nome | Assinatura | Data |
|---|---|---|---|
| Produto | | | |
| Finance | | | |
| CS | | | |
| Tech | | | |
