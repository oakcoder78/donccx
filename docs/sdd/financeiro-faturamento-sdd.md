# SDD — Faturamento e Contas a Receber (Billing & Receivables)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the rebuild of the billing and receivables module of doncCX Hub — the part of the system that issues invoices, records payments, discounts and write-offs, and reports delinquency. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

**Supersedes, partially:** `docs/sdd/financeiro-cockpit-sdd.md`. That document remains canonical for the usage/MRR extract (uso, piso, excedente, módulos, profissionais). Everything it says about **adimplência, composição de fatura e pendências** is superseded by this document. Do not implement adimplência from the old document.

**Related:** `docs/sdd/contract-series-lifecycle-sdd.md` (how a contract series is closed, reopened, suspended — its RPCs are migrated by Phase 3 of this rebuild); `docs/decisions/001-rebuild-faturamento.md` (why the rebuild instead of a patch).

**Why a rebuild and not an addendum.** Partial payment is a requirement: a client pays part of an eventual and part of a recurring invoice, or pays one and not the other. The current model stores one `status` per `(client, series, competência)` in `billing_payments` and cannot represent amounts. Beyond that, `contract_charges` conflates the **commercial plan** with the **issued document**, which produced six defects found on 2026-10-03 (section 0). The data is disposable (3 series, 134 charges, 82 payments) and the go-live is 2026-11, so this is the moment to replace the foundation. The cost of the patch alternative is recorded in the ADR.

### How to use this document

1. **Before implementing:** Read the document fully. Section 0 is the starting point; sections 1–4 are the contract; section 5 is the verification plan that gates every phase.
2. **During implementation:** Work one phase at a time from section 6. Each phase has its own checklist, deploy steps and expected values, and ends with `npm run build`.
3. **After each phase:** Fill the phase's Implementation Log, update section 7 (Current Checkpoint), and update section 0 if the production state changed. An outdated section 0 actively misleads the next agent.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Stage:** Draft — Section 0 verified against production on 2026-10-03; awaiting Phase 1
- **Active branch:** `main`
- **Last deploy:** `donccx-donccx.vercel.app` (Vercel auto-deploy on `git push origin main`)
- **Active phase:** none — Phase 1 not started
- **Go-live target:** 2026-11-01 (billing control moves from spreadsheet to Hub)

**What already exists related to this work:**

- `contract_series` — the commercial plan. 26 active series. Columns: `id`, `client_id`, `label`, `kind`, `billing_start`, `billing_end`, `due_day`, `auto_renew`, `status`, `reason`, `created_by`, `created_at`, `billing_type`, `billing_base_value`, `billing_floor`, `billing_status`, `billing_suspended_until`, `correction_index`, `contract_signed_date`, `contract_renewal`, `usage_driven`, `correction_anniversary`, `correction_percent`, `correction_rule`, `contract_months`, `encerramento_motivo`.
- `contract_charges` — **conflates plan and document.** 134 rows: 133 `recorrencia` (the plan, projected forward as a "horizon") + 1 `implantacao`. Columns: `id`, `client_id`, `kind`, `mode`, `month_index`, `amount`, `percent`, `installment_group`, `installments_total`, `label`, `reason`, `created_by`, `created_at`, `series_id`, `ref_month`, `due_date`. Only 3 series have charges (18, 21, 29).
- `billing_payments` — **status, not amount.** 82 rows. PK `(client_id, series_id, ref_month)`. Columns: `client_id`, `series_id`, `ref_month`, `status`, `delay_days`, `paid_at`, `note`, `updated_by`, `updated_at`.
- `billing_exceptions` — concession table with `valid_from`/`valid_to`, 4 types. **0 rows.** Never operated.
- `billing_os_tiers` — OS volume tiers. **0 rows.** Operated by `src/hooks/useBillingOsTiers.js` and `ClientFormContent.jsx`.
- `client_usage` — usage snapshots. `profissionais_versao` (jsonb array with `ativo`), `os_created`, `donc_snapshot->>'totalOs'`, `pending`, **`instance_id`**. **A client may have more than one instance row per month.**
- `_financeiro_series_month(p_ref_month)` — the MRR engine (SQL). Reads `contract_charges`, `billing_exceptions`, `billing_os_tiers`, `billing_suspended_until`. Callers: `get_financeiro_cockpit`, `get_financeiro_detalhe`, `get_financeiro_export`, `get_financeiro_pendencias`.
- `get_financeiro_cockpit(p_ref_month)`, `get_financeiro_detalhe(p_client_id, p_ref_month)` (returns `TABLE(series, modulos, excecoes, payment, eventuais, profissionais)`), `get_financeiro_export(p_ref_month)`, `get_financeiro_pendencias(p_months_back int DEFAULT 3)`.
- `ensure_series_horizon(p_series_id uuid)` — materialises recurrence forward **and** writes `billing_payments = 'adimplente'` for past months. Two unrelated responsibilities in one function.
- `encerrar_series`, `reabrir_series`, `reativar_series`, `set_nao_cobrar`, `cobrar_mais_meses` — lifecycle RPCs. `encerrar_series` deletes `contract_charges`; `reabrir_series` and `cobrar_mais_meses` call `ensure_series_horizon`.
- `sync_billing_payments_delay_days()` — AFTER INSERT/UPDATE/DELETE trigger on `billing_payments`. Copies the delay of the **most recent** `ref_month` to `clients.delay_days`. Consumed by `get_finance_summary`, `health-recalc`, `DashboardPage.jsx:199`, `scoring.js:158`, `healthScore.js:226`, `gravidade.js:30`, `ClientsPage.jsx:38`, `ClientHealthDrawer.jsx:105`.
- `trg_sync_charge_due_date` — derives `contract_charges.due_date` from `ref_month` + `due_day` with end-of-month clamp.
- Feature flags: `cockpit_financeiro` (admin/manager/finance), `financeiro_cockpit_write` (admin/finance/manager), `financial_data` (admin/manager/finance/**sales**). Registered in `SettingsFeatureFlags.jsx` under "Cockpits & Dashboards".
- Base UI components available: `Avatar`, `Badge`, `Button`, `Card`, `Drawer`, `HealthBar`, `Modal`, `PageHeader`, `Spinner`, `StagePill`, `UserEditModal` (all in `src/components/ui/`).

**What does NOT exist and needs to be created:**

- Separation between the recurrence **rule** and the **issued invoice**.
- `invoices` — a financial document with number, competência, amount, due date and audit trail.
- `invoice_entries` — an amount-based ledger (payment / discount / write-off / reversal) supporting partial settlement.
- Per-invoice delinquency: derived state and per-invoice delay with **amount**.
- Invoice numbering, payment method, external reference.
- Manual invoice adjustment with mandatory reason and audit; invoice cancellation.
- Batch settlement by range, and discount distribution across open invoices.
- "Open competência" indicator and a **close-competência** surface.
- Anniversary (reajuste) alert.
- Historic load wizard.
- `billing_run_log` — issuance observability.

**Defects this rebuild removes (do not patch them individually):**

| # | Defect | Root cause | Where |
|---|---|---|---|
| 1 | Series detail shows `billing_start` under the label "vence dia" | The label says due date; the value is the contract period | `FinanceiroCockpitPage.jsx:676,733` |
| 2 | A R$ 15.000 eventual shows as "adimplente" | One status per competência, not per invoice | `billing_payments` PK |
| 3 | No overdue indicator when a status exists | Delay derived from status, never from due date | cockpit render |
| 4 | Batch action fabricates `paid_at = due_date` | `saveRow(id, forcePaid)` sets the idealised date | `PaymentToggle.jsx` |
| 5 | June shows "não sincronizou" when it partially synced (57 success, 14 failed) | Month list from `sync_service_log`; banner reads the latest row, not the run outcome | `useFinanceiroCockpit.js`, `FinanceiroCockpitPage.jsx:1316` |
| 6 | Client paying the latest month resets `clients.delay_days` to 0 | Trigger copies the **latest** month's delay, not the **worst** | `sync_billing_payments_delay_days()` |
| 7 | **Multi-module clients are under-billed** — the engine suppresses excedente on every series that is not `kind='original'` | Usage is client-level, so the engine attributed it to one series; the real rule is that every module charges per licence | `_financeiro_series_month` (`uso_app` CASE) |
| 8 | **A client with an active series but no invoice vanishes from the cockpit with no notice** — 15 of 18 clients today | The engine only returns series with a rule for the competência; the cockpit treats "absent" and "nothing to bill" as the same thing | `_financeiro_series_month` gate + cockpit render |

Defect 7 is **latent**: no client has two series today (18, 21 and 29 have one each), so it has never produced a wrong invoice. It will on the day the first module series is created. Section 3.2 states the correct rule.

**Usage data coverage (measured 2026-10-03):**

| | Months with data |
|---|---|
| Licence usage (`profissionais_versao`) | **4** — 2026-06 → 2026-09 |
| OS usage (`os_created` / `donc_snapshot.totalOs`) | up to **10** — 2025-12 → 2026-09 |
| VALDIR MÓVEIS (client 29) | **0** — in implantation, no usage yet |

Client count with licence data per month: **17** in 2026-06 and 2026-07, **18** in 2026-08 and 2026-09.

Two clients have **more than one instance row per month**: LOJAS MM (instances 11 and 13, 505 professionals combined in 2026-09) and Lojas Simonetti (instances 14 and 18, 161 combined). Usage must be aggregated across instances.

**Scale of the historic load:** 18 clients, 26 series, contracts starting from 2021-03.

### Files to be touched

| File | Change type |
|---|---|
| `supabase/migrations/<ts>_billing_schema.sql` | **Create** — `series_rules`, `series_eventuals`, `invoices`, `invoice_entries`, `billing_run_log`, numbering, constraints, indexes, RLS |
| `supabase/migrations/<ts>_billing_derive.sql` | **Create** — derived state, delay, `clients.delay_days` writer, pendencies, cockpit RPCs |
| `supabase/migrations/<ts>_billing_lifecycle_migrate.sql` | **Create** — the 5 lifecycle RPCs onto `series_rules` + `invoices` |
| `supabase/migrations/<ts>_billing_retire.sql` | **Create** — drops; **last phase only** |
| `supabase/functions/contract-series-close/index.ts` | **Create** — closes a competência and issues invoices |
| `supabase/functions/contract-series-sync/index.ts` | Modify — stop writing payments; the horizon no longer materialises |
| `src/pages/FinanceiroCockpitPage.jsx` | Rewrite — invoice view, balance, composition, overdue, partial, close-competência |
| `src/pages/FaturamentoCarregamentoPage.jsx` | **Create** — historic load wizard |
| `src/App.jsx` | Modify — route for the wizard (follow the `CockpitRoute` pattern at line 122) |
| `src/components/financeiro/PaymentToggle.jsx` | Rewrite — per-invoice ledger, batch by range |
| `src/components/financeiro/CloseCompetenciaDialog.jsx` | **Create** — preview + confirm |
| `src/components/financeiro/InvoiceAdjustDialog.jsx` | **Create** — manual amount adjustment with reason |
| `src/components/financeiro/InvoiceCancelDialog.jsx` | **Create** — cancellation with reason |
| `src/components/financeiro/DiscountDialog.jsx` | **Create** — proportional distribution vs. targeted |
| `src/components/financeiro/InvoiceStateBadge.jsx` | **Create** — single state vocabulary over `ui/Badge.jsx` |
| `src/components/financeiro/OpenCompetenciaBanner.jsx` | **Create** — open competência + open invoices |
| `src/components/financeiro/ReajusteAlerta.jsx` | **Create** — anniversary alert |
| `src/components/financeiro/ExcecaoModal.jsx` | **Delete** — absorbed by plan discount + invoice discount |
| `src/components/clients/tabs/operacional/BillingSchedule.jsx` | Modify — reads `invoices`/`invoice_entries` |
| `src/components/clients/tabs/operacional/ClientSubDados.jsx` | Modify — worst delay + open balance instead of `useLatestBillingPayment` |
| `src/components/clients/ClientFormContent.jsx` | Modify — rule editor, pre-fill floor, no `saveCharges` |
| `src/components/clients/ContractLifecycleDialogs.jsx` | Modify — lifecycle actions against the new model |
| `src/components/clients/SeriesVencidasAlerta.jsx` | Modify — stop reading `contract_charges` |
| `src/hooks/useInvoices.js` | **Create** — invoice + entry queries and mutations |
| `src/hooks/useBillingPayments.js` | **Delete** — replaced by `useInvoices` |
| `src/hooks/useBillingExceptions.js` | **Delete** |
| `src/hooks/useBillingOsTiers.js` | Modify or delete — decision in §1.17 |
| `src/hooks/useContractCharges.js` | Modify — rules instead of charges |
| `src/hooks/useFinanceiroCockpit.js` | Modify — month list from invoices, not `sync_service_log` |
| `src/lib/financeiro.js` | Modify — invoice composition helpers, state→variant map |
| `src/lib/contractRules.js` | Modify — rule model extraction |
| `src/components/settings/SettingsFeatureFlags.jsx` | Modify — any new flag key |
| `docs/sdd/financeiro-cockpit-sdd.md` | Modify — supersession pointer (done 2026-10-03) |
| `docs/decisions/001-rebuild-faturamento.md` | **Create** — the rebuild ADR |
| `docs/operations/faturamento-carga-historica.md` | **Create** — output of task F0 |
| `docs/backlog.md` | Modify — close TD-015, update IDEA-003 |
| `.agents/docs-index.md` | Modify — index entry |

---

## 1. Premissas de negócio

Premissas validadas com o solicitante em 2026-10-03. **Mudar qualquer uma é decisão de produto, não de implementação** — exige atualizar esta seção e o registro de decisões da seção 7.

### 1.1 Regra ≠ Fatura

O contrato guarda o **plano**; a fatura é o **documento emitido**.

| | Regra | Fatura |
|---|---|---|
| O que é | "meses 1..36 a R$ 10.000" | "competência 2026-09, R$ 14.350, vence 30/10" |
| Onde vive | contrato (form do cliente) | motor de emissão |
| Muda? | sim, editável | não — emitida é fato |
| Quantas | 1 conjunto por série | 1 por competência + eventuais |

Hoje as duas moram em `contract_charges`, e a projeção futura ("horizonte") é materializada como se fosse documento. **Não se materializa futuro: fatura nasce quando a competência fecha.**

### 1.2 Composição: cada série cobra por licença, sobre o uso compartilhado

Cada série tem seu **próprio preço unitário** e seu **próprio piso**. O **uso é do cliente** e é compartilhado entre todas as séries.

```
fatura(série) = unit_série × greatest(coalesce(piso_série, 0), uso_cliente)
```

Caso real validado pelo solicitante — cliente com dois módulos, piso 200 licenças:

| Série | Unit | Piso | Uso 205 | Uso 200 |
|---|---|---|---|---|
| Principal (comunicação, métricas, operacional) | 50,00 | 200 | 10.250 | 10.000 |
| Agenda (novo módulo) | 20,00 | 200 | 4.100 | 4.000 |
| | | | **14.350** | **14.000** |

Cada módulo cobra as 205 licenças ao seu preço. O que se compartilha é a **contagem**, não o valor. O piso é por série porque um módulo pode eventualmente ter mínimo próprio; na prática as séries têm o mesmo piso, e o formulário **pré-preenche** o piso da série existente ao adicionar uma nova.

**Três bases de preço:**

| Base | Fórmula |
|---|---|
| `licenca` | `unit × greatest(coalesce(piso,0), uso_licenças)` |
| `os` | `unit × greatest(coalesce(piso,0), uso_os)` |
| `fixo` | o valor da faixa da regra; sem unit, sem piso, sem uso |

**Modo travado (`usage_driven = false`)** — validado com Financeiro/Vendas em 2026-09-11 e mantido: o valor é o da faixa da regra, e o uso é apenas informativo. É o modo de uma série de valor fechado que não varia com o uso. Hoje nenhuma das 20 séries ativas o usa, mas ele permanece no vocabulário.

> **Nota de implementação:** `billing_type='fixo'` e `usage_driven=false` produzem o mesmo resultado — o valor da faixa. A diferença é que `fixo` não tem unit nem piso configurados. Se na Fase 1 isso se provar redundante, a fusão é uma simplificação de schema, não uma mudança de comportamento.

**O excedente é faturado**, usando o uso real disponível na base. Não é "diferença a apontar".

### 1.3 Adimplência por valor — e **não existe crédito do cliente**

Um pagamento é um **valor** contra uma fatura. Um cliente pode pagar o eventual e não o MRR; pode pagar R$ 9.000 de um eventual de R$ 15.000 e R$ 2.000 de um MRR de R$ 4.000.

```
fatura R$ 15.000 · lançamentos R$ 9.000  →  parcial, faltam R$ 6.000
fatura R$  4.000 · lançamentos R$ 2.000  →  parcial, faltam R$ 2.000
fatura R$  4.000 · lançamentos R$ 4.000  →  quitada
vencida + saldo > 0                      →  vencida (atraso = hoje − vencimento)
```

Não existe campo `status`; o estado é derivado do saldo. E **não existe saldo credor**: pagar mais que a fatura não é um caso do processo. Quando o valor devido difere do valor faturado, o caminho é **ajustar a fatura** (§1.5), não pagar a mais.

### 1.4 Vencimento ancorado na série

Vale **o que o usuário cadastrar**. O código não impõe "vence no mês da competência" nem "no mês seguinte".

A série carrega **`first_competencia`** (competência do mês 1) e **`first_due_date`** (vencimento do mês 1), separados de `billing_start` — que permanece como a data de início da cobrança usada pelo engine de uso. O vencimento da competência N é `first_due_date + (N−1) meses`, com clamp no fim do mês. Quem cobra no mês seguinte cadastra a competência inicial deslocada.

Os dados atuais do Center Kennedy (`ref_month 2026-09` → `due_date 2026-09-30`) permanecem válidos.

### 1.5 Fatura emitida é imutável — com duas portas de saída

O motor não reescreve fatura emitida. Se o uso for ressincronizado depois da emissão, **não muda**.

| Ação | Quando | Efeito |
|---|---|---|
| **Ajustar valor** | o valor faturado difere do devido | muda `amount`, com motivo obrigatório e auditoria (`adjusted_from`, `adjust_reason`, `adjusted_by`, `adjusted_at`) |
| **Cancelar** | fatura emitida por erro (cliente, série, competência, duplicidade) | `status='cancelada'` com motivo e auditoria; a competência fica livre para reemissão |

Sem as duas, "imutável" vira prisão.

### 1.6 Reajuste é manual, o sistema alerta

Nenhuma série tem `correction_percent` preenchido. O índice é rótulo; o cálculo é feito fora do Hub.

O módulo **não calcula** o reajuste. Ele **alerta** que o aniversário venceu ou está por vencer, e o usuário aplica o novo valor manualmente — o que **anexa um novo período em `series_rules`** a partir da competência escolhida, preservando o histórico.

Dois aniversários caem no caminho crítico: **Lojas Eletromóveis em 2026-10-27** e **Center Kennedy em 2026-11-30**.

### 1.7 Carga histórica: piso, ajuste na baixa, lote por faixa

O módulo financeiro nasce **depois** de todos os clientes já estarem operando. O controle sai da planilha em nov/2026.

- Contratos antigos (Eletromóveis, 36 meses já vencidos, segue mês a mês) e vigentes (Center Kennedy, até 2027-01) entram pelo mesmo wizard.
- Faturas do passado **entram no valor calculado** — o piso onde não há dado de uso, `unit × max(piso, uso)` onde há. **Não são presumidas pagas.**
- O Financeiro dá baixa em lote, por faixa, com **data e valor reais por fatura**. Quando o valor real difere do faturado, o caminho é **ajustar a fatura** (§1.5) antes de dar baixa — nunca pagar a maior.
- Inadimplências reais existem e precisam poder ser marcadas depois.

Alternativa descartada: atribuir o passado como pago no momento do lançamento. Preterida porque esconde a diferença entre "apurado" e "assumido" justamente quando o Financeiro está conferindo.

### 1.8 Navegação de competências

**Todas as competências com fatura, até o mês corrente.** Isso inclui o passado.

O que tornava o passado artificial era não haver fatura nele — só snapshot de uso. Com o §1.7, o passado passa a ter fatura e baixa, e escondê-lo quebraria a própria operação de baixa em lote.

**Sem meses futuros.** Um mês à frente não tem uso apurado, então `mrr_real` colapsaria no piso: o cockpit mostraria setembro em R$ 9.354,85 e outubro em R$ 9.294,95, uma queda que não aconteceu — apenas não há snapshot ainda.

A fonte da lista é **competências com fatura**, não `sync_service_log`.

### 1.9 Pendência: quando cada fatura entra

| Tipo | Entra em pendência quando |
|---|---|
| **Recorrência** | vencida (`due_date < hoje`) e com saldo > 0 |
| **Eventual** | vencida (`due_date < hoje`) e com saldo > 0 |
| **Qualquer uma, quitada** | nunca |

Uma recorrência recém-fechada e ainda não vencida **não** é pendência — ela está em aberto. A distinção entre "em aberto" e "vencida" é o que separa o painel de competência aberta da lista de inadimplência.

### 1.10 O motor não presume o passado

`ensure_series_horizon` hoje grava `adimplente` em meses passados. Isso sai: a função deixa de existir como materializador, e quem assume o passado é o Financeiro, pelo fluxo do §1.7. **Um único caminho escreve baixa: o lançamento.**

### 1.11 Desconto: dois modos, proporcional com teto

Negociação com cliente inadimplente tem duas formas, e o usuário escolhe na hora:

1. **Distribuir** um valor total entre as faturas abertas selecionadas — **proporcional ao saldo de cada uma**, com teto no próprio saldo e o resto redistribuído entre as demais.
2. **Aplicar** em faturas específicas — inclusive 100% em uma fatura e cobrar as demais.

Distribuição igual em valor foi descartada: R$ 5.000 sobre faturas de R$ 1.000, R$ 2.000 e R$ 10.000 daria R$ 1.666,67 a cada uma, estourando as duas primeiras.

Cada desconto carrega **motivo** e, quando a negociação é única sobre várias faturas, uma referência de lote (`batch_id`) para reconstruir o acordo.

### 1.12 Cancelamento de fatura

Fatura emitida para o cliente errado, série errada, competência errada ou em duplicidade é **cancelada**, não apagada.

- `cancel_invoice(id, reason)` grava `status='cancelada'`, `cancelled_by`, `cancelled_at`, `cancel_reason`
- Lançamentos existentes permanecem (são fatos)
- A competência fica livre: o índice único de recorrência filtra `status='emitida'`
- A substituta é emitida normalmente e referencia a cancelada em `replaces_invoice_id`

### 1.13 Baixa por perda (incobrável)

Dívida que não será recebida é registrada como **`baixa`** — tipo próprio no ledger, com motivo e alçada. Não é desconto: desconto é dedução de receita negociada, baixa é perda.

Sem o tipo próprio, uma dívida incobrável fica registrada como "quitada por desconto" e a estatística de inadimplência desaparece.

### 1.14 Mês cheio e uso tardio

- **Série iniciada no meio do mês fatura o mês cheio.** Documentado como regra, não como omissão. Sem pro-rata na v1.
- **Uso que chega depois da emissão** gera **fatura complementar** (`kind='complemento'`, referenciando a original) — a original nunca é reescrita. É o que preserva o documento e captura a receita.

### 1.15 TD-015 resolvido

`billing_exceptions` (concessão com vigência, 0 registros) é **substituída** por dois conceitos:

- **Desconto previsto no plano** — uma redução que entra na geração da fatura (faixa de `series_rules` com percentual reduzido).
- **Desconto negociado** — um lançamento numa fatura emitida (§1.11).

Um mecanismo, dois momentos. A tabela e o `ExcecaoModal` saem.

### 1.16 Papéis

As permissões são **data-driven pelas flags existentes**, não hardcoded:

| Operação | Flag |
|---|---|
| Ler faturas e lançamentos | `financial_data` |
| Emitir, ajustar, cancelar, descontar, dar baixa | `financeiro_cockpit_write` |

Hoje `financial_data` inclui `sales`; se vendas não deve ver inadimplência, é desligar na flag — decisão de configuração, não de código.

### 1.17 Fora de escopo

Conciliação bancária, emissão de boleto/PIX, nota fiscal (feita em outro sistema — a fatura guarda apenas um campo livre `nf_ref`), juros e multa, parcelamento de fatura, múltiplas moedas, pro-rata, contestação de fatura como estado próprio.

Contestação: na v1 a fatura segue vencida e o Financeiro usa o ajuste com motivo se houver acordo. Se a contestação for rotina, entra como estado depois do corte.

`billing_os_tiers`: hoje 0 linhas e 1 série `por_os` (Todimo) com piso 0. A decisão de manter ou remover as faixas é da Fase 1, com o solicitante.

---

## 2. Data Model & Contracts

### 2.1 `contract_series` — changes

| Column | Action | Notes |
|---|---|---|
| `billing_type` | Keep | `licenca` \| `os` \| `fixo`. Existing `por_licenca`/`por_os` migrate |
| `billing_floor` | Make nullable | `NULL` = sem piso. Migrate `0 → NULL` **only in the same push that replaces the engine** (see §8 gotcha) |
| `billing_base_value` | Keep | Unit price. Unused when `billing_type='fixo'` |
| `usage_driven` | Keep | `false` = travado (§1.2) |
| `first_competencia` | **Add** `text NOT NULL` | `YYYY-MM` of `month_index = 1`. Backfill: `to_char(billing_start,'YYYY-MM')` |
| `first_due_date` | **Add** `date` | Due date of `month_index = 1`. Backfill: `billing_start` |
| `billing_suspended_until` | **Drop** (retire phase) | Dead (0 non-null) |
| `billing_status` | Keep | `ativo` \| `nao_bilhetavel` only |
| `correction_*` | Keep | Alert-only (§1.6) |

### 2.2 `series_rules` — new

The recurrence plan. Extracted from `contract_charges` where `kind = 'recorrencia'`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `series_id` | uuid NOT NULL FK → `contract_series` ON DELETE CASCADE | |
| `month_from` | smallint NOT NULL CHECK ≥ 1 | |
| `month_to` | smallint NULL CHECK (month_to IS NULL OR month_to ≥ month_from) | `NULL` = open-ended |
| `mode` | text NOT NULL CHECK IN ('amount','percent') | |
| `amount` | numeric NULL CHECK ≥ 0 | required iff `mode='amount'` |
| `percent` | numeric NULL CHECK BETWEEN 0 AND 100 | required iff `mode='percent'` |
| `created_by` | uuid NULL FK → `profiles` | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

CHECK: `(mode='amount' AND amount IS NOT NULL AND percent IS NULL) OR (mode='percent' AND percent IS NOT NULL AND amount IS NULL)`.
UNIQUE `(series_id, month_from)`. Contiguity (no gaps, no overlap) validated in the RPC.

### 2.3 `series_eventuals` — new

Eventuais foreseen in the contract.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `series_id` | uuid NOT NULL FK → `contract_series` ON DELETE CASCADE | |
| `label` | text NOT NULL | |
| `total` | numeric NOT NULL CHECK > 0 | |
| `installments` | smallint NOT NULL CHECK ≥ 1 | |
| `first_due_date` | date NOT NULL | |
| `created_by` | uuid NULL FK → `profiles` | |

### 2.4 `invoices` — new

The issued document. Replaces `contract_charges`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `number` | text UNIQUE NOT NULL | `FAT-{year}-{seq:06d}` (§2.7) |
| `client_id` | integer NOT NULL FK → `clients` **ON DELETE RESTRICT** | a financial document outlives the customer |
| `series_id` | uuid NULL FK → `contract_series` **ON DELETE RESTRICT** | NULL for ad-hoc invoices |
| `kind` | text NOT NULL CHECK IN ('recorrencia','eventual','complemento') | |
| `competencia` | text NOT NULL CHECK ~ `^\d{4}-(0[1-9]|1[0-2])$` | `YYYY-MM` |
| `amount` | numeric NOT NULL CHECK ≥ 0 | frozen at issue |
| `due_date` | date NOT NULL | derived at issue (§3.3) |
| `description` | text NULL | eventual label |
| `installment_group` | uuid NULL | groups instalments of one eventual |
| `installment_no` | smallint NULL CHECK ≥ 1 | **1-based** |
| `installments_total` | smallint NULL CHECK ≥ 1 | |
| `status` | text NOT NULL DEFAULT `'emitida'` CHECK IN (`'emitida'`,`'cancelada'`) | document status; financial state is derived |
| `replaces_invoice_id` | uuid NULL FK → `invoices` | set on the substitute of a cancelled invoice |
| `nf_ref` | text NULL | free reference to the external NF |
| `adjusted_from` | numeric NULL | previous amount |
| `adjust_reason` | text NULL | |
| `adjusted_by` | uuid NULL FK → `profiles` | |
| `adjusted_at` | timestamptz NULL | |
| `cancelled_by` | uuid NULL FK → `profiles` | |
| `cancelled_at` | timestamptz NULL | |
| `cancel_reason` | text NULL | |
| `issued_at` | timestamptz NOT NULL DEFAULT now() | |
| `issued_by` | uuid NULL FK → `profiles` | |

CHECK: all-or-nothing for `adjusted_*` (all four set or all null) and for `cancelled_*` (all three set or all null).
CHECK: `(installment_group IS NULL AND installment_no IS NULL AND installments_total IS NULL) OR (all three NOT NULL)`.
CHECK: `kind='complemento'` requires `replaces_invoice_id IS NOT NULL`.

**Indexes:**
```sql
CREATE UNIQUE INDEX invoices_recurrence_uq ON invoices (series_id, competencia)
  WHERE kind='recorrencia' AND status='emitida';
CREATE UNIQUE INDEX invoices_eventual_inst_uq ON invoices (installment_group, installment_no)
  WHERE installment_group IS NOT NULL;
CREATE INDEX invoices_client_comp_idx ON invoices (client_id, competencia DESC);
CREATE INDEX invoices_comp_idx ON invoices (competencia);
CREATE INDEX invoices_due_open_idx ON invoices (due_date) WHERE status='emitida';
CREATE INDEX invoices_series_idx ON invoices (series_id);
```

### 2.5 `invoice_entries` — new

The ledger. Replaces `billing_payments`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invoice_id` | uuid NOT NULL FK → `invoices` **ON DELETE RESTRICT** | never cascade |
| `kind` | text NOT NULL CHECK IN (`'pagamento'`,`'desconto'`,`'baixa'`,`'estorno'`) | |
| `amount` | numeric NOT NULL CHECK > 0 | always positive; `kind` gives the sign |
| `happened_at` | date NOT NULL | |
| `method` | text NULL CHECK IN (`'pix'`,`'boleto'`,`'transferencia'`,`'cartao'`,`'dinheiro'`,`'outro'`) | required iff `kind='pagamento'` |
| `external_ref` | text NULL | bank reference / receipt |
| `note` | text NULL | |
| `reason` | text NULL | required iff `kind IN ('estorno','baixa')` |
| `reverses_id` | uuid NULL FK → `invoice_entries` | required iff `kind='estorno'` |
| `batch_id` | uuid NULL | groups a discount negotiation or a batch settlement |
| `created_by` | uuid NULL FK → `profiles` | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

CHECKs:
- `method IS NOT NULL` iff `kind='pagamento'`
- `reason IS NOT NULL AND length(reason) >= 10` iff `kind IN ('estorno','baixa')`
- `reverses_id IS NOT NULL` iff `kind='estorno'`

Trigger `invoice_entries_validate_reversal` (BEFORE INSERT):
- the target of `reverses_id` must belong to the **same** `invoice_id`
- the target must not itself be an `estorno` (no reversal of a reversal)
- the sum of estornos targeting an entry must never exceed that entry's `amount`
- `kind='baixa'` requires `financeiro_cockpit_write` role

**Indexes:**
```sql
CREATE INDEX invoice_entries_invoice_idx ON invoice_entries (invoice_id) INCLUDE (kind, amount);
CREATE INDEX invoice_entries_batch_idx ON invoice_entries (batch_id) WHERE batch_id IS NOT NULL;
```

**Entries are immutable.** A correction is a new `estorno`. No UPDATE, no DELETE (enforced by RLS: no UPDATE/DELETE policy).

### 2.6 `billing_run_log` — new

Issuance observability (§5.5).

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `run_at` | timestamptz NOT NULL DEFAULT now() | |
| `competencia` | text NOT NULL | |
| `series_id` | uuid NULL FK → `contract_series` | NULL for the run summary |
| `outcome` | text NOT NULL CHECK IN ('emitida','pulada','erro') | |
| `reason` | text NULL | e.g. `amount_zero`, `nao_bilhetavel`, `outside_window`, `usage_incomplete` |
| `invoice_id` | uuid NULL FK → `invoices` | |
| `detail` | jsonb NULL | amounts, usage, floor at decision time |

### 2.7 Invoice numbering

`FAT-{issue_year}-{global_sequence:06d}` — zero-padded so lexical order matches numeric order. A global sequence (`invoice_number_seq`), not reset per year; the year prefix is informational. On the historic load, invoices are numbered in **chronological competência order** per client, so the sequence reads coherently within a client's history.

`generate_invoice_number()` returns the formatted string. The number is allocated inside the same statement that inserts the invoice, so a conflict does not burn a number.

### 2.8 Derived values

Not stored. Exposed by views or RPCs.

```
paid        = Σ amount WHERE kind='pagamento'  −  Σ amount WHERE kind='estorno' targeting a pagamento
discounted  = Σ amount WHERE kind='desconto'   −  Σ amount WHERE kind='estorno' targeting a desconto
written_off = Σ amount WHERE kind='baixa'      −  Σ amount WHERE kind='estorno' targeting a baixa
balance     = amount − paid − discounted − written_off
```

Reversal is attributed to the **kind of its target**, so an estorno of a discount does not inflate `paid`.

### 2.9 `clients.delay_days` — the writer

The current writer is the trigger on `billing_payments`, which is retired. The new writer is a **statement-level trigger on `invoice_entries`** (INSERT) plus an AFTER UPDATE trigger on `invoices` (status changes), both calling:

```sql
refresh_client_delay_days(p_client_id int)
```

which recomputes the **worst** delay among that client's invoices with `balance > 0`:

```
delay = greatest(0, (balance > 0 ? current_date : last_settlement_date) − due_date)
```

The same function is called by `settle_invoice`, `discount_invoice`, `write_off_invoice`, `adjust_invoice`, `cancel_invoice` and the close-competência run, so the value is never stale. A one-off recompute for all clients runs in the migration.

This value feeds `get_finance_summary`, `health-recalc`, `DashboardPage.jsx`, `scoring.js`, `healthScore.js`, `gravidade.js`, `ClientsPage.jsx` and `ClientHealthDrawer.jsx`. Migrating it is part of Phase 1, not Phase 6.

### 2.10 RLS

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `series_rules` | `financial_data` | `financeiro_cockpit_write` via RPC | via RPC | via RPC |
| `series_eventuals` | `financial_data` | `financeiro_cockpit_write` via RPC | via RPC | via RPC |
| `invoices` | `financial_data` | `financeiro_cockpit_write` via RPC | **only** via `adjust_invoice`/`cancel_invoice` | **none** |
| `invoice_entries` | `financial_data` | `financeiro_cockpit_write` via RPC | **none** | **none** |
| `billing_run_log` | `financial_data` | service role | none | none |

Role checks read the `feature_flags.allowed_roles` for `financial_data` / `financeiro_cockpit_write`, not a hardcoded list. Pattern: `SECURITY DEFINER` + explicit guard, mirroring `20260916120000_financeiro_write_roles_rls.sql`.

**Service role identity.** The issuing engine is an Edge Function calling with service role, which bypasses RLS and has no `auth.uid()` — so `get_user_role()` returns NULL and a role guard would reject it. The guard accepts `auth.role() = 'service_role'`, and the Edge Function performs its own `authorizeRequest` (the pattern already used by `contract-series-sync`). The GRANTs on the new tables are restricted to `authenticated` and `service_role`; `anon` is revoked.

### 2.11 `ensure_series_horizon` — retired

The function stops materialising recurrence and stops writing payments. Its remaining responsibility — none — is removed. The "Repor horizonte" button and the `contract-series-sync` cron are removed or repurposed to the close-competência run (decision in Phase 3).

---

## 3. Derivation Rules

> **This section is written from `pg_get_functiondef('_financeiro_series_month')`, not from memory.** The first draft of this SDD restated the usage formula incorrectly in six ways. Any change here must be checked against the live function and against the parity test in §5.6.

### 3.1 Usage (client-level, aggregated across instances)

```sql
-- licence usage: aggregate across ALL instance rows of the client
SELECT cu.client_id,
       count(*) FILTER (WHERE (prof->>'ativo')::boolean)::bigint AS uso_lic
FROM public.client_usage cu
CROSS JOIN LATERAL jsonb_array_elements(cu.profissionais_versao) AS prof
WHERE cu.ref_month = p_ref_month
  AND cu.profissionais_versao IS NOT NULL
  AND coalesce(cu.pending, false) = false
GROUP BY cu.client_id;

-- OS usage: sum across instances, snapshot first, then os_created
SELECT cu.client_id,
       sum(coalesce((cu.donc_snapshot->>'totalOs')::bigint, cu.os_created, 0))::bigint AS uso_os
FROM public.client_usage cu
WHERE cu.ref_month = p_ref_month
  AND coalesce(cu.pending, false) = false
GROUP BY cu.client_id;
```

Three rules that must not be lost:
1. **`GROUP BY client_id`** — a client can have multiple `instance_id` rows in the same month (LOJAS MM has 2, with 505 professionals combined in 2026-09). Counting a single row halves the usage.
2. **`coalesce(pending, false) = false`** — a pending snapshot is not billable.
3. **`donc_snapshot->>'totalOs'` before `os_created`** — the snapshot is the corrected value.

**Usage is a client property.** Every series of the client reads the same number.

### 3.2 Invoice amount

```
usage_metric(série) =
  billing_type = 'licenca' → uso_lic
  billing_type = 'os'      → uso_os
  billing_type = 'fixo'    → none

base(série, competência) =
  rule(competência).mode = 'percent' → rule.percent/100 × unit × greatest(coalesce(floor,0), 1)
  rule(competência).mode = 'amount'  → rule.amount
  (no rule for the competência)      → no invoice

amount(série, competência) =
  usage_driven = false               → base                      (travado)
  billing_type = 'fixo'              → base
  billing_type IN ('licenca','os')   → unit × greatest(coalesce(floor, 0), usage_metric)
```

**There is no `kind='original'` guard.** Every series with `usage_driven=true` charges excedente on the shared usage, each at its own unit price. That is the rule validated by the requester (§1.2): with 205 licences, série 1 at R$ 50 and série 2 at R$ 20 produce 10.250 + 4.100 = 14.350. The live engine suppresses the second series' excedente (defect 7).

`amount = 0` → **no invoice is issued**. A R$ 0,00 document is noise, not a record. Applies especially to `por_os` without a floor and without usage data.

### 3.3 Due date

```
month_index(competência) = months between first_competencia and competência, +1
due_date(competência)    = clamp(first_due_date + (month_index − 1) months, due_day)
```

`clamp` caps the day at the last day of the target month — required, because a direct cast throws `22008` with `due_day = 30` in February. The clamp is applied per invoice, so a series anchored on the 31st produces the 28th/29th/30th in shorter months and returns to the 31st afterwards.

### 3.4 Recurrence stop rule

The engine must decide, per competência, whether the series is still billable. Every combination is defined:

| `billing_end` | `contract_months` | `auto_renew` | Rule |
|---|---|---|---|
| set, competência > `billing_end` | any | any | **stop** |
| null | set | true | continue indefinitely (month-to-month after `contract_renewal`) |
| null | set | false | **stop** after `contract_months` months from `first_competencia` |
| null | null | true | continue indefinitely |
| null | null | false | continue while `status='ativa'`; the series-vencida alert fires (existing behaviour) |

`contract_months` is NULL in 12 of the 18 client series. A null must mean "not declared", not "zero" — hence the explicit row above. This is the exact shape of lifecycle defect 1 (a closed contract kept billing), so it is a mandatory test (§5.3 scenario 20).

### 3.5 Eventual schedule

```
installment i (1-based) of n:
  due_date    = clamp(first_due_date + (i−1) months, day(first_due_date))
  amount      = floor(total/n, 2) for i < n; remainder for i = n
  competencia = YYYY-MM of due_date
  installment_no = i   (1-based)
```

### 3.6 Invoice state, balance and delay

```
balance      = amount − paid − discounted − written_off
overdue_days = greatest(0, (balance > 0 ? current_date : last_settlement_date) − due_date)
overdue_amount = balance > 0 ? balance : 0

state =
  status = 'cancelada'      → cancelada
  balance ≤ 0               → quitada
  overdue_days > 0          → vencida      (with overdue_amount)
  paid+discounted+written_off = 0 → aberta
  otherwise                 → parcial
```

`clients.delay_days` = the **worst** `overdue_days` among invoices with `balance > 0`. The dashboard, health score, scoring and Gravity keep reading `delay_days`; the cockpit additionally shows `overdue_amount` and aging buckets, because **days alone mislead**: a R$ 10 residual overdue 90 days would dominate a R$ 15.000 default.

### 3.7 Pendências

```
pendencia = invoice
  WHERE status = 'emitida'
    AND balance > 0
    AND due_date < current_date
```

One predicate, no `kind` clause. Recurrence and eventual enter by the same rule (§1.9). This replaces the contradictory §1.9/§3.5 pair of the first draft.

### 3.8 Competência list

```
months = SELECT DISTINCT competencia FROM invoices
         WHERE competencia <= to_char(current_date, 'YYYY-MM')
         ORDER BY competencia DESC
```

No forward months, no `sync_service_log`. Default selection = `max(competencia)`.

### 3.9 Cockpit row state — a série não pode sumir

A série que desaparece do cockpit sem aviso é o defeito (d) da §0 do `contract-series-lifecycle-sdd.md`: o Financeiro não distingue "não deve ser cobrado" de "sumiu". O cockpit novo mostra **três estados**, não dois:

```
row_state(cliente, competência) =
  tem fatura na competência            → 'com_fatura'
  tem série ativa, sem fatura          → 'sem_fatura' + motivo
  sem série ativa                      → ausente (não há o que cobrar)
```

O motivo de `sem_fatura` é derivado, na primeira condição que casar:

| Ordem | Condição | Motivo |
|---|---|---|
| 1 | Nenhuma regra cobre a competência | `sem_regra` |
| 2 | `billing_status = 'nao_bilhetavel'` | `nao_bilhetavel` |
| 3 | Fora de `billing_start`/`billing_end`, ou parada pela regra de §3.4 | `fora_janela` |
| 4 | `unit × greatest(coalesce(piso,0), uso) = 0` | `valor_zero` |
| 5 | A competência não tem execução de fechamento | `nao_fechada` |

A derivação é **stateless** — não depende do `billing_run_log`, que é o registro da execução, não a regra. O log serve para conferência e para a observabilidade da §5.5.

Consequência prática: os **15 clientes com série mas sem regra** aparecem com `sem_regra` em vez de sumirem. É o que torna o cockpit útil durante a carga — a tela mostra o que falta lançar em vez de mostrar três linhas sem explicação.

Para uma competência ainda não fechada, os clientes faturáveis aparecem como `nao_fechada`, e o painel mostra o **valor projetado** (a mesma fórmula que o fechamento usaria), marcado como projeção. Assim o Financeiro vê o que será emitido antes de fechar.

---

## 4. Superfície (UI)

### 4.1 Cockpit — invoice-oriented

The client row keeps `MRR mín.`, `MRR real`, `Δ`, `Uso`, and gains an **open balance** indicator. **Every client with an active series appears** — a client is never silently absent (§3.9).

| Row state | When | What the row shows |
|---|---|---|
| **Com fatura** | the competência has invoices | open balance + state badge + `N de M faturas` |
| **Sem fatura** | has an active series, no invoice | selo `sem fatura` + the **motivo** (§3.9) + the projected amount when the competência is open |
| *(ausente)* | no active series | not listed |

The expanded panel:

| Block | Content |
|---|---|
| Header | `R$ {open balance} em aberto` + state badge + `N de M faturas` where **N = invoices not settled in the competência**, **M = invoices issued (not cancelled) in the competência** |
| Composition | MRR mínimo, MRR real, Excedente faturado, Faturas do mês |
| Invoices of the month | One row per invoice: number, kind, amount, due date, balance, state, last settlement |
| Eventuais | Each eventual as its own row with its own state — never merged |
| Profissionais ativos | unchanged |

For a `sem_fatura` row, the panel shows the motivo and, when the competência is open, the projected amount — so the Finance team sees what the close run would emit before running it.

Removed: the "vence dia {due_day} · {billing_start} → {billing_end}" line (defect 1). The invoice row shows `vence {due_date}` — the invoice's own due date.

### 4.2 Close competência

**The missing primary action.** A button in the cockpit header, gated by `financeiro_cockpit_write`.

Flow:
1. Select the competência to close (default = the first not-yet-closed month with usage data).
2. **Preview** — the generator runs without persisting and lists, per series: client, series, usage, floor, unit, base, excedente, amount, due date. Series that will be skipped are listed with the reason (`amount_zero`, `nao_bilhetavel`, `outside_window`, `usage_incomplete`).
3. **Completeness gate** — if any client's usage snapshot for that competência is `pending` or missing, the run is blocked and those clients are listed as "em conciliação". The user can close anyway with an explicit acknowledgement, and those clients are recorded as `usage_incomplete` in `billing_run_log`.
4. **Confirm** — invoices are issued chronologically and numbered.
5. Result is written to `billing_run_log` and surfaced as a summary.

A close run is **idempotent**: running twice issues nothing the second time (partial unique index + `ON CONFLICT DO NOTHING`). A `pg_advisory_xact_lock` on the competência serialises concurrent runs.

### 4.3 Settlement window

Opens with the client and competência. Lists **every invoice of that competência** — recurrence, eventuals and complements separately.

- Per-invoice: add payment (amount + date + method + external ref), add discount, add write-off (loss), reverse a settlement.
- **Batch by range:** select invoices by checkbox or by range (`1..25`), set one `happened_at` **per invoice** (or apply one date to all with an explicit "aplicar a todas" action), confirm. Default amount = the invoice's balance.
- **No overpayment.** When the real value differs from the invoiced value, the row offers **"ajustar valor"** which opens the adjust dialog; after the adjustment the balance matches and the settlement is exact.

### 4.4 Histórico view

The per-competência window shows ~3 invoices. The Eletromóveis history has 46 across 45 months. A separate **Histórico** view lists **all invoices of the client** in `due_date` order with:

- a stable ordinal `#` (1-based, ordered by `due_date`, then `number`)
- filters `de` / `até` on the ordinal
- a running total of the selection
- the batch settlement action over the selection

This is where the requester's "da 1 até a 25" lives. The ordinal is **not** the invoice number; the number is global and not contiguous per client.

### 4.5 Discount dialog

| Mode | Input | Behaviour |
|---|---|---|
| Distribuir | total amount + selected invoices | proportional to each balance, capped at the balance, remainder redistributed; one `desconto` per invoice sharing a `batch_id` |
| Aplicar | specific invoices + value or 100% | one `desconto` per invoice |

Reason required in both modes.

### 4.6 Adjust invoice dialog

Amount + mandatory reason. Writes `adjusted_from`, `adjust_reason`, `adjusted_by`, `adjusted_at` and the new `amount`. Blocked if the new amount is below `paid + discounted + written_off` (that would create a credit, which does not exist).

**Where the correction belongs** — four paths, from cheapest to most expensive:

| Moment | Path | Effect |
|---|---|---|
| Before issuing | change the series config (unit, floor) or the rule | affects future invoices only |
| In the wizard preview (§4.10 step 3) | see before persisting | nothing issued yet — **the cheapest moment** |
| Issued, not settled | adjust the invoice (this dialog) | audited change to `amount` |
| Settled | reverse the settlement (`estorno`) → adjust → settle again | required because the adjust is blocked below the settled total |
| **A whole batch wrong** (e.g. the wrong `unit` for a client) | **cancel the invoices → fix the series → reissue** (§4.7) | cleaner than adjusting 60 invoices one by one |

For the historic load, the recommended sequence is **review in the preview → confirm → settle**. Adjusting after settlement works but costs three operations per invoice.

### 4.7 Cancel invoice dialog

Reason + summary of what will happen to existing entries (they remain). Confirmation required. The dialog offers to issue the substitute immediately.

### 4.8 Open competência and open invoices

Two distinct elements, not one:

| Element | Meaning | Action |
|---|---|---|
| **"Competência {mês} não fechada"** | the month has usage data but no invoices | opens the close-competência flow (§4.2) |
| **"Faturas em aberto — {n} · R$ {total}"** | settled competências still carrying a balance | opens the pendencies list filtered |

The first disappears when the month is closed; the second when the balance is zero.

### 4.9 Reajuste alert

Lists series whose `correction_anniversary` has passed or falls within 30 days, with the index. Action: apply a new value from a chosen competência, appending a `series_rules` period.

### 4.10 Historic load wizard

Step 1 — client and series (reuses the contract form fields).
Step 2 — plan: recurring rule, eventuais, pricing basis, floor (**pre-filled from the existing series when adding a module**).
Step 3 — preview: the generator runs **without persisting** and shows the invoice list with amounts and due dates (uses the F0 conference output as defaults).
Step 4 — confirm: invoices are issued chronologically.
Step 5 — settlement: the **Histórico** view (§4.4) opens over the issued invoices.

Route registered in `src/App.jsx` following the `CockpitRoute` pattern.

### 4.11 Month selector

Populated from invoices (§3.8). Default = `max(competencia)`. Empty state: "Nenhuma fatura emitida ainda — feche uma competência", linking to §4.2.

### 4.12 State vocabulary

One component, `InvoiceStateBadge`, over `src/components/ui/Badge.jsx`. The map lives in `src/lib/financeiro.js`.

| State | Variant | Shows |
|---|---|---|
| `quitada` | verde | — |
| `aberta` | navy/sky | — |
| `parcial` | âmbar | `R$ {balance}` |
| `vencida` | vermelho | `{overdue_days}d · R$ {overdue_amount}` |
| `cancelada` | slate, riscado | — |

Default sort: `due_date` ascending, then balance descending.

**Row state vocabulary** (`sem_fatura` reasons from §3.9), in `src/lib/financeiro.js`:

| Motivo | Label | Cor |
|---|---|---|
| `sem_regra` | "sem regra lançada" | âmbar — ação pendente do Financeiro |
| `nao_bilhetavel` | "não faturável" | slate — decisão |
| `fora_janela` | "fora do período do contrato" | slate — decisão |
| `valor_zero` | "nada a faturar" | slate — decorrência |
| `nao_fechada` | "competência não fechada" | navy — ação pendente |

Âmbar é reservado para o que exige ação; slate para o que é consequência de uma decisão já tomada. Sem essa distinção, "esqueci de lançar" e "decidi não cobrar" viram a mesma linha.

### 4.13 UI states

Every new surface specifies: empty (by reason — "competência sem faturas", "série sem emissão por valor zero", "sem permissão de escrita"), loading (skeleton per `ui-patterns.md`), error (with retry, following `FinanceiroCockpitPage.jsx:490`), read-only mode (write flag off), and long-list handling (internal scroll; the Histórico view paginates at 50).

### 4.14 Responsive

The settlement window and the Histórico view are a **right drawer on ≥md** (`ui/Drawer.jsx` exists) and a **full-screen sheet on <md**. The client panel keeps the current dual tree (`hidden md:block` table / `md:hidden` cards) and the `isDesktop && isOpen` guard that prevents double-mounting the panel.

### 4.15 Destructive actions

| Action | Reversible? | Confirmation | Style |
|---|---|---|---|
| Dar baixa (pagamento) | yes — `estorno` | inline | neutral |
| Desconto | yes — `estorno` | value shown, confirm | neutral |
| Baixa por perda | yes — `estorno` | reason required, confirm | amber |
| Ajustar valor | no (audited) | dialog with `de → para` diff | neutral |
| Cancelar fatura | no | modal with entry summary | **danger** |
| Estorno | no (it is the correction) | inline, reason required | neutral |

`danger` is reserved for cancellation — the same rule the lifecycle module adopted after defect 10 of its 4-bis table.

---

## 5. Verification Plan

### 5.1 Task F0 — historic conference (the acceptance gate)

There is **no spreadsheet to reconcile against**. F0 is therefore the requester's conference, not an automated recomputation.

**Deliverable:** `docs/operations/faturamento-carga-historica.md` (+ `.csv` with the 582 rows).

**Status:** v1 generated 2026-10-03 — **awaiting the requester's approval**. Numbers: 582 competências, 18 séries, 69 com uso real, 513 no piso, R$ 103.084,09 de excedente calculado, 15 séries sem regra cadastrada. The anomalies table in the artefact is the decision list.

| Step | Content |
|---|---|
| 1 | Per client × competência: licence usage, OS usage, instances aggregated, floor, unit, base, excedente, **computed invoice**, **computed due date** |
| 2 | Flag competências **without usage data** (invoice = the floor) |
| 3 | Flag competências where the excedente is computable (licences 2026-06 → 2026-09) |
| 4 | Flag anomalies: `billing_floor = 0`, `IGMP` index typo, `contract_months` NULL, multiple instances, zero-usage clients |
| 5 | **The requester reviews and marks what is wrong.** The artefact carries an approver, a date and a version. Corrections are applied to the source, not to the markdown |
| 6 | The engine **refuses to issue historic competências** until an approved F0 version exists |

### 5.2 Guided fixture

A disposable company (`ZZ Teste Faturamento`), created and destroyed inside the test, as done on 2026-10-02 with client 46.

**The fixture must reproduce the dirty data**, because that is where the previous module's 13 defects came from:

| Condition to replicate | Source |
|---|---|
| Two series with different billing statuses | `nao_bilhetavel` (7 series) |
| One series `auto_renew=false` with `billing_end` NULL | combination absent from real data |
| One series with `contract_months` NULL | 12 of 18 series |
| `billing_floor` migrated from 0 to NULL | 8 series |
| A client with zero usage | client 29 |
| A client with two instances in one month | clients 3 and 22 |
| A payment dated after the last recurrence (prepaid ahead) | lifecycle defect 2 |
| A series with `due_day = 31` | clamp trap |
| A series with two modules, different units, same floor | the requester's example (§1.2) |
| A client with a billable and a non-billable series | mixture |

### 5.3 Scenario matrix

| # | Scenario | Proves |
|---|---|---|
| 1 | Licence with floor, usage below floor | invoice = unit × floor |
| 2 | Licence with floor, usage above floor | invoice = unit × usage |
| 3 | **Two modules, different units, same floor, usage above floor** | 10.250 + 4.100 = 14.350 (defect 7) |
| 4 | Licence without floor | invoice = unit × usage |
| 5 | OS with floor | `unit × max(piso, os)` |
| 6 | OS without floor, `os = 0` | **no invoice** |
| 7 | Fixed value (`fixo` / travado) | the rule amount, usage ignored |
| 8 | Standalone eventual | single invoice, own state |
| 9 | Eventual in 3 instalments | schedule, remainder in the last, `installment_no` 1-based |
| 10 | Full payment | `quitada`, delay from `happened_at` |
| 11 | Partial payment, single entry | `parcial`, correct balance |
| 12 | Partial payment, multiple entries | balance across entries |
| 13 | Discount distributed across N invoices | proportional, capped, remainder redistributed |
| 14 | 100% discount on one invoice | `quitada`, `discounted = amount` |
| 15 | Write-off (loss) on one invoice | `written_off`, distinct from discount |
| 16 | Reversal of a wrong settlement | `estorno`, balance restored, attributed to the target's kind |
| 17 | Reversal of a discount | `paid` unchanged, `discounted` reduced |
| 18 | Manual amount adjustment | audit fields; blocked below settled total |
| 19 | Invoice cancellation + substitute | competência freed, `replaces_invoice_id` set |
| 20 | **Month-to-month contract** (`auto_renew=true`, contract expired) | keeps issuing (Center Kennedy) |
| 21 | **`auto_renew=false` with `contract_months`** | **stops** after N months (lifecycle defect 1) |
| 22 | **`auto_renew=false`, `contract_months` NULL** | continues while `ativa`; vencida alert fires |
| 23 | Closed series | no invoice |
| 24 | `nao_bilhetavel` series | no invoice, no pendency |
| 25 | Suspended mid-competência | no invoice for that competência |
| 26 | Series starting mid-month | full month (§1.14) |
| 27 | Late usage after issue | complement invoice, original unchanged |
| 28 | Reajuste applied from a billed competência | existing invoice unchanged, next uses the new rule |
| 29 | Open competência visible | banner shows, close action available |
| 30 | Batch settlement by range | N invoices, dates per invoice |
| 31 | **Idempotent close** — run `close_competencia` twice | second run issues nothing |
| 32 | **Concurrent close** — two runs in parallel | one issues, the other no-ops, no duplicate |
| 33 | **Negative: wrong role** calls settle/adjust/cancel | `42501`, no row written |
| 34 | **Negative: empty reason** on estorno/baixa/cancel | CHECK violation, no row written |
| 35 | **Negative: DELETE on `invoice_entries`** | denied |
| 36 | **Negative: estorno of an estorno** | rejected by the trigger |
| 37 | **Negative: estorno across invoices** | rejected by the trigger |
| 38 | **Negative: over-reversal** | rejected by the trigger |
| 39 | Client with two instances in one month | usage aggregated, not halved |

### 5.4 Date grid (mandatory)

A SQL-driven grid, independent of the UI:

```
days 28, 29, 30, 31  ×  12 months  ×  {leap year 2024, non-leap 2025}  ×  year boundary
```

Asserting the exact `due_date` for recurrence and for eventual instalments, including a series anchored on the 31st across a year (31 → 28/29/30 → 31). This is the `22008` trap; the historic load crosses Feb/2024 (leap) and every short month.

### 5.5 Observability

- `billing_run_log` written per series per close run (§2.6)
- A read-only integrity query, run daily, asserting zero rows for:
  - billable series with no invoice in a closed competência
  - `balance < 0`
  - duplicate or missing invoice numbers
  - `invoice_entries.amount` exceeding the invoice amount
  - an `estorno` whose target is on another invoice
- Monthly report: `Σ invoices` vs `Σ base + excedente` per client

### 5.6 Parity test

The new engine and `_financeiro_series_month` must agree on `mrr_real` for 2026-06 → 2026-09, **except** where defect 7 applies (multi-module series, none today). Run before Phase 3 ships. Any other divergence is a bug in the new engine.

### 5.7 Regression: lifecycle

The client 21 baselines measured on 2026-10-03 are the fixture: 61 months, 48 payments, `contract_months = 36`, `contract_renewal = 2025-10-27`, MRR R$ 2.299,95 in 2026-09 and 2026-10. Close/reopen must preserve them after Phase 3.

---

## 6. Implementation Phases

> **Order matters.** The first draft of this SDD retired the old tables in Phase 1, before the new engine existed and while four live RPCs still read them. In a production-only environment that would have broken the cockpit for admin/manager/finance on deploy. The retire is now the **last** phase, gated on "no consumer reads the old tables".

Each phase ends with:

```bash
npm run build
supabase db push --include-all          # if the phase has migrations
supabase functions deploy <name>        # if the phase has functions
node scripts/fix-supabase-urls.js       # after any function deploy
# verify on https://donccx-donccx.vercel.app
```

**Before any phase that drops or alters a column:** export a snapshot of the affected tables.

### Phase 1 — Schema and derivation

**Status:** Not started

**Rationale:** A fundação. O dado atual é descartável, mas as tabelas antigas **continuam vivas** nesta fase — o cockpit e as RPCs de ciclo de vida seguem funcionando enquanto o modelo novo é construído ao lado.

**Scope:**
- `series_rules`, `series_eventuals`, `invoices`, `invoice_entries`, `billing_run_log`
- `contract_series`: `first_competencia`, `first_due_date`; `billing_floor` stays NOT NULL until the engine is replaced
- Invoice numbering, constraints, indexes, RLS
- Derived views/RPCs, `refresh_client_delay_days` + its trigger
- Snapshot of `contract_charges` and `billing_payments` before any change

#### Checklist

- [ ] **Snapshot:** export `contract_charges` and `billing_payments` to a versioned file
- [ ] **Migration `billing_schema`:** five tables, all CHECKs, all indexes, RLS reading `feature_flags.allowed_roles`
- [ ] **Migration `billing_derive`:** `invoice_balance` view, `get_invoice_state()`, `get_financeiro_pendencias` rewritten per invoice, `refresh_client_delay_days` + trigger + one-off recompute
- [ ] **Numbering:** `invoice_number_seq` + `generate_invoice_number()`
- [ ] **RPCs:** `issue_invoice`, `settle_invoice`, `discount_invoice`, `write_off_invoice`, `reverse_entry`, `adjust_invoice`, `cancel_invoice`
- [ ] **Service role guard:** `auth.role() = 'service_role'` accepted; GRANTs restricted
- [ ] **Verification:** SQL proving all 5 combinations (licence/OS/fixed × with/without floor) and the two-module case (scenario 3) against known numbers
- [ ] **Verification:** the date grid (§5.4) passes
- [ ] **Verification:** `refresh_client_delay_days` produces the worst delay for a synthetic multi-invoice client
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 2 — Issuing engine

**Status:** Not started

**Rationale:** Fecha competência e emite documento. Roda **em paralelo** ao engine antigo — nada é desligado ainda. Depende do F0 aprovado para competências históricas.

**Scope:**
- `close_competencia` edge function: preview / scoped / real modes
- Idempotency (partial unique index + `ON CONFLICT DO NOTHING`) and `pg_advisory_xact_lock`
- Completeness gate on usage
- `billing_run_log`
- Recurrence stop rule (§3.4)
- Eventual and complement generation

#### Checklist

- [ ] **Issuer:** `close_competencia(competencia, mode)` with `preview` / `real`
- [ ] **Preview:** persists nothing; lists emitted and skipped with reasons
- [ ] **Idempotency:** second run issues nothing
- [ ] **Concurrency:** two parallel runs produce no duplicate
- [ ] **Stop rule:** all five combinations of §3.4 tested
- [ ] **Completeness gate:** blocks on pending usage, allows explicit override
- [ ] **Skip rules:** `amount = 0`, `nao_bilhetavel`, outside window
- [ ] **Parity:** §5.6 passes for 2026-06 → 2026-09
- [ ] **F0 gate:** historic competências refuse to issue without an approved F0 version
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 3 — Lifecycle migration

**Status:** Not started

**Rationale:** As RPCs de ciclo de vida foram verificadas em produção em 2026-10-03 e compartilham as tabelas com este rebuild. Migrá-las é pré-requisito para aposentar `contract_charges` — e é aqui que o risco de regressão mora.

**Scope:**
- `encerrar_series`, `reabrir_series`, `reativar_series`, `set_nao_cobrar`, `cobrar_mais_meses` onto `series_rules` + `invoices`
- New semantics: closing ends the rule window and cancels unissued projections; reopening reopens the window
- `ContractLifecycleDialogs.jsx`, `SeriesVencidasAlerta.jsx`, `useContractCharges.js`
- `ensure_series_horizon` retired; the cron and the "Repor horizonte" button repurposed or removed

#### Checklist

- [ ] **RPCs:** five functions rewritten with tests for each
- [ ] **Closing semantics:** documented in the lifecycle SDD and cross-linked
- [ ] **Reopen:** restores the rule window; issues nothing retroactively
- [ ] **Regression:** client 21 baselines (§5.7) preserved — 61 months, 48 payments, MRR 2.299,95
- [ ] **Cron:** `contract-series-sync` no longer writes payments; schedule reviewed
- [ ] **Lifecycle SDD:** supersession/pointer note added
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 4 — Cockpit rewrite

**Status:** Not started

**Rationale:** Só faz sentido depois que existe fatura para mostrar. Reescreve o render em vez de remendar os defeitos 1–6.

**Scope:**
- Client panel, invoice rows, balances, states
- Close competência (§4.2)
- Settlement window (§4.3) and Histórico view (§4.4)
- Discount, adjust, cancel dialogs
- Open competência and open invoices (§4.8)
- State badge, UI states, responsive

#### Checklist

- [ ] **Panel:** invoice rows replace the series rows; the `billing_start` line is gone (defect 1)
- [ ] **Three states:** every client with an active series appears; a client with no invoice shows `sem fatura` + motivo (§3.9); only clients with no series are absent
- [ ] **Motivo:** the five reasons render with the correct label and colour; `sem_regra` is amber (action), the rest slate (consequence)
- [ ] **Projection:** for an open competência, a `sem_fatura` row shows the projected amount
- [ ] **Regression test:** the 15 clients without rules appear as `sem_regra`, not absent
- [ ] **Eventuais:** own row, own state (defect 2)
- [ ] **Overdue:** derived from `due_date` and balance, with amount (defect 3)
- [ ] **Settlement:** real `happened_at` per invoice, no fabricated date (defect 4)
- [ ] **Close:** preview shows emitted and skipped with reasons, before persisting
- [ ] **Histórico:** stable ordinal, de/até filter, running total
- [ ] **Discount:** both modes, proportional with cap
- [ ] **Cancel:** danger style, entry summary, substitute offered
- [ ] **Badge:** single `InvoiceStateBadge` over `ui/Badge.jsx`, no ad-hoc colours
- [ ] **States:** empty by reason, loading, error with retry, read-only
- [ ] **Responsive:** drawer ≥md, full sheet <md, no double-mounted panel
- [ ] **Consumers:** `BillingSchedule.jsx` and `ClientSubDados.jsx` read the new model
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 4)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 5 — Historic load

**Status:** Not started

**Rationale:** É o que destrava o corte de nov/2026. O Financeiro precisa lançar os 18 contratos sem SQL, e conferir contra o F0.

**Scope:**
- Wizard: client → plan → preview → confirm → settlement
- F0 output consumed as defaults
- Chronological numbering per client

#### Checklist

- [ ] **Wizard:** five steps per §4.10, route registered in `App.jsx`
- [ ] **Preview:** shows amounts and due dates before persisting
- [ ] **Numbering:** chronological per client
- [ ] **Batch settlement:** opens over the issued invoices, dates per invoice
- [ ] **End-to-end:** load all 18 clients through the UI, no SQL
- [ ] **F0:** the loaded values match the approved conference
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 5)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 6 — Operation

**Status:** Not started

**Rationale:** Fecha a operação do dia a dia. Pode entrar depois do corte, desde que a Fase 5 esteja completa.

**Scope:**
- Month selector from invoices (defect 5)
- Sync banner corrected to report partial synchronisation
- Reajuste alert (§4.9)
- Payment methods and external reference surfaced

#### Checklist

- [ ] **Months:** from `invoices`, up to the current month, no future
- [ ] **Banner:** partial sync reports the failure count, not "não sincronizou"
- [ ] **Reajuste alert:** past-due and 30-day anniversaries; applying appends a `series_rules` period
- [ ] **Methods:** the six options + `external_ref` on payment entries
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 6)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase 7 — Retire

**Status:** Not started

**Rationale:** A última fase, por decisão explícita. Nada é dropado enquanto qualquer consumidor ainda ler as tabelas antigas. O gate é verificável: uma consulta que falha se algum arquivo do `src/` ou alguma função viva ainda referenciar as tabelas.

**Scope:**
- Drop `billing_payments`, `billing_exceptions`, `billing_os_tiers` (decision pending), `billing_suspended_until`
- Remove the `contract_charges` charge semantics
- Delete `useBillingPayments.js`, `useBillingExceptions.js`, `ExcecaoModal.jsx`

#### Checklist

- [ ] **Gate:** zero references to the old tables in `src/` and in live `pg_proc`
- [ ] **Gate:** the cockpit, the export, the pendencies and the lifecycle RPCs all read the new model
- [ ] **Snapshot:** a final export of the old tables is versioned before the drops
- [ ] **Migration `billing_retire`:** drops and column removal
- [ ] **Cleanup:** dead hooks and components deleted
- [ ] **Rollback documented:** the restore path from the snapshot
- [ ] **Build + deploy:** per the header block

#### Implementation Log (Phase 7)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 7. Current Checkpoint

### Production state

- Nothing from this SDD is implemented. Phase 1 not started.
- The current module is live and **incorrect in the ways listed in section 0**. No stakeholder should rely on its adimplência numbers.
- Defect 7 (multi-module under-billing) is **latent** — it will produce a wrong invoice the day the first module series is created.
- Three series have charges (18, 21, 29). 134 charges, 82 payments. All disposable.
- Go-live target 2026-11-01. Phases 1–5 are the critical path; 6 may follow the cut; 7 closes the rebuild.

### Architectural decisions

| Decision | Rationale |
|---|---|
| Regra e fatura em tabelas separadas | `contract_charges` conflating plan and document produced the horizon tail, the truncating save and the synthetic key |
| Fatura nasce ao fechar competência | Não se materializa futuro. O horizonte deixa de existir como dado |
| Pagamento é valor, não status | **Requisito validado:** o cliente paga parte do eventual e parte do MRR. Um status por competência não representa isso |
| Estado da fatura é derivado | Evita a divergência entre estado gravado e soma real dos lançamentos |
| Lançamentos imutáveis; correção é `estorno` | Auditoria honesta: um erro vira uma linha, não um UPDATE |
| Reversão atribuída ao tipo do alvo | Estornar um desconto não pode inflar o "recebido" |
| **Sem crédito do cliente** | Não existe no processo. Valor devido diferente do faturado se resolve com **ajuste**, não com pagamento a maior |
| **Cancelamento existe, com auditoria** | Erro de emissão acontece; o conserto precisa ficar registrado, e a competência precisa poder ser reemitida |
| **`baixa` separada de `desconto`** | Perda (incobrável) e dedução negociada têm efeitos contábeis distintos |
| **Desconto proporcional com teto** | Distribuição igual estoura faturas pequenas |
| **Cada série cobra por licença sobre o uso compartilhado** | O uso é do cliente; cada módulo tem seu preço. A guarda `kind='original'` do engine vivo subfatura (defeito 7) |
| **Piso por série, pré-preenchido** | Normalmente iguais, eventualmente diferentes. O form evita o redigito |
| **Modo travado mantido** | Regra validada em 2026-09-11; o rebuild quase o extinguiu sem decidir |
| `clients.delay_days` = pior atraso, com valor | O trigger atual copia o mês mais recente; afeta dashboard, health score, scoring e Gravity. Dias sozinhos enganam |
| Vencimento ancorado, sem regra no código | Dois layouts em uso; impor um quebraria o outro |
| Sem meses futuros no seletor | Mês sem uso apurado faz `mrr_real` colapsar no piso |
| Passado visível | O que o tornava artificial era não ter fatura; com o P9 passa a ter fatura e baixa |
| Fatura de valor zero não é emitida | Um documento de R$ 0,00 é ruído |
| Reajuste manual, sistema alerta | Nenhuma série tem percentual; automatizar exigiria fonte de índice que não existe |
| **Retire por último** | Quatro funções vivas e oito arquivos leem as tabelas antigas. Aposentar antes do substituto quebra produção |
| **Permissões pelas flags** | Data-driven; `financial_data` e `financeiro_cockpit_write` decidem, sem lista hardcoded |
| Sem backfill de `billing_payments` | Dado descartável; o histórico entra pelo wizard com valor e data reais |
| **F0 é conferência do solicitante** | Não há planilha para conciliar; a única fonte do "certo" é quem opera |
| **Três estados no cockpit, nunca ausência silenciosa** | Série que some sem aviso é o defeito (d) do lifecycle SDD. "Esqueci de lançar" e "decidi não cobrar" não podem ser a mesma linha. Âmbar para o que exige ação, slate para consequência |
| **Fatura se corrige em quatro momentos** | O barato é o preview do wizard; o caro é estorno + ajuste + baixa. Para lote errado, cancelar e reemitir é melhor que ajustar fatura a fatura |

---

## 8. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always `import { Icons } from '../lib/icons'` then `<Icons.Name size={16} />`. Add new icons at the top (import) and alphabetically in the `Icons` object.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is re-enabled automatically — disable it manually for functions that manage their own auth. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`, pushed to `origin main`.
- **No local Supabase:** migrations go straight to production with `supabase db push --include-all`. Test on `donccx-donccx.vercel.app`.
- **`clientId` only exists inside `handleSubmit`** in `ClientFormContent.jsx`. Outside it, the client id is `client?.id`. Using `clientId` in the component body is a runtime `ReferenceError` the build does not catch.
- **Tailwind colour ties resolve by emission order, not attribute order.** `donc` comes before `text` in `tailwind.config.js`, so `className="text-donc-red"` loses to a `variant="secondary"`'s `text-text-primary`. Use `!text-donc-red`.
- **`due_date` clamp is mandatory.** A direct cast with `due_day = 30` in February throws `22008`.
- **`ref_month` is text `YYYY-MM`.** Parse via `|| '-01'` before casting to date.
- **`jsonb` usage fields are nullable.** `profissionais_versao` may be NULL, not an empty array.
- **Feature flags:** `cockpit_financeiro` gates the page, `financeiro_cockpit_write` gates writes, `financial_data` gates read of financial data. Register new keys in `SettingsFeatureFlags.jsx`.
- **`pg_depend` does not track SQL function bodies.** Dropping a table that a `LANGUAGE sql` function reads succeeds silently; the error only appears at runtime (`42P01`). Never trust "the drop worked" as proof that nothing reads the table.
- **Existing workspace may be dirty.** Do not revert unrelated user changes.

### Rebuild-specific gotchas

- **The engine reads six things the naive formula misses:** instance aggregation, `pending=false`, `donc_snapshot->>'totalOs'` fallback, per-series floor, no `kind` guard, `unit_eff`. See §3.1.
- **`saveCharges` deletes and re-inserts recurrence rows.** In the new model this is harmless because payments reference invoices by `id` and invoices are not re-created by editing the contract. Do not reintroduce a charge-id-keyed payment without checking this.
- **`billing_floor` must not become nullable while `_financeiro_series_month` is still live.** `billing_floor > 0` becomes NULL→false and `greatest(uso − NULL, 0)` becomes 0, silently changing cockpit numbers. The column change ships in the same push that replaces the engine.
- **The invoice number is global, not per client.** The requester's "1..25" is an ordinal in the Histórico view, not an invoice number.
- **`invoice_entries` has no UPDATE and no DELETE.** Any code path that "fixes" an entry is wrong by construction; the correction is an `estorno`.
- **A service-role call has no `auth.uid()`.** A role guard written as `get_user_role() NOT IN (...)` rejects the issuing engine. Accept `auth.role() = 'service_role'` explicitly.

---

## 9. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read **Section 1 (Premissas)** before writing any code. These are product decisions, not implementation choices.
3. Identify the **active phase** in section 6. Do not skip ahead — the order is load-bearing (the retire is last on purpose).
4. Implement item by item. Mark `[x]` when done and verified.
5. Run `npm run build` before marking any phase complete, plus the phase's deploy steps.
6. Fill the **Implementation Log** for the phase, update **Section 7 (Current Checkpoint)**, and update **Section 0** if production changed.
7. Before writing a migration, read `supabase/migrations/20260916120000_financeiro_write_roles_rls.sql` and `20260907000001_contract_series.sql` for the established patterns.
8. Never issue an invoice for the historic load before task F0 is reviewed and approved by the requester (§5.1).
9. Section 3 is written from the live function definition. If you change a formula, re-read `pg_get_functiondef('_financeiro_series_month')` first and re-run the parity test (§5.6).

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
