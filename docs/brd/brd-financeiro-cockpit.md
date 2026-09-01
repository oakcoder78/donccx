# BRD — Cockpit Financeiro (Finance Cockpit)

**Data:** 2026-08-31
**Status:** validado — Q4a/Q4b/Q6 confirmados, pronto para SDD
**Autores:** DoncCX Hub (via subagents explore + docs-writer)
**Feature flag proposta:** `cockpit_financeiro` (nova, dedicada)
**Flag correlata existente:** `financial_data` (`20260824000006`, `allowed_roles [admin,manager,finance]`, `enabled true`)
**Referência base:** `docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md` (Profissionais Cockpit — template 1:1)
**Stack:** React 18 + Vite 6 + TailwindCSS 3 + Supabase + TanStack Query v5 + react-router-dom v7

---

## 1. Objetivo e Escopo

### 1.1 Objetivo

Expandir o DoncCX Hub para o perfil **Finance** (`src/lib/roles.js`, `profiles_role_check`) com um novo cockpit — **Financeiro** — que consolida os dados de cobrança por cliente a partir do cadastro de empresas (aba **Contrato**) + uso real sincronizado pela **DONC API** (`client_usage.profissionais_versao`), permitindo ao financeiro calcular o **MRR real faturável** (incluindo excedente acima do piso) e gerar relatórios de auditoria fechados por mês.

### 1.2 Escopo (in)

- Dash básico com totalizadores do portfólio no mês de referência.
- Visão por cliente (accordion lazy, como `ProfissionaisCockpitPage.jsx:1-736`) com métricas faturáveis, breakdown por módulo e exceções aplicadas.
- Cálculo de **MRR mínimo garantido** vs **MRR real** (com excedente) por `billing_type`.
- Tratamento de **exceções/negociações** (isenção, desconto, valor reduzido) com vigência e trilha auditável.
- Correção monetária (IPCA/IGPM) com badge e toggle aplicar/não naquela cobrança (fase 1 manual, fase 2 automática).
- Relatórios de auditoria: CSV sintético/analítico + PDF por cliente ou global, colunas CNPJ e SaaS_ID.
- Controle de acesso por role `finance` + flag `cockpit_financeiro`.

### 1.3 Fora de escopo (nesta fase)

- Emissão de NF/fatura ou integração com ERP financeiro.
- Cobrança proporcional (prorata) intra-mês ou multi-moeda.
- Reprocessamento automático de faturamento retroativo — validado Q4b: reprocessa e corrige passado (gera delta e exige reemissão); fora de escopo apenas prorata intra-mês/multi-moeda.

---

## 2. Stakeholders e Papéis

| Papel | Permissão no cockpit | Permissão em exceções |
|-------|----------------------|-----------------------|
| `admin` | leitura + export total | criar/editar/excluir exceções e correções |
| `finance` | leitura + export total | criar/editar/excluir exceções e correções |
| `manager` | leitura + export total | leitura (sem escrita) |
| `sales` | leitura + export total | criar/editar/excluir exceções e correções |
| `csm` / `analyst` | sem acesso | sem acesso |

> Sales como criador de exceções reflete que a negociação nasce no comercial; validado Q4a — sales com escrita total equiparado a admin/finance (manager permanece leitura).

---

## 3. Modelo de Cobrança Vigente

### 3.1 Cadastro — aba Contrato (`src/components/clients/ClientForm.jsx:14,21,469`)

Campos (tabela `public.clients`, `20260503031721_remote_schema.sql`):

| Campo | Coluna | Tipo | Imagens de exemplo |
|-------|--------|------|--------------------|
| Tipo de cobrança | `billing_type` | `text CHECK (por_licenca, por_os)` default `por_licenca` | Img1: `Por OS criada` · Img2: `Por licença ativa (usuários)` |
| Valor base (R$ / licença ou R$ / OS) | `billing_base_value` | `numeric` default 0 | Img1: `1,93` · Img2: `59,9` |
| Piso contratual (unidades mínimas) | `billing_floor` | `integer` default 0 | Img1: `0` · Img2: `50` |
| Data de assinatura | `contract_signed_date` | `date` | Img2: `30/11/2023` |
| Início do contrato | `contract_start` | `date` | Img1: `10/12/2021` · Img2: `30/11/2023` |
| Renovação | `contract_renewal` | `date` | — |
| Índice de correção | `correction_index` | `text` | `IPCA` / `IGPM/IPCA` |
| MRR mínimo (derivado) | `mrr` | `numeric` (cache `floor × valor_unitário`) | Img1: `R$ 0,00` · Img2: `R$ 2.995,00` |
| Contrato ativo | `contract_active` | `boolean` | toggle |
| Identificadores para relatório | `cnpj` / `contract_saas_id` (SaaS_ID Donc) | `text` | relatório Q5 |

**Modificadores por módulo** — seção "Modificadores por módulo" em `ClientForm.jsx:520` (`modPricing` derivado de `solucoes`/`client_catalog`). **Regra correta (Q2): rateio, não soma.** O `billing_base_value` é o total da licença/OS; os valores por módulo são decomposição para estatísticas de recorrência por solução. Ex: licença R$59,90 = Módulo A R$35 + Módulo B R$24,90. A soma dos módulos deve fechar no `billing_base_value`. O código atual `src/lib/billing.js:7` (`unitValue = base + sum(mods)`) está divergente e será corrigido como débito técnico (ver §12).

**Correção monetária** — hoje campo livre `correction_index`; Q3 introduz `correction_percent` + `correction_applied_at` (fase 1 manual, fase 2 cálculo automático).

### 3.2 Uso real — DONC API (`supabase/migrations/20260726180000`, `client_usage`)

- Tabela `client_usage` (`client_id`, `ref_month text YYYY-MM`, `profissionais_versao jsonb`, `pending boolean`, `instance_id`, `estabelecimentos jsonb`).
- `profissionais_versao` array por profissional (`docs/superpowers/specs/2026-07-26-profissionais-cockpit-design.md:16`):

```json
{
  "nome": "ADRIANO",
  "ativo": true,
  "email": "...",
  "dataUltimaOS": "2024-03-07T08:50:17.44",
  "codigoUltimaOS": "73428",
  "dataUltimoLogin": "2026-06-30T14:35:47.193"
}
```

- Populado por Edge Function `donc-api-sync` via `GET https://webhub.donc.com.br/api/DoncCx/{contract_saas_id}?dataInicio=...` no sync mensal (orquestrado por `monthly-sync` + `sync_service_log` granular `20260727210000`).
- Agregação por cliente soma entre `instance_id` quando houver múltiplas instâncias.

---

## 4. Gap Atual

O card "MRR mínimo garantido (piso × valor unitário)" em `ClientForm.jsx:512` reflete apenas `floor × unitValue`. Quando o cliente extrapola o piso, não há visão consolidada do **MRR real faturável** `max(uso, piso) × valor_unitário` nem do **excedente**. O financeiro precisa extrair manualmente por cliente. O cockpit proposto fecha esse gap com cálculo por `ref_month` + totalizadores + auditoria.

---

## 5. Requisitos Funcionais

### 5.1 Dash — totalizadores (mês de referência)

Baseado no padrão `ProfissionaisCockpitPage.jsx:116 KpiCard` (3 colunas, `grid grid-cols-1 sm:grid-cols-3 gap-3`).

| # | Totalizador | Fórmula (portfólio, `contract_active=true`, `lifecycle_stage='cliente'`) | Fonte |
|---|-------------|-----------------------------------------------------------------------------|-------|
| T1 | **MRR mínimo garantido** | `sum(piso × valor_unitário_corrigido_efetivo)` | `clients` + correções + exceções |
| T2 | **MRR real faturável** | `sum(max(uso_ref_month, piso_efetivo) × valor_unitário_corrigido_efetivo)` com exceções aplicadas | `clients` + `client_usage` + exceções |
| T3 | **Excedente (T2−T1)** | `T2 − T1` (destacar se >0) | derivado |
| T4 | **Clientes acima do piso** | `count WHERE uso > piso` | `client_usage` |
| T5 | **Clientes isentos no mês** | `count WHERE exceção isencao_total vigente em ref_month` | `billing_exceptions` |
| T6 | **Valor em atraso** | `sum(MRR_real) WHERE delay_days>0` (reuso `get_finance_summary` `20260830000001`) | `clients.delay_days` |
| T7 | **Renovações 30d** | `count WHERE contract_renewal ∈ [hoje, hoje+30]` | `clients` |

Exibir `T1,T2,T3` como KpiCards principais; `T4-T7` como secondary stats ou segunda linha de KPIs. Deltas vs mês anterior (`ROUND((cur−prev)/prev*100,1)`, `NULL` se `prev=0`) como no Profissionais.

### 5.2 Visão por cliente

Replicar estrutura `ProfissionaisCockpitPage.jsx` §§ B–E:

- **Toolbar:** seletor `ref_month` (dropdown de meses disponíveis via `sync_service_log` `service_name='donc-api'`, default mês anterior), busca por `client_name/CNPJ/SaaS_ID`, filtro `billing_type`, toggle "Só excedentes".
- **Tabela principal** `bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden` + `thead bg-donc-navy text-white text-xs uppercase`:
  `▸ | Cliente (CNPJ·SaaS_ID) | Tipo | Piso | Uso no mês | Billable | Valor unit. | MRR mínimo | MRR real | Exceção | Δ`
  Row highlight `bg-donc-red/10` se queda >35% ou `bg-donc-amber/10` se isento.
- **Row expandida (lazy):** `supabase.rpc('get_financeiro_detalhe', {p_client_id, p_ref_month})` no primeiro expand, cache `detailCache` por `client_id`. Estados loading/skeleton, erro com retry, dados com subtabela.
  - Barra `bg-bg-tertiary/60` com `ViewToggle` por `billing_type`, badges de correção e exceção, botões `CSV Sintético`, `CSV Analítico`, `PDF`.
  - Subtabela: breakdown por módulo (rateio), correção aplicada, exceção vigente, profissionais/OS que compõem o uso (reuso `nome/email/data_ultimo_login/data_ultima_os/codigo_ultima_os` do Profissionais quando `por_licenca`).
- **Última sinc:** `useQuery(['last_donc_sync', refMonth])` em `sync_service_log` `service_name='donc-api' status='success'`, `toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})`.

### 5.3 Fórmula por cliente (Q1 + Q2)

```
uso            = se por_licenca: count(profissionais_versao WHERE ativo=true AND ref_month = p_ref_month)
                 se por_os:       count(profissionais_versao WHERE dataUltimaOS ∈ ref_month)  // mesma fonte, critério OS
                 // Q1: sempre do mês de referência, não do último sync
piso_efetivo   = exceção piso_zerado vigente ? 0 : billing_floor
valor_base_ef  = billing_base_value
valor_corr     = se correção vigente e toggle aplicado: valor_base_ef × (1 + correction_percent/100)
                 senão: valor_base_ef
valor_unitário = valor_corr   // rateio: breakdown por módulo apenas informativo, soma deve fechar em valor_unitário (Q2)
billable       = max(uso, piso_efetivo)
mrr_minimo     = piso_efetivo × valor_corr   // antes de exceção de valor
mrr_real_bruto = billable × valor_corr
mrr_real       = aplicar exceção vigente:
                 isencao_total      → 0
                 desconto_percent   → mrr_real_bruto × (1 − desconto/100)
                 valor_reduzido     → billable × valor_reduzido_corr
                 piso_zerado        → já refletido em piso_efetivo
excedente      = mrr_real − mrr_minimo
```

> Correção do débito técnico `src/lib/billing.js:7`: `calculateMRR` e `calculateUnitValue` somam `base + sum(mods)`; após Q2 devem operar em modo rateio quando `billing_base_value` representa o total (feature flag ou parâmetro `mode='rateio'`).

### 5.4 Rateio por módulo

- Tabela na row expandida: `Módulo | Valor rateado | % do total | Status (implantado/em_implantação/...)`.
- Validação: soma rateada deve fechar em `valor_corr` (tolerância R$0,01); exibir warning se divergir.
- Uso futuro: estatísticas de recorrência por solução (fora do cálculo faturável).

### 5.5 Correção monetária (Q3)

- Campos novos em `clients` ou tabela `billing_corrections` (`client_id`, `ref_month`, `index text`, `percent numeric`, `applied boolean`, `applied_at`, `created_by`):
  - Fase 1 (manual): usuário informa `correction_index` (IPCA/IGPM) e `correction_percent` (ex: 4,62), sistema calcula `valor_corr`. Cockpit exibe badge `Corrigido IPCA 4,62%` e **toggle "Aplicar correção nesta cobrança"** por cliente/mês (default = aplicado se `contract_renewal` vencido). Estado `applied` persiste por `ref_month`.
  - Fase 2 (automática): ao virar `ref_month`, se `correction_index` preenchido e `contract_renewal` no mês, sugerir correção com base no índice oficial (integração futura).
- Toggle afeta `mrr_minimo` e `mrr_real` em tempo real na UI e nos exports.

### 5.6 Exceções / Negociações

Tipos (`billing_exceptions.type` enum):

| Tipo | Parâmetros | Efeito |
|------|------------|--------|
| `isencao_total` | `valid_from`, `valid_to`, `reason` | `mrr_real = 0` no período |
| `desconto_percent` | `percent`, `valid_from/to` | `mrr_real = mrr_real_bruto × (1−percent/100)` |
| `valor_reduzido` | `reduced_value`, `valid_from/to` | `valor_corr` temporário = `reduced_value` (com correção opcional) |
| `piso_zerado` | `valid_from/to` | `piso_efetivo = 0` no período |

- **Onde indicar:** nova aba/seção "Exceções" em `ClientForm.jsx` (ao lado de Contrato) + listagem e criação inline no cockpit (drawer/modal como `AsanaReviewModal`). Acesso escrita total `admin, finance e sales`; `manager` leitura.
- **Vigência:** `valid_from`/`valid_to` como `date`; exceção vigente se `ref_month ∈ [valid_from, valid_to]` (comparação `YYYY-MM`).
- **Trilha auditável (Q4a/Q4b — Confirmado):** `created_by uuid FK profiles`, `created_at timestamptz`, `reason text`, `updated_at`, `updated_by`. Toda mutação gera linha em `audit_log` ou `billing_exceptions_history`.
- **Retroatividade (Q4b — Confirmado — reprocessa e corrige o passado):** exceção com `valid_from` retroativo reprocessa `ref_month` já fechados, gera delta e exige reemissão dos relatórios. Relatórios fechados serão reprocessados e reemitidos.

### 5.7 Auditoria e Relatórios (Q5, espelho Profissionais § Export)

Visão `exportView` compartilhada (segmented control `Ativos|Acesso|Geral` no Profissionais vira `Por licença|Por OS|Geral` ou `Faturável|Isento|Geral`; default `Geral`).

| Origem | Escopo | Modo | Fonte | Nome arquivo |
|--------|--------|------|-------|--------------|
| Toolbar | Todos | Sintético | `filtered` em memória (counts da RPC principal) | `financeiro-sintetico-${view}-${refMonth}.csv` |
| Toolbar | Todos | Analítico | `supabase.rpc('get_financeiro_export', {p_ref_month})` | `financeiro-analitico-${view}-${refMonth}.csv` |
| Row expandida | Individual | Sintético | `row` único | `financeiro-sintetico-${view}-${client}-${refMonth}.csv` |
| Row expandida | Individual | Analítico | `detailCache[clientId].data` | `financeiro-analitico-${view}-${client}-${refMonth}.csv` |
| Row expandida | Individual | PDF | `window.open + document.write + w.print()` `@media print` | `Financeiro · ${client} — ${view}` |

- **Colunas CSV sintético (Geral):** `Cliente | CNPJ | SaaS_ID | Tipo | Piso | Uso no mês | Billable | Valor unit. | Valor corrigido | Correção (%) | MRR mínimo | MRR real | Excedente | Exceção | Vigência exceção | Δ MRR`
- **Colunas CSV analítico:** acima + breakdown por módulo (`Módulo | Valor rateado | %`) + lista de profissionais/OS que compõem o uso (quando `por_licenca`).
- **PDF:** header `Financeiro · ${client_name} — ${monthLabel(refMonth)} · ${view.label}`, `div.summary` com cards `MRR mínimo`, `MRR real`, `Excedente` + badge correção + badge exceção, tabela analítica com `tabular-nums`, `text-donc-verde/red` para deltas.
- **Padrão download:** `Blob('\uFEFF' + content, {type:'text/csv;charset=utf-8'})` (BOM para Excel PT-BR) + `URL.createObjectURL` (idem `ProfissionaisCockpitPage.jsx:48`).
- **Fechamento mensal:** relatório é snapshot de `ref_month`; exceção retroativa (Q4b — Confirmado) reprocessa `ref_month` já fechado, gera delta e exige reemissão explícita.

---

## 6. Regras de Negócio e Fórmulas — Exemplos

### Exemplo A — Por licença, dentro do piso (Img2 sem excedente)

- `billing_type=por_licenca`, `valor_base=59,90`, `piso=50`, `correction=none`, `uso_ref=32`, `exceção=none`
- `billable = max(32,50)=50`, `mrr_min=50×59,90=2.995,00`, `mrr_real=50×59,90=2.995,00`, `excedente=0`
- Módulos rateio ex: `Core 35,00 (58,4%) + Chat 24,90 (41,6%) = 59,90` — apenas breakdown.

### Exemplo B — Por licença, com excedente (caso faltante hoje)

- `valor_base=59,90`, `piso=50`, `uso_ref=68`
- `billable=68`, `mrr_min=2.995,00`, `mrr_real=68×59,90=4.073,20`, `excedente=1.078,20`

### Exemplo C — Por OS, com isenção (Img1 + negociação)

- `billing_type=por_os`, `valor_base=1,93`, `piso=0`, `uso_ref=120`, `exceção=isencao_total 01/2026-03/2026`
- Sem exceção `ref=2026-02`: `mrr=120×1,93=231,60`; com exceção `2026-02`: `mrr_real=0` (badge Isento 02/2026).

### Exemplo D — Correção (Q3)

- `valor_base=59,90`, `IPCA 4,62%`, `toggle aplicado`: `valor_corr=59,90×1,0462=62,67`, `piso=50` → `mrr_min_corr=3.133,50` (+138,50). Toggle desligado mantém `2.995,00` naquela cobrança.

---

## 7. Permissões e Acesso

### 7.1 Roles (`src/lib/roles.js`, `AuthContext.jsx:81`)

Reuso `effectiveRole = impersonatedRole || profile.role`; `isFinance` já existe.

### 7.2 Feature flags (`supabase/migrations/20260503031721:950`, `useFeatureFlags.js:5`)

- **Confirmado (Q6 — Sim, flag dedicada):** nova flag dedicada:

```sql
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES ('cockpit_financeiro','Cockpit Financeiro — MRR real, excedente e exceções', false, ARRAY['admin','manager','finance','sales'], now())
ON CONFLICT (key) DO NOTHING;
```

- Registrar em `src/components/settings/SettingsFeatureFlags.jsx:18` grupo `Cockpits & Dashboards` + `src/pages/CockpitsPage.jsx:7` card:

```js
{ key:'cockpit_financeiro', title:'Financeiro', description:'MRR real, excedente e exceções por cliente', icon: Icons.Wallet, href:'/financeiro-cockpit', color:'text-donc-verde', bgColor:'bg-donc-verde/10' }
```

- Rota `src/App.jsx:205` `<Route path="/financeiro-cockpit" element={<FinanceiroCockpitPage />} />` dentro de `<PrivateRoute><AppLayout>`, filtrada por `isEnabled('cockpit_financeiro', effectiveRole)`. `Navbar.jsx:13` opcional link top-nav com `featureFlag:'cockpit_financeiro'`.
- Dependência: `cockpit_financeiro` requer `financial_data` habilitado para o role (guard `isEnabled('financial_data', role) && isEnabled('cockpit_financeiro', role)`).

### 7.3 Backend — RLS e RPCs

Padrão `20260830000001`/`20260830000004 dashboard_v3`:

```sql
REVOKE ALL ON FUNCTION public.get_financeiro_cockpit(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_cockpit(text) TO authenticated;
-- SECURITY DEFINER + SET search_path = public + coalesce(get_user_role(),'')
-- NOT IN ('admin','manager','finance','sales') → RAISE EXCEPTION 'forbidden' 42501
```

`billing_exceptions` e `billing_corrections`: `SELECT` para `admin,manager,finance,sales`, `INSERT/UPDATE/DELETE` para `admin,finance,sales` (escrita total); `manager` leitura. RLS via `public.get_user_role()` (`20260625160000`).

---

## 8. Fontes de Dados e Integração

| Tabela | Papel | Chave |
|--------|-------|-------|
| `public.clients` | contrato, faturamento base, CNPJ/SaaS_ID, `mrr` cache, `delay_days`, `contract_renewal` | `id` |
| `public.client_usage` | uso real por `ref_month`, `profissionais_versao` jsonb, `pending=false`, agregação por `instance_id` | `(client_id, ref_month, instance_id)` |
| `public.billing_exceptions` *(nova)* | exceções com vigência | `id`, FK `client_id`, `type`, `valid_from/to`, `created_by` |
| `public.billing_corrections` *(nova ou colunas em clients)* | correção por mês, toggle `applied` | `(client_id, ref_month)` |
| `public.sync_service_log` | granularidade `service_name='donc-api'`, `ref_month`, `status`, `finished_at` | `service_name, ref_month` |
| `public.feature_flags` | `cockpit_financeiro`, `financial_data` | `key` |
| `public.profiles` | `role`, `status` | `id` |

Fluxo DONC: `monthly-sync` (cron) → `donc-api-sync` → `client_usage` → `sync_service_log` → cockpit RPCs. Sem Docker local; deploy `supabase db push --include-all` + `supabase functions deploy` + `npm run build` + `git push origin main` (Vercel).

---

## 9. UX — Referência Profissionais

Reuso obrigatório (terse, `docs/ui-patterns.md`):

- Wrapper `p-6 max-w-7xl mx-auto` + `BackButton → /cockpits` + `PageHeader title="Financeiro · Faturamento" description={monthDisplay}`.
- KpiCard `bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4 + w-9 h-9 rounded-lg icon bg` (`neutral/positive/negative`), `text-2xl font-bold tabular-nums`, delta `text-donc-verde ▲ / text-donc-red ▼`.
- Toolbar `mt-5 flex items-center gap-3 flex-wrap` com `select ref_month` + `search pl-9` (`Icons.Search`) + `CSV dropdown absolute right-0 w-64` + `lastSync ml-auto text-xs Icons.Clock`.
- Tabela `bg-bg-primary border rounded-lg overflow-hidden + overflow-x-auto + thead bg-donc-navy text-white text-xs uppercase`.
- Rows `hover:bg-bg-secondary cursor-pointer` + `ChevronIcon` svg `M3 5l4 4 4-4`.
- Detail `colSpan p-0 bg-bg-secondary/20 + barra bg-bg-tertiary/60 border-b` com `ViewToggle inline-flex rounded-md border` (`bg-donc-navy` ativo).
- Skeletons `animate-pulse`, empty `py-12 text-text-tertiary`, error `bg-donc-red/10 border`.
- Icons sempre `import { Icons } from '@/lib/icons'` (`src/lib/icons.js` alfabético, checar duplicatas) — `Wallet` já existe.

---

## 10. Requisitos Não-Funcionais e Segurança

- **Performance:** RPCs `STABLE`, `staleTime 5min` (cockpit) / `10min` (months), paginação só por cliente no detalhe (lazy 1 RPC por expand).
- **Segurança:** `SECURITY DEFINER` + `SET search_path=public` + `REVOKE anon/public` + `GRANT authenticated` (mitiga gotcha `CLIENT_SELECT='*'` vazamento `get_finance_summary` `20260830000001:8`). RLS `get_user_role()` coalesce guard.
- **Confiabilidade:** `sync_service_log` fonte de verdade para meses disponíveis; não usar `client_usage` distinct puro (mostra meses legados sem DONC).
- **Compatibilidade:** `build.minify false`, `__COMMIT_HASH__` via `vite.config.js`, SPA rewrite `vercel.json`.

---

## 11. Métricas de Sucesso

- Finance consegue fechar faturamento mensal sem planilha externa (tempo de fechamento −50% no primeiro mês).
- 100% dos clientes com `billing_type` exibidos no cockpit com `mrr_real` divergindo de `mrr_min` quando `uso > piso`.
- Relatórios CSV/PDF com CNPJ+SaaS_ID aprovados em auditoria (0 divergências vs DONC).
- Exceções com vigência e trilha 100% rastreáveis.

---

## 12. Riscos e Dependências

| Risco | Mitigação |
|-------|-----------|
| `billing.js` soma módulos vs rateio (Q2) diverge do BRD | Débito técnico `TD-XXX` — corrigir `calculateMRR` com `mode='rateio'` e validação `sum(mods) == base` |
| Correção automática fase 2 sem fonte oficial do índice | Fase 1 manual + badge; fase 2 só após definir provedor (BCB/IBGE) |
| Retroatividade de isenção (Q4b — Confirmado) reprocessa mês fechado | Validado Q4b — reprocessa e corrige passado: relatórios fechados são reprocessados, geram delta e exigem reemissão |
| DONC API fora no cron mensal | `sync_service_log status='failed'` + banner no cockpit + retry manual |
| Sales como criador de exceção sem governance | Validado Q4a — sales com escrita total equiparado a admin/finance; manager leitura; trilha auditável + RLS |

---

## 13. Perguntas com Respostas para Validação do Financeiro

> Esta seção deve ser assinada pelo time financeiro. Cada item traz a resposta já coletada e o status de validação.

### Q1 — Qual mês de uso deve compor o MRR real?

**Resposta coletada:** do mês de referência (`ref_month` selecionado no cockpit), não do último sync.
**Implicação técnica:** RPC expande `profissionais_versao` filtrando `ref_month = p_ref_month` (mesma lógica Profissionais).
**Status:** ✅ Confirmado
**Validado por / data:** ____________________

### Q2 — Valores por módulo somam ao valor da licença ou são rateio?

**Resposta coletada:** rateio — se a licença é R$50, a soma dos módulos deve fechar em R$50. O breakdown existe para entender recorrência por módulo e estatísticas, não deve ser somado ao valor base.
**Implicação:** corrigir `src/lib/billing.js` (`calculateUnitValue = base + sum(mods)` diverge) e exibir no cockpit apenas como breakdown informativo com validação de fechamento.
**Status:** ✅ Confirmado
**Validado por / data:** ____________________

### Q3 — Como tratar correção monetária (IPCA/IGPM)?

**Resposta coletada:** no começo ajuste manual, depois poderá ser automático. Precisa informar percentual e índice, a plataforma recalcula; no cockpit deve ficar claro que houve correção e haver toggle para aplicar ou não naquela cobrança.
**Implicação:** fase 1 campos `correction_percent` + `correction_index` + `billing_corrections.applied` toggle por `ref_month`; fase 2 cálculo automático sugerido no `ref_month` de renovação.
**Status:** ✅ Confirmado — faseado
**Validado por / data:** ____________________

### Q4a — Quem cria exceções? Sales tem escrita?

**Resposta coletada:** sales terá permissão para criar/editar todo o fluxo, bem como finance (admin, finance e sales com escrita total; manager só leitura).
**Implicação:** `billing_exceptions` e `billing_corrections` com `created_by/at, reason, valid_from/to` + `audit_log`; RLS `INSERT/UPDATE/DELETE` para `admin, finance e sales`; `manager` leitura.
**Status:** ✅ Confirmado — sales com escrita total
**Validado por / data:** ____________________

### Q4b — Isenção retroativa reprocessa ou só prospectivo?

**Resposta coletada:** reprocessa e corrige o passado — exceção retroativa com `valid_from` no passado reprocessa relatórios fechados, gera delta e exige reemissão.
**Implicação:** `billing_exceptions` retroativa reprocessa `ref_month` já fechados; geração de delta e reemissão obrigatória de CSV/PDF auditados.
**Status:** ✅ Confirmado — reprocessa e corrige passado
**Validado por / data:** ____________________

### Q5 — Quais colunas/filtros nos relatórios de auditoria?

**Resposta coletada:** CNPJ e SaaS_ID (número de contrato com a Donc), cliente, valores, fechamento mensal.
**Implicação:** CSV/PDF com `CNPJ | SaaS_ID | Cliente | Tipo | Piso | Uso | Billable | Valor unit. | Valor corrigido | MRR mínimo | MRR real | Excedente | Exceção` por `ref_month` fechado.
**Status:** ✅ Confirmado
**Validado por / data:** ____________________

### Q6 — Flag dedicada ou reutilizar `financial_data`?

**Resposta coletada:** Sim — criar flag dedicada `cockpit_financeiro`.
**Recomendação técnica:** criar flag dedicada `cockpit_financeiro` (`enabled false`, `allowed_roles [admin,manager,finance,sales]`) separada de `financial_data`. `financial_data` é gate horizontal de dados (já `enabled true`); acoplar o cockpit a ela impede kill-switch independente e libera o cockpit junto com outros pontos financeiros. Dependência lógica `cockpit_financeiro ⇒ financial_data`.
**Status:** ✅ Confirmado — Sim, flag dedicada
**Validado por / data:** ____________________

---

## 14. Alternativas Descartadas

- **Reutilizar só `financial_data` sem nova flag:** descartado — sem kill-switch independente, acopla ciclos.
- **Campo jsonb `exceptions` em `clients`:** descartado — sem vigência temporal, sem trilha auditável, sem RLS granular.
- **Somar módulos ao valor base (`billing.js` atual):** descartado — contradiz Q2, infla MRR.
- **Correção automática já na v1:** descartado — exige fonte oficial do índice e recálculo retroativo; fasear reduz risco.

---

## Apêndice A — Dicionário de Dados (proposto)

### `billing_exceptions`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | `uuid PK` | |
| `client_id` | `int FK clients` | |
| `type` | `text CHECK (isencao_total, desconto_percent, valor_reduzido, piso_zerado)` | |
| `percent` | `numeric null` | para `desconto_percent` |
| `reduced_value` | `numeric null` | para `valor_reduzido` |
| `valid_from` | `date` | |
| `valid_to` | `date` | |
| `reason` | `text` | motivo negociação |
| `created_by` | `uuid FK profiles` | |
| `created_at` | `timestamptz` | |
| `updated_by/at` | `uuid/timestamptz` | |

### `billing_corrections`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `client_id` | `int FK` | |
| `ref_month` | `text YYYY-MM` | PK composta |
| `index` | `text` | IPCA/IGPM |
| `percent` | `numeric` | |
| `applied` | `boolean default true` | toggle |
| `applied_at` | `timestamptz` | |
| `created_by` | `uuid` | |

### `clients` — alterações

- Novo `correction_percent numeric` + `correction_applied_at` se optar por colunas em vez de tabela dedicada (preferir tabela dedicada por `ref_month`).

---

## Apêndice B — Esboço RPCs (para SDD futuro)

```sql
-- get_financeiro_cockpit(p_ref_month text)
-- RETURNS TABLE(client_id int, client_name text, cnpj text, saas_id text,
--   billing_type text, piso int, uso_cur bigint, billable bigint,
--   valor_unit numeric, valor_corr numeric, mrr_min numeric, mrr_real numeric,
--   excedente numeric, excecao_tipo text, excecao_vigencia text,
--   mrr_delta numeric, uso_prev bigint)
-- Lógica: expanded jsonb_array_elements(profissionais_versao) + counts por tipo
--   + join billing_exceptions vigente + billing_corrections toggle
--   + SECURITY DEFINER + REVOKE anon/public + GRANT authenticated
--   + coalesce(get_user_role(),'')
--   + ORDER BY fantasy_name
```

---

## Histórico

| Versão | Data | Autor | Mudança |
|--------|------|-------|---------|
| 0.1 | 2026-08-31 | DoncCX Hub | Draft inicial pós-discovery (Profissionais + Contrato + roles) |
| 0.2 | 2026-08-31 | DoncCX Hub | Incorporadas respostas Q1–Q6 do solicitante; rateio módulos; correção com toggle; sales candidato |
| 0.3 | 2026-09-01 | DoncCX Hub | Validações finais Q4a/Q4b/Q6: sales escrita total (admin/finance/sales), manager leitura, retroatividade reprocessa e corrige passado (reemissão com delta), flag dedicada cockpit_financeiro confirmada; header validado |

---

## Aprovação

| Papel | Nome | Assinatura | Data |
|------|------|------------|------|
| Finance | | | |
| Admin | | | |
| Produto | | | |
