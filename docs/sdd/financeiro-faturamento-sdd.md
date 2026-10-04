# SDD — Faturamento e Contas a Receber (Billing & Receivables)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the rebuild of the billing and receivables module of doncCX Hub — the part of the system that issues invoices, records payments, discounts and write-offs, and reports delinquency. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

**Supersedes, partially:** `docs/sdd/financeiro-cockpit-sdd.md`. That document remains canonical for the usage/MRR extract (uso, piso, excedente, módulos, profissionais). Everything it says about **adimplência, composição de fatura e pendências** is superseded by this document, because the model changes from a per-competência status to a per-invoice ledger. Do not implement adimplência from the old document.

**Related:** `docs/sdd/contract-series-lifecycle-sdd.md` (how a contract series is closed, reopened, suspended — unchanged by this rebuild, but its `encerrar_series` RPC touches the same tables and must be migrated).

**Why a rebuild and not an addendum.** The current module was built while the finance domain was still being discovered. Four defects found on 2026-10-03 — the due date rendered as the contract start, adimplência per competência instead of per invoice, no overdue indicator, and a batch action that fabricates payment dates — are not independent bugs. They are consequences of one architectural choice: `contract_charges` conflates the **commercial plan** with the **issued document**, and `billing_payments` stores a **status** where reality has **amounts**. Patching them individually would be a patchwork; the data is disposable (three series, 134 charges, 82 payments) and the go-live is 2026-11, so this is the moment to rebuild the foundation instead of the symptoms.

### How to use this document

1. **Before implementing:** Read the document fully. Section 0 is the starting point; sections 1–4 are the contract; section 5 is the verification plan that gates every phase.
2. **During implementation:** Work one phase at a time from section 6. Each phase has its own checklist and ends with `npm run build`.
3. **After each phase:** Fill the phase's Implementation Log, update section 7 (Current Checkpoint), and update section 0 if the production state changed. An outdated section 0 actively misleads the next agent.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Stage:** Draft — Section 0 verified against production on 2026-10-03; awaiting Phase 1
- **Active branch:** `main`
- **Last deploy:** `donccx-donccx.vercel.app`
- **Active phase:** none — Phase 1 not started
- **Go-live target:** 2026-11-01 (billing control moves from spreadsheet to Hub)

**What already exists related to this work:**

- `contract_series` — the commercial plan. 26 active series. Columns: `billing_type` (`por_licenca`/`por_os`), `billing_floor` (integer, NOT NULL), `billing_base_value` (numeric, NOT NULL), `usage_driven` (boolean), `billing_start`, `billing_end`, `due_day`, `auto_renew`, `status`, `contract_months`, `contract_renewal`, `contract_signed_date`, `correction_index`, `correction_percent`, `correction_anniversary`, `correction_rule`, `encerramento_motivo`.
- `contract_charges` — **conflates plan and document.** 134 rows: 133 `recorrencia` (the plan, projected forward as a "horizon") + 1 `implantacao` (an evento). Columns: `id`, `client_id`, `series_id`, `kind`, `mode` (`absolute`/`percent`), `month_index`, `amount`, `percent`, `ref_month`, `due_date`, `installment_group`, `installments_total`, `label`, `reason`, `created_by`, `created_at`. Only 3 series have charges (18, 21, 29).
- `billing_payments` — **status, not amount.** 82 rows. PK `(client_id, series_id, ref_month)`. Columns: `client_id`, `series_id`, `ref_month`, `status` (`adimplente`/`inadimplente`), `delay_days`, `paid_at`, `note`, `updated_by`, `updated_at`. One status per competência per series — cannot represent an eventual and a recurrence settled independently, and cannot represent partial payment.
- `billing_exceptions` — concession table with `valid_from`/`valid_to` and 4 types. **0 rows.** Never operated.
- `billing_os_tiers` — OS volume tiers. **0 rows.**
- `client_usage` — usage snapshots. `profissionais_versao` (jsonb array of professionals with `ativo` boolean) for licence usage; `os_created` (integer) for OS usage.
- `get_financeiro_cockpit(p_ref_month)` — MRR engine. Reads `_financeiro_series_month(p_ref_month)`.
- `get_financeiro_detalhe(p_client_id, p_ref_month)` — lazy accordion payload. Returns `TABLE(series jsonb, modulos jsonb, excecoes jsonb, payment jsonb, eventuais jsonb, profissionais jsonb)`.
- `get_financeiro_pendencias(p_months_back int DEFAULT 3)` — anti-join on `billing_payments` by `(client, series, ref_month)`. Window capped at 12.
- `ensure_series_horizon(p_series_id uuid)` — materialises recurrence forward **and** writes `billing_payments = 'adimplente'` for past months with no record. Two unrelated responsibilities in one function.
- `sync_billing_payments_delay_days()` — AFTER INSERT/UPDATE/DELETE trigger on `billing_payments`. Copies the delay of the **most recent** `ref_month` to `clients.delay_days`.
- `trg_sync_charge_due_date` — derives `contract_charges.due_date` from `ref_month` + `due_day` with end-of-month clamp.
- `encerrar_series`, `reabrir_series`, `reativar_series`, `set_nao_cobrar`, `cobrar_mais_meses` — lifecycle RPCs (see the lifecycle SDD). `encerrar_series` deletes `contract_charges` rows outside the kept window.
- Frontend: `src/pages/FinanceiroCockpitPage.jsx`, `src/components/financeiro/PaymentToggle.jsx`, `src/components/financeiro/ExcecaoModal.jsx`, `src/hooks/useFinanceiroCockpit.js`, `src/hooks/useBillingPayments.js`, `src/hooks/useContractCharges.js`, `src/lib/financeiro.js`, `src/lib/contractRules.js`.
- Feature flags: `cockpit_financeiro` (page gate), `financeiro_cockpit_write` (write gate), registered in `src/components/settings/SettingsFeatureFlags.jsx` under "Cockpits & Dashboards".

**What does NOT exist and needs to be created:**

- Separation between the recurrence **rule** and the **issued invoice**.
- `invoices` — a first-class financial document with number, competência, amount, due date and audit trail.
- `invoice_entries` — an amount-based ledger (payment / discount / write-off) that supports partial settlement.
- Per-invoice delinquency: derived state (`aberta` / `parcial` / `quitada` / `vencida`) and per-invoice delay.
- Invoice numbering.
- Payment method.
- Manual invoice adjustment with mandatory reason and audit.
- Batch settlement by range, and discount distribution across open invoices.
- "Open competência" indicator.
- Anniversary (reajuste) alert.
- Historic load wizard.

**Known defects this rebuild removes (do not patch them individually):**

| # | Defect | Root cause | Where |
|---|---|---|---|
| 1 | Series detail shows `billing_start` under the label "vence dia" | The label says due date; the value is the contract period | `FinanceiroCockpitPage.jsx:676,733` |
| 2 | A R$ 15.000 eventual shows as "adimplente" | One status per competência, not per invoice | `billing_payments` PK |
| 3 | No overdue indicator when a status exists | Delay derived from status, never from due date | cockpit render |
| 4 | Batch action fabricates `paid_at = due_date` | `saveRow(id, forcePaid)` sets the idealised date, not the real one | `PaymentToggle.jsx` |
| 5 | June shows "não sincronizou" when it partially synced (57 success, 14 failed) | Month list sourced from `sync_service_log`; banner reads the latest row, not the run outcome | `useFinanceiroCockpit.js`, `FinanceiroCockpitPage.jsx:1316` |
| 6 | Client paying the latest month resets `clients.delay_days` to 0 | Trigger copies the **latest** month's delay, not the **worst** | `sync_billing_payments_delay_days()` |

**Usage data coverage (measured 2026-10-03):**

| | Months with data |
|---|---|
| Licence usage (`profissionais_versao`) | **4** — 2026-06 → 2026-09, for 17 of 18 clients |
| OS usage (`os_created`) | up to **10** — 2025-12 → 2026-09 |
| VALDIR MÓVEIS (client 29) | **0** — in implantation, no usage yet |

Consequence: the retroactive excedente is computable **only where usage data exists**. Before 2026-06 for licences, the invoice equals the base. Task F0 (section 5.1) produces the reviewable table before anything is issued.

**Scale of the historic load:** 18 clients, 26 series, contracts starting from 2021-03.

### Files to be touched

| File | Change type |
|---|---|
| `supabase/migrations/<ts>_billing_schema.sql` | **Create** — `series_rules`, `series_eventuals`, `invoices`, `invoice_entries`, numbering, RLS |
| `supabase/migrations/<ts>_billing_derive.sql` | **Create** — derived state, delay, pendencies, cockpit RPCs |
| `supabase/migrations/<ts>_billing_retire.sql` | **Create** — drop `contract_charges` charge semantics, `billing_payments`, `billing_suspended_until`, `billing_exceptions` |
| `supabase/functions/contract-series-sync/index.ts` | Modify — horizon no longer writes payments; invoice closing replaces it |
| `supabase/functions/contract-series-close/index.ts` | **Create** — closes a competência and issues invoices |
| `src/pages/FinanceiroCockpitPage.jsx` | Rewrite — invoice view, balance, composition, overdue, partial |
| `src/pages/FaturamentoCarregamentoPage.jsx` | **Create** — historic load wizard |
| `src/components/financeiro/PaymentToggle.jsx` | Rewrite — per-invoice ledger |
| `src/components/financeiro/InvoiceAdjustDialog.jsx` | **Create** — manual amount adjustment with reason |
| `src/components/financeiro/DiscountDialog.jsx` | **Create** — distribute vs. targeted discount |
| `src/components/financeiro/OpenCompetenciaBanner.jsx` | **Create** — open competência indicator |
| `src/components/financeiro/ExcecaoModal.jsx` | Delete or repurpose — decision recorded in §1.12 |
| `src/hooks/useFinanceiroCockpit.js` | Modify — month list from invoices, not `sync_service_log` |
| `src/hooks/useInvoices.js` | **Create** — invoice + entry queries and mutations |
| `src/lib/financeiro.js` | Modify — invoice composition helpers |
| `src/lib/contractRules.js` | Modify — rule model extraction |
| `docs/sdd/financeiro-cockpit-sdd.md` | Modify — supersession pointer |
| `docs/operations/faturamento-carga-historica.md` | **Create** — output of task F0 |
| `docs/backlog.md` | Modify — close TD-015, add new items |

---

## 1. Premissas de negócio

Premissas validadas com o solicitante em 2026-10-03. **Mudar qualquer uma é decisão de produto, não de implementação** — exige atualizar esta seção e o registro de decisões.

### 1.1 Regra ≠ Fatura

O contrato guarda o **plano**; a fatura é o **documento emitido**.

| | Regra | Fatura |
|---|---|---|
| O que é | "meses 1..36 a R$ 2.995" | "competência 2026-09, R$ 3.054,90, vence 30/10" |
| Onde vive | contrato (form do cliente) | motor de emissão |
| Muda? | sim, editável | não — emitida é fato |
| Quantas | 1 conjunto por série | 1 por competência + eventuais |

Hoje as duas moram em `contract_charges`, e a projeção futura ("horizonte") é materializada como se fosse documento. Foi isso que produziu a cauda do horizonte, o truncamento no save e a chave sintética que quase fomos obrigados a inventar. **Não se materializa futuro: fatura nasce quando a competência fecha.**

### 1.2 Composição: base × piso

Três bases de preço, cada uma com ou sem piso. Não são quatro modos — são duas dimensões.

| Base | Com piso | Sem piso |
|---|---|---|
| Por licença | `unit × max(piso, uso)` | `unit × uso` |
| Por OS | `preco_os × max(piso, os_criadas)` | `preco_os × os_criadas` |
| Valor fixo | `valor_da_faixa` | — |

A fatura é `base + excedente`, onde `excedente = unit × max(0, uso − piso)`. O excedente **não é fatura separada** — é a segunda parcela da mesma fatura. A tela mostra a composição; o documento tem um valor.

`billing_floor` é NOT NULL hoje, então "sem piso" se escreve `piso = 0`. A matemática já suporta (`max(0, uso) × unit = unit × uso`). O que falta é a interface dizer **"sem piso"** em vez de `0`, que é ambíguo entre "não tem" e "zerado por engano".

**O excedente é faturado**, usando o uso real disponível na base. Não é "diferença a apontar": se o Center Kennedy tem `uso = 51 > piso = 50` em jun–set/2026, a fatura desses meses **nasce em R$ 3.054,90**.

### 1.3 Adimplência por valor, não por status

Um pagamento é um **valor** contra uma fatura. Um cliente pode pagar o eventual e não o MRR; pode pagar R$ 9.000 de um eventual de R$ 15.000 e R$ 2.000 de um MRR de R$ 4.000.

```
fatura R$ 15.000 · lançamentos R$ 9.000  →  parcial, faltam R$ 6.000
fatura R$  4.000 · lançamentos R$ 2.000  →  parcial, faltam R$ 2.000
fatura R$  4.000 · lançamentos R$ 4.000  →  quitada
vencida + saldo > 0                      →  vencida (atraso = hoje − vencimento)
```

Não existe campo `status`. O estado é derivado do saldo.

### 1.4 Vencimento ancorado na série

Vale **o que o usuário cadastrar**. O código não impõe "vence no mês da competência" nem "no mês seguinte".

Implementação: a série carrega a competência do mês 1 (`first_competencia`) e o primeiro vencimento (`billing_start` é a âncora de data já existente). O vencimento da competência N é `primeiro_vencimento + (N−1) meses`, com clamp no fim do mês. Quem cobra no mês seguinte cadastra a competência inicial deslocada. Os dois layouts convivem sem regra no código.

Os dados atuais do Center Kennedy (`ref_month 2026-09` → `due_date 2026-09-30`) permanecem válidos: a âncora cadastrada é essa.

### 1.5 Fatura emitida é imutável — com porta de saída

O motor não reescreve fatura emitida. Se o uso for ressincronizado depois da emissão, **não muda**.

Existe uma ação explícita — **ajustar valor** — com motivo obrigatório e auditoria (quem, quando, de quanto para quanto). Sem isso, "imutável" vira prisão.

### 1.6 Reajuste é manual, o sistema alerta

Nenhuma série tem `correction_percent` preenchido. O índice é rótulo; o cálculo é feito fora do Hub.

O módulo **não calcula** o reajuste. Ele **alerta** que o aniversário venceu ou está por vencer, e o usuário aplica o novo valor manualmente (o que cria uma nova faixa de preço a partir da competência escolhida, preservando o histórico).

Dois aniversários caem no caminho crítico: **Lojas Eletromóveis em 2026-10-27** e **Center Kennedy em 2026-11-30**.

### 1.7 Carga histórica e baixa em lote

O módulo financeiro nasce **depois** de todos os clientes já estarem operando. O controle sai da planilha em nov/2026.

- Contratos antigos (Eletromóveis, 36 meses já vencidos, segue mês a mês) e vigentes (Center Kennedy, até 2027-01) entram pelo mesmo wizard.
- Faturas do passado que nunca foram apuradas no Hub entram **sem baixa**. O Financeiro dá baixa em lote, por faixa ("da 1 até a 25", "da 1 até a 46"), **com data e valor reais** — o valor pode diferir do base quando o excedente ocorreu e não foi faturado.
- Inadimplências reais existem e precisam poder ser marcadas depois.

Alternativa descartada: atribuir o passado como pago no momento do lançamento. Foi preterida porque esconde a diferença entre "apurado" e "assumido" justamente no momento em que o Financeiro está conferindo contra a planilha.

### 1.8 Navegação de competências

**Todas as competências com fatura, até o mês corrente.** Isso inclui o passado.

Ao contrário do que este documento propôs em uma versão anterior, o passado **não** fica escondido atrás de inadimplência. O que tornava o passado artificial era não haver fatura nele — só snapshot de uso. Com o P9, o passado passa a ter fatura e baixa, e escondê-lo quebraria a própria operação de baixa em lote.

**Sem meses futuros.** Um mês à frente não tem uso apurado, então `mrr_real` colapsaria no piso: o cockpit mostraria setembro em R$ 9.354,85 e outubro em R$ 9.294,95, uma queda de R$ 59,90 que não aconteceu — apenas não há snapshot ainda.

A fonte da lista muda de `sync_service_log` (histórico de sincronização) para **competências com fatura**.

### 1.9 Eventual só entra em pendência depois do vencimento

Uma implantação recém-lançada não é pendência. Só vira quando vence e não está quitada. Recorrências fechadas e não quitadas entram imediatamente.

### 1.10 Passado não é presumido pelo motor

`ensure_series_horizon` hoje grava `adimplente` em meses passados. Isso sai: a função passa a emitir, não a liquidar. Quem assume o passado é o Financeiro, pelo fluxo do §1.7. Um único caminho escreve baixa: o lançamento.

### 1.11 Desconto: dois modos, decididos pelo usuário

Negociação com cliente inadimplente tem duas formas, e o usuário escolhe na hora:

1. **Distribuir** um valor total entre as faturas abertas selecionadas.
2. **Aplicar** em faturas específicas — inclusive 100% em uma fatura e cobrar as demais.

Distribuição **igual em valor** por fatura (não percentual), salvo decisão em contrário registrada aqui.

### 1.12 TD-015 resolvido

`billing_exceptions` (concessão com vigência, 0 registros) é **substituída** por dois conceitos que já existem no novo modelo:

- **Desconto previsto no plano** — uma redução que entra na geração da fatura (equivalente à concessão com vigência).
- **Desconto negociado** — um lançamento numa fatura emitida (§1.11).

Um mecanismo, dois momentos. A tabela e o `ExcecaoModal` saem.

### 1.13 Fora de escopo

Conciliação bancária, emissão de boleto/PIX, nota fiscal (feita em outro sistema), juros e multa, parcelamento de fatura, múltiplas moedas.

---

## 2. Data Model & Contracts

### 2.1 `contract_series` — changes

| Column | Action | Notes |
|---|---|---|
| `billing_type` | Keep | Values become `licenca` \| `os` \| `fixo`. Existing `por_licenca`/`por_os` migrate; `fixo` is new |
| `billing_floor` | Make nullable | `NULL` = sem piso. Migrate existing `0` to `NULL` after review (F0) |
| `billing_base_value` | Keep | The unit price. Unused when `billing_type = 'fixo'` |
| `first_competencia` | **Add** `text` | `YYYY-MM` of `month_index = 1`. Backfill: `to_char(billing_start,'YYYY-MM')` |
| `billing_suspended_until` | **Drop** | Dead (0 non-null). See lifecycle SDD §1.5 |
| `billing_status` | Keep | `ativo` \| `nao_bilhetavel` only; `suspenso` removed |
| `correction_*` | Keep | Alert-only (§1.6) |

### 2.2 `series_rules` — new

The recurrence plan. Extracted from `contract_charges` where `kind = 'recorrencia'`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `series_id` | uuid FK → `contract_series` ON DELETE CASCADE | |
| `month_from` | smallint | `month_index` start, 1-based |
| `month_to` | smallint NULL | `NULL` = open-ended (continues while auto-renew) |
| `mode` | text | `amount` \| `percent` |
| `amount` | numeric NULL | required when `mode='amount'` |
| `percent` | numeric NULL | required when `mode='percent'`; relative to `unit × floor` |

Constraint: periods are contiguous and cover `1..N`; a new period starts where the previous ends. Validation in the RPC, not a trigger (the form already has `validateRulesContiguous`).

### 2.3 `series_eventuals` — new

Eventuais foreseen in the contract (implantation, one-off services).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `series_id` | uuid FK → `contract_series` ON DELETE CASCADE | |
| `label` | text | e.g. "Implantação" |
| `total` | numeric | |
| `installments` | smallint | ≥ 1 |
| `first_due_date` | date | drives the schedule |
| `created_by` | uuid NULL | |

### 2.4 `invoices` — new

The issued document. Replaces `contract_charges`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `number` | text UNIQUE NOT NULL | `FAT-{year}-{seq}` (§2.7) |
| `client_id` | integer NOT NULL FK → `clients` | |
| `series_id` | uuid NULL FK → `contract_series` | NULL for ad-hoc invoices |
| `kind` | text NOT NULL | `recorrencia` \| `eventual` |
| `competencia` | text NOT NULL | `YYYY-MM` |
| `amount` | numeric NOT NULL | frozen at issue |
| `due_date` | date NOT NULL | derived at issue (§3.2) |
| `description` | text NULL | e.g. the eventual label |
| `installment_group` | uuid NULL | groups instalments of one eventual |
| `installment_no` | smallint NULL | 1-based |
| `installments_total` | smallint NULL | |
| `status` | text NOT NULL DEFAULT `'emitida'` | `emitida` \| `cancelada` |
| `adjusted_from` | numeric NULL | previous amount, when manually adjusted |
| `adjust_reason` | text NULL | |
| `adjusted_by` | uuid NULL | |
| `adjusted_at` | timestamptz NULL | |
| `issued_at` | timestamptz NOT NULL DEFAULT now() | |
| `issued_by` | uuid NULL | |

UNIQUE `(series_id, competencia, kind)` where `kind='recorrencia'` — one recurring invoice per competência per series. Enforced by a partial unique index.

**Immutability:** `amount`, `competencia` and `due_date` are not updated by any application path. The only exception is the adjust action, which sets `adjusted_*` and `amount` together.

### 2.5 `invoice_entries` — new

The ledger. Replaces `billing_payments`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invoice_id` | uuid NOT NULL FK → `invoices` ON DELETE CASCADE | |
| `kind` | text NOT NULL | `pagamento` \| `desconto` \| `estorno` |
| `amount` | numeric NOT NULL CHECK > 0 | always positive; `kind` gives the sign |
| `happened_at` | date NOT NULL | payment/discount/write-off date |
| `method` | text NULL | required when `kind='pagamento'`: `pix` \| `boleto` \| `transferencia` \| `cartao` \| `dinheiro` \| `outro` |
| `note` | text NULL | |
| `reason` | text NULL | required when `kind='estorno'` |
| `reverses_id` | uuid NULL FK → `invoice_entries` | set when `kind='estorno'` |
| `created_by` | uuid NULL | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Entries are immutable. A correction is a new `estorno` entry referencing the original — never an UPDATE or DELETE. This is what makes the audit trail honest.

### 2.6 Derived values

Not stored. Exposed by views or RPCs (§3.4).

```
paid        = Σ entries where kind IN ('pagamento') − Σ entries where kind='estorno'
discounted  = Σ entries where kind='desconto'
balance     = amount − paid − discounted
```

### 2.7 Invoice numbering

`FAT-{issue_year}-{global_sequence}` — a global sequence, not reset per year. Rationale: guarantees uniqueness without coordination; the year prefix is informational. On the historic load, invoices are numbered in **chronological competência order** so the sequence reads coherently.

Implementation: a Postgres sequence `invoice_number_seq`, and a `generate_invoice_number()` function used by the issuer.

### 2.8 RLS

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `series_rules` | roles that read `contract_series` | `contract_write` (same as series) |
| `series_eventuals` | same | same |
| `invoices` | `admin`, `manager`, `finance`, `sales` | INSERT/DELETE via issuer RPC; UPDATE only via adjust RPC |
| `invoice_entries` | same | INSERT via RPC; no UPDATE; DELETE forbidden |

Follow the existing pattern: `SECURITY DEFINER` RPCs with an explicit role check (`coalesce(public.get_user_role(),'') NOT IN (...) THEN RAISE EXCEPTION 'forbidden'`). Mirror `20260916120000_financeiro_write_roles_rls.sql`.

---

## 3. Derivation Rules

### 3.1 Invoice amount

```
base(competencia) =
  billing_type = 'fixo'        → rule(competencia).amount
  billing_type IN ('licenca','os')
    rule(competencia).mode='percent' → rule.percent/100 × unit × floor
    rule(competencia).mode='amount'  → rule.amount
  (no rule for the competência) → no invoice

usage(competencia) =
  billing_type = 'licenca' → count of client_usage.profissionais_versao items with ativo=true
  billing_type = 'os'      → client_usage.os_created

excedente(competencia) =
  billing_type IN ('licenca','os') AND floor IS NOT NULL
    → unit × greatest(0, usage − floor)
  billing_type IN ('licenca','os') AND floor IS NULL
    → 0   (the whole amount is usage; base is 0)

amount(competencia) =
  billing_type = 'fixo'          → base
  floor IS NOT NULL              → base + excedente
  floor IS NULL                  → unit × usage

amount = 0 → no invoice is issued
```

The "no invoice on zero" rule matters for `por_os` with no floor (Todimo): a competência with no OS data has `usage = 0`, so `amount = 0`, and nothing is issued — an invoice for R$ 0,00 is noise, not a document.

### 3.2 Due date

```
month_index(competencia) = months between first_competencia and competencia, +1
due_date(competencia)    = clamp(first_due + (month_index − 1) months, due_day)
```

`first_due` is `billing_start` (the existing anchor). `clamp` caps the day at the last day of the target month — required, because a direct cast throws `22008` with `due_day = 30` in February.

### 3.3 Eventual schedule

```
installment i of n (0-based):
  due_date  = clamp(first_due_date + i months, day(first_due_date))
  amount    = floor(total/n, 2) for i < n−1; remainder for i = n−1
  competencia = YYYY-MM of due_date
```

### 3.4 Invoice state and delay

```
balance     = amount − Σ(pagamento) + Σ(estorno) − Σ(desconto)
delay_days  = balance ≤ 0
                → greatest(0, last_settlement_date − due_date)
                → greatest(0, current_date − due_date)

state =
  status = 'cancelada'  → cancelada
  balance ≤ 0           → quitada
  paid + discounted = 0 → aberta   (or vencida if due_date < current_date)
  otherwise             → parcial  (or vencida if due_date < current_date)
```

`clients.delay_days` = **worst** delay among that client's invoices with `balance > 0`. Replaces the current trigger, which copies the delay of the most recent competência.

### 3.5 Pendências

```
pendencia = invoice where
  status = 'emitida'
  AND balance > 0
  AND due_date < current_date
  AND ( kind = 'recorrencia'  OR  due_date < current_date )   -- eventuais only after due
```

Recurrence and eventual both enter after their due date; the difference is that a recurrence is expected every competência, an eventual only exists when issued.

### 3.6 Competência list for the cockpit

```
months = distinct competencia from invoices
         where competencia <= current month
         order by competencia desc
```

No forward months (§1.8). No `sync_service_log`.

---

## 4. Superfície (UI)

### 4.1 Cockpit — invoice-oriented

The client row keeps `MRR mín.`, `MRR real`, `Δ`, `Uso`. The expanded panel changes:

| Block | Content |
|---|---|
| Header | `R$ {open balance} em aberto` + state badge (`quitada`/`parcial`/`vencida`) with `N de M faturas` |
| Composition | MRR mínimo, MRR real, **Excedente faturado**, Faturas do mês |
| Invoices of the month | One row per invoice: number, kind, amount, due date, balance, state, method of last settlement |
| Eventuais | Each eventual as its own row with its own state — never merged into the recurring state |
| Profissionais ativos | unchanged |

Lines removed: the current "vence dia {due_day} · {billing_start} → {billing_end}" line, which is defect 1.

### 4.2 Settlement window (replaces `PaymentToggle`)

Opens with the client and competência. Lists **every invoice of that competência** — recurrence and eventuais separately.

- Per-invoice: add payment (amount + date + method), add discount, add write-off.
- **Batch by range:** select invoices by checkbox or by range (`1..25`), set one `happened_at`, confirm. Default amount = the invoice's balance.
- Historic difference: when paying a historic invoice, the field "valor real" accepts an amount different from the balance, recording the difference as a new `pagamento` entry (over) — the invoice itself is not rewritten.

### 4.3 Discount dialog

Two modes, chosen by the user:

| Mode | Input | Behaviour |
|---|---|---|
| Distribuir | total amount + selected invoices | `desconto` entry of `total/n` per invoice |
| Aplicar | specific invoices + value or 100% | one `desconto` entry per invoice |

### 4.4 Adjust invoice dialog

Amount + mandatory reason. Writes `adjusted_from`, `adjust_reason`, `adjusted_by`, `adjusted_at` and the new `amount`. Audited; visible in the invoice row.

### 4.5 Open competência banner

```
Competência {month} em aberto · {n} faturas · R$ {total}
```

Visible on the cockpit when the last closed competência has invoices with `balance > 0`. Button opens the settlement window filtered to that competência.

### 4.6 Reajuste alert

Lists series whose `correction_anniversary` has passed or falls within 30 days, with the index. Action: apply a new value from a chosen competência, which appends a `series_rules` period.

### 4.7 Historic load wizard

Step 1 — client and series (reuses the contract form fields).
Step 2 — plan: recurring rule, eventuais, pricing basis, floor.
Step 3 — preview: the generator runs **without persisting** and shows the invoice list with amounts and due dates.
Step 4 — confirm: invoices are issued chronologically.
Step 5 — settlement: the batch-by-range window (§4.2) opens over the issued invoices.

### 4.8 Month selector

Populated from invoices (§3.6). Default = the last closed competência.

---

## 5. Verification Plan

### 5.1 Task F0 — Historic usage survey

**Deliverable:** `docs/operations/faturamento-carga-historica.md`, for review before Phase 2 issues anything.

| Step | Content |
|---|---|
| 1 | Per client × competência: licence usage, OS usage, floor, unit, base, excedente, **computed invoice** |
| 2 | Flag competências **without usage data** (invoice = base; no invoice when base = 0) |
| 3 | Flag competências where the excedente is retroactive but computable (licences, 2026-06 → 2026-09) |
| 4 | Flag anomalies: `billing_floor = 0` cases, `IGMP` index typo, `contract_months` NULL |
| 5 | Reviewer approves, corrects or removes rows before Phase 2 runs |

Known starting point (measured 2026-10-03): licence usage exists only for 2026-06 → 2026-09; OS usage for up to 10 months; client 29 has none.

### 5.2 Guided fixture

A disposable company (`ZZ Teste Faturamento`), created and destroyed inside the test, as done on 2026-10-02 with client 46 (`ZZ Teste Ciclo de Vida`). The test is run by the requester, guided step by step, with database verification after each scenario.

### 5.3 Scenario matrix

| # | Scenario | Proves |
|---|---|---|
| 1 | Licence with floor, usage below floor | invoice = base |
| 2 | Licence with floor, usage above floor | invoice = base + excedente |
| 3 | Licence without floor | invoice = unit × usage |
| 4 | OS with floor | `preco_os × max(piso, os)` |
| 5 | OS without floor | `preco_os × os`; no invoice when `os = 0` |
| 6 | Fixed value | third basis |
| 7 | Standalone eventual | single invoice, own state |
| 8 | Eventual in 3 instalments | schedule, remainder in the last |
| 9 | Full payment | `quitada`, delay from `happened_at` |
| 10 | Partial payment, single entry | `parcial` |
| 11 | Partial payment, multiple entries | balance across entries |
| 12 | Discount distributed across N invoices | §1.11 mode 1 |
| 13 | 100% discount on one invoice | §1.11 mode 2 |
| 14 | Write-off of a wrong settlement | `estorno`, balance restored |
| 15 | Manual amount adjustment | audit fields |
| 16 | Batch settlement by range (1..N) | §1.7 |
| 17 | Reajuste: alert and manual application | §1.6 |
| 18 | Open competência visible | §4.5 |
| 19 | Delinquency total and partial | derived state |
| 20 | Month-to-month contract (expired, `auto_renew`) | Center Kennedy case |
| 21 | Closed and suspended series | lifecycle regression (see lifecycle SDD) |
| 22 | `due_day = 31` with February clamp | known `22008` trap |

---

## 6. Implementation Phases

### Phase 1 — Schema and derivation

**Status:** Not started

**Rationale:** É a fundação. Sem ela, qualquer tela é retrabalho. O dado atual é descartável, então não há backfill nem compatibilidade — as tabelas novas entram limpas e as antigas são aposentadas quando o motor novo as substituir.

**Scope:**
- `series_rules`, `series_eventuals`, `invoices`, `invoice_entries`
- `contract_series`: `first_competencia`, `billing_floor` nullable, drop `billing_suspended_until`
- Invoice numbering
- Derived views/RPCs (§3.4, §3.5)
- RLS

#### Checklist

- [ ] **Migration `billing_schema`:** four tables, constraints, indexes, RLS mirroring `20260916120000`
- [ ] **Migration `billing_derive`:** `invoice_balance` view, `get_invoice_state()`, `get_financeiro_pendencias` rewritten per invoice, `get_financeiro_cockpit` reading invoices
- [ ] **Migration `billing_retire`:** drop `billing_exceptions`, `billing_os_tiers` (if unused), `billing_payments`, `billing_suspended_until`; remove `ensure_series_horizon`'s payment write
- [ ] **RPCs:** `issue_invoice`, `settle_invoice`, `discount_invoice`, `adjust_invoice`, `close_competencia`
- [ ] **Verification:** SQL proving all 5 combinations (licence/OS/fixed × with/without floor) against known numbers, plus the 2026-02 clamp
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 2 — Issuing engine

**Status:** Not started

**Rationale:** É o que fecha competência e emite documento. Depende do schema e do resultado da task F0 — o motor não pode emitir o histórico antes de o Financeiro revisar o levantamento.

**Scope:**
- `close_competencia` edge function / RPC: for each active, billable series, compute the amount and issue
- Retroactive generation for the historic load
- Eventual schedule generation
- Income statement: issuing is idempotent per `(series, competencia, kind)`

#### Checklist

- [ ] **Issuer:** `close_competencia(competencia)` issues for every eligible series
- [ ] **Idempotency:** running twice issues nothing the second time
- [ ] **Skip rules:** no invoice when `amount = 0`; no invoice for `nao_bilhetavel`; no invoice outside `billing_start`/`billing_end`
- [ ] **Eventual generation:** instalments with the remainder in the last
- [ ] **Shadow run:** generate 2026-09 for the 3 existing clients and compare against the current cockpit, **expecting** the R$ 59,90 difference on client 18
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 3 — Cockpit rewrite

**Status:** Not started

**Rationale:** Só faz sentido depois que existe fatura para mostrar. Reescreve o render em vez de remendar os defeitos 1–6.

**Scope:**
- Client panel: composition, invoices, balances, states
- Settlement window per invoice (§4.2)
- Discount dialog (§4.3)
- Adjust dialog (§4.4)
- Open competência banner (§4.5)

#### Checklist

- [ ] **Panel:** invoice rows replace the series rows; the "vence dia {billing_start}" line is gone (defect 1)
- [ ] **Eventuais:** own row, own state (defect 2)
- [ ] **Overdue:** derived from `due_date` and balance (defect 3)
- [ ] **Settlement:** real `happened_at`, no fabricated date (defect 4)
- [ ] **Batch by range:** select `1..N`, one date, confirm
- [ ] **Discount:** both modes
- [ ] **Adjust:** reason required, audit visible
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Historic load wizard

**Status:** Not started

**Rationale:** É o que destrava o corte de nov/2026. O Financeiro precisa lançar os 18 contratos sem SQL.

**Scope:**
- Wizard: client → plan → preview → confirm → settlement
- Preview without persisting
- Chronological numbering on confirm
- F0 output consumed as defaults

#### Checklist

- [ ] **Wizard:** five steps per §4.7
- [ ] **Preview:** shows amounts and due dates before persisting
- [ ] **Chronological numbering:** 2022 before 2026
- [ ] **Batch settlement:** opens over the issued invoices
- [ ] **End-to-end:** load all 18 clients through the UI, no SQL
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Operation

**Status:** Not started

**Rationale:** Fecha a operação do dia a dia. Pode entrar depois do corte, desde que a Fase 4 esteja completa — o corte não depende dela.

**Scope:**
- Month selector from invoices (defect 5)
- Sync banner corrected to report partial synchronisation
- Reajuste alert (§4.6)
- Payment methods surfaced in the settlement window
- `clients.delay_days` = worst delay (defect 6)

#### Checklist

- [ ] **Months:** from `invoices`, up to the current month, no future
- [ ] **Banner:** partial sync reports the failure count, not "não sincronizou"
- [ ] **Reajuste alert:** past-due and 30-day anniversaries
- [ ] **Methods:** the six options available on payment entries
- [ ] **Worst delay:** `clients.delay_days` reflects the worst open invoice, verified against the dashboard and health score consumers
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 7. Current Checkpoint

### Production state

- Nothing from this SDD is implemented. Phase 1 not started.
- The current module is live and **incorrect in the ways listed in section 0**. No stakeholder should rely on its adimplência numbers.
- Three series have charges (18, 21, 29). 134 charges, 82 payments. All disposable — the rebuild does not preserve them.
- Go-live target 2026-11-01. Phases 1–4 are the critical path; Phase 5 may follow the cut.

### Architectural decisions

| Decision | Rationale |
|---|---|
| Regra e fatura em tabelas separadas | `contract_charges` conflating plan and document produced the horizon tail, the truncating save and the synthetic key. Separating removes the class |
| Fatura nasce ao fechar competência | Não se materializa futuro. O horizonte deixa de existir como dado e vira projeção na tela |
| Pagamento é valor, não status | O cliente pode pagar o eventual e não o MRR, ou parte de cada. Um status por competência não representa isso |
| Estado da fatura é derivado | Evita a divergência entre estado gravado e soma real dos lançamentos |
| Lançamentos são imutáveis; correção é `estorno` | Auditoria honesta: um erro vira uma linha, não um UPDATE |
| `clients.delay_days` = pior atraso | O trigger atual copia o mês mais recente; quem paga o mês novo some da priorização devendo os antigos. Afeta dashboard, health score, scoring e Gravity |
| Vencimento ancorado, sem regra no código | O requisito tem dois layouts em uso; impor um no código quebraria o outro |
| Sem meses futuros no seletor | Mês sem uso apurado faz `mrr_real` colapsar no piso e sugere uma queda de receita que não existe |
| Passado visível | O que o tornava artificial era não ter fatura; com o P9 passa a ter fatura e baixa, e escondê-lo quebraria a baixa em lote |
| Excedente compõe a fatura | Não é diferença a apontar: é receita. A fatura nasce com o valor real |
| Fatura de valor zero não é emitida | Especialmente para `por_os` sem piso e sem dado de uso — um documento de R$ 0,00 é ruído |
| `billing_exceptions` extinta | TD-015: concessão e desconto passam a ser o mesmo mecanismo em dois momentos |
| Reajuste manual, sistema alerta | Nenhuma série tem percentual preenchido; o cálculo vive fora do Hub. Automatizar exigiria uma fonte de índice que não existe |
| Sem backfill de `billing_payments` | Dado descartável documentado; o histórico entra pelo wizard com valor e data reais |

---

## 8. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always `import { Icons } from '../lib/icons'` then `<Icons.Name size={16} />`. Add new icons at the top (import) and alphabetically in the `Icons` object.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is re-enabled automatically — disable it manually for functions that manage their own auth. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`, pushed to `origin main`.
- **No local Supabase:** migrations go straight to production with `supabase db push --include-all`. Test on `donccx-donccx.vercel.app`.
- **`clientId` only exists inside `handleSubmit`** in `ClientFormContent.jsx`. Outside it, the client id is `client?.id`. Using `clientId` in the component body is a runtime `ReferenceError` the build does not catch.
- **Tailwind colour ties resolve by emission order, not attribute order.** `donc` comes before `text` in `tailwind.config.js`, so `className="text-donc-red"` loses to a `variant="secondary"`'s `text-text-primary`. Use `!text-donc-red`.
- **`due_date` clamp is mandatory.** A direct cast with `due_day = 30` in February throws `22008`. Use `least(month_start + (due_day−1) days, last_day_of_month)`.
- **`ref_month` is text `YYYY-MM`.** Parse via `|| '-01'` before casting to date.
- **`jsonb` usage fields are nullable.** `profissionais_versao` may be NULL, not an empty array. Always guard with `is not null` before `jsonb_array_length`.
- **Feature flags: `cockpit_financeiro`** gates the page, **`financeiro_cockpit_write`** gates writes. Register new flags in `SettingsFeatureFlags.jsx`.
- **The lifecycle RPCs are live and share tables.** `encerrar_series` deletes charges; after this rebuild it must operate on `invoices`/`series_rules`. Coordinate with `docs/sdd/contract-series-lifecycle-sdd.md` before changing either.
- **Existing workspace may be dirty.** Do not revert unrelated user changes.

### Rebuild-specific gotchas

- **`saveCharges` deletes and re-inserts recurrence rows.** In the new model this becomes harmless because payments reference invoices by `id`, and invoices are not re-created by editing the contract. Do not reintroduce a charge-id-keyed payment without checking this.
- **Two ways to express the recurring amount can disagree.** For a usage-driven series, the rule's `amount` and `unit × floor` are two representations of the same number. The form must derive one from the other; never let the user set both independently.
- **`invoices.amount` is frozen at issue.** Updating `series_rules` must never retroactively change an issued invoice.

---

## 9. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read **Section 1 (Premissas)** before writing any code. These are product decisions, not implementation choices.
3. Identify the **active phase** in section 6.
4. Implement item by item. Mark `[x]` when done and verified.
5. Run `npm run build` before marking any phase complete.
6. Fill the **Implementation Log** for the phase, update **Section 7 (Current Checkpoint)** with the new state, and update **Section 0** if production changed.
7. Before writing a migration, read `supabase/migrations/20260916120000_financeiro_write_roles_rls.sql` and `20260907000001_contract_series.sql` for the established patterns.
8. Never issue an invoice for the historic load before task F0 is reviewed and approved by the requester (§5.1).

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
