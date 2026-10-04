---
status: vivo
owner: financeiro
verified: 2026-10-04
expires: 2027-01-04
supersedes: []
---

# Module — Financeiro (Faturamento e Contas a Receber)

> **Em rebuild.** A Fase 1 (schema) está em produção desde 2026-10-04: o modelo novo existe ao lado do antigo e está vazio. O cockpit que o Financeiro usa hoje ainda lê o modelo antigo. A spec canônica do rebuild é `docs/sdd/financeiro-faturamento-sdd.md` — este documento é o mapa do domínio, não a especificação.

## Purpose

Transforma o plano comercial de um cliente em dinheiro a receber: emite faturas por competência a partir da regra do contrato e do uso real, registra o que foi pago (inclusive parcial), descontado ou dado como perda, e apura quem está em atraso.

Existe porque o controle de faturamento sai de uma planilha externa para o Hub em nov/2026, e porque o modelo antigo não representa pagamento parcial — um cliente pode pagar parte de um eventual e parte do MRR, ou pagar um e não o outro.

## Responsibilities

- **Derivar o valor da fatura** de cada competência: `unit × greatest(piso, uso)`, onde o uso é do cliente e compartilhado entre as séries. Cada módulo contratado cobra por licença ao seu preço; o piso é por série.
- **Emitir a fatura** quando a competência fecha. Fatura emitida é imutável, com número interno, vencimento ancorado na série e valor congelado.
- **Registrar lançamentos por valor**: pagamento (parcial permitido), desconto negociado, baixa por perda e estorno. Não existe crédito do cliente — valor divergente se corrige ajustando a fatura.
- **Derivar o estado** de cada fatura (aberta, parcial, quitada, vencida, cancelada) a partir do saldo, nunca gravá-lo.
- **Apurar o atraso do cliente** como o pior atraso entre as faturas com saldo, e manter `clients.delay_days` — que alimenta dashboard, health score, scoring e Gravity.
- **Corrigir** por ajuste auditado, cancelamento com reemissão, ou estorno.

## Key Components

### Modelo novo (Fase 1, 2026-10-04 — vazio)

| Objeto | Papel |
|---|---|
| `series_rules` | O plano de recorrência: faixas de `month_index` com valor ou percentual |
| `series_eventuals` | Eventuais previstos no contrato (ex.: implantação parcelada) |
| `invoices` | O documento emitido: número, competência, valor, vencimento, auditoria de ajuste e cancelamento |
| `invoice_entries` | O livro: `pagamento` / `desconto` / `baixa` / `estorno`, por valor, imutável |
| `billing_run_log` | Observabilidade da emissão: o que foi emitido, pulado e por quê |
| `invoice_balance` (view) | Saldo, estado, atraso e valor vencido, derivados |
| `issue_invoice`, `settle_invoice`, `discount_invoice`, `discount_batch`, `write_off_invoice`, `reverse_entry`, `adjust_invoice`, `cancel_invoice` | As RPCs de escrita — as tabelas não aceitam escrita direta |
| `invoice_state`, `refresh_client_delay_days`, `competencia_index`, `billing_due_date`, `generate_invoice_number` | Derivação e numeração |
| `assert_invoice_open` | Guarda compartilhada: fatura existe, não está cancelada, valor cabe no saldo |

### Modelo antigo (em produção — aposentadoria na Fase 7)

| Objeto | Papel |
|---|---|
| `contract_charges` | Conflaciona o plano e o documento; 134 linhas em 3 séries (18, 21, 29) |
| `billing_payments` | Status por `(cliente, série, competência)`; 82 linhas. Não representa parcial |
| `billing_exceptions`, `billing_os_tiers` | Concessão e faixas de OS; 0 linhas, nunca operadas |
| `_financeiro_series_month`, `get_financeiro_cockpit`, `get_financeiro_detalhe`, `get_financeiro_export`, `get_financeiro_pendencias` | O motor e as RPCs do cockpit atual |
| `ensure_series_horizon`, `encerrar_series`, `reabrir_series`, `cobrar_mais_meses`, `set_nao_cobrar` | Ciclo de vida da série (ver `docs/sdd/contract-series-lifecycle-sdd.md`) |

### Frontend

| Arquivo | Estado |
|---|---|
| `src/pages/FinanceiroCockpitPage.jsx` | **Em produção** — lê o modelo antigo. Reescreve na Fase 4 |
| `src/components/financeiro/PaymentToggle.jsx` | **Em produção** — baixa por competência, não por fatura. Reescreve na Fase 4 |
| `src/hooks/useFinanceiroCockpit.js`, `src/hooks/useBillingPayments.js` | Idem |
| `src/hooks/useContractCharges.js` | Escreve `contract_charges`; migra na Fase 3 |

## Data Interaction

### Tabelas

| Tabela | Escrita | Leitura |
|---|---|---|
| `series_rules`, `series_eventuals` | direta, com RLS (o form do contrato edita) | `financial_data` |
| `invoices`, `invoice_entries` | **só por RPC** — sem policy de INSERT/UPDATE/DELETE | `financial_data` |
| `invoice_balance` (view) | — (derivada) | `financial_data`, via `security_invoker` — a view herda a RLS de quem consulta |
| `billing_run_log` | service role (o motor de emissão) | `financial_data` |
| `clients.delay_days` | `refresh_client_delay_days`, disparado por trigger em `invoices` e `invoice_entries` | dashboard, health score, scoring, Gravity |

### RLS e permissões

As permissões são **data-driven pelas flags**, não por lista fixa no código:

| Operação | Flag | Fallback se a flag sumir |
|---|---|---|
| Ler faturas e lançamentos | `financial_data` | admin, manager, finance |
| Emitir, ajustar, cancelar, descontar, dar baixa | `financeiro_cockpit_write` | admin, manager, finance |

`service_role` é aceito explicitamente em `can_write_billing()`: o motor de emissão é Edge Function, não tem `auth.uid()`, e um guard só de papel o rejeitaria.

### Relação com `contract_series`

`contract_series` é o **plano comercial** (preço, piso, prazo, renovação, reajuste). `series_rules` é a **recorrência desse plano** (faixas de preço por mês de contrato). `invoices` é o que foi **emitido** a partir disso. As âncoras `first_competencia` e `first_due_date` (adicionadas na Fase 1) definem o vencimento de cada competência; o trigger `trg_set_series_first_comp` as preenche a partir de `billing_start` quando o chamador não informa.

### Uso

`client_usage` guarda o uso por `(cliente, instância, competência)`. **Um cliente pode ter mais de uma instância por mês** — o uso é agregado por cliente antes de virar fatura. Dado de licença existe só de jun/2026 em diante; de OS, de dez/2025. Sem dado de uso, a fatura sai no piso.

## UI Behavior

Hoje: `/financeiro-cockpit` (flag `cockpit_financeiro`), tabela de clientes que expande num painel com composição de MRR, séries do mês e um painel de pendências de adimplência.

No rebuild, o painel passa a ser orientado a fatura e o cockpit mostra **três estados** — cliente com fatura, cliente com série ativa mas sem fatura (com o motivo: `sem_regra`, `nao_bilhetavel`, `fora_janela`, `valor_zero`, `nao_fechada`) e ausente apenas quando não há série. Uma série que some sem aviso é o defeito que o SDD do ciclo de vida registrou, e o cockpit novo não o repete.

## Dependencies

- **`clients`** — dono das faturas e do `delay_days`. Apagar um cliente com fatura é bloqueado de propósito (`ON DELETE RESTRICT`).
- **`contract_series`** — o plano que gera as faturas.
- **`client_usage`** — o uso que compõe o excedente.
- **`feature_flags`** — `financial_data`, `financeiro_cockpit_write`, `cockpit_financeiro`.
- **Ciclo de vida da série** (`docs/sdd/contract-series-lifecycle-sdd.md`) — encerrar, reabrir, suspender e estender compartilham as tabelas e migram na Fase 3.
- **Sync** (`docs/system/sync-pipeline.md`) — o uso chega pelo `monthly-sync`; a emissão depende de o sync da competência estar completo.

## References

- `docs/sdd/financeiro-faturamento-sdd.md` — spec canônica do rebuild (fases, premissas, verificação)
- `docs/decisions/001-rebuild-faturamento.md` — por que rebuild e não patch
- `docs/operations/faturamento-carga-historica.md` — F0, a conferência da carga histórica
- `docs/sdd/financeiro-cockpit-sdd.md` — canônico para o extrato de uso/MRR (adimplência superada)
- `docs/sdd/contract-series-lifecycle-sdd.md` — mutação do ciclo de vida da série
