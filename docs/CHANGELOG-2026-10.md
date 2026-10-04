# Changelog — 2026-10

## 2026-10-04

### Financeiro — Fase 1 do rebuild: schema e derivação

A fundação do novo módulo de faturamento entrou em produção **ao lado** do modelo antigo. Nada foi dropado e nada no cockpit vivo mudou: `contract_charges` (134 linhas) e `billing_payments` (82) continuam intactos e seguem sendo o que a tela lê. O retire é a Fase 7, com gate de zero referências — quatro funções vivas (`_financeiro_series_month`, `get_financeiro_detalhe`, `get_financeiro_export`, `get_series_vencidas`) e oito arquivos do frontend ainda leem as antigas.

O modelo novo separa **regra** de **fatura**: `series_rules` é o plano, `invoices` é o documento emitido e imutável, `invoice_entries` é o livro por valor. É o que permite pagamento parcial — o requisito que o modelo antigo (um status por competência) não representa.

Quatro migrations, aplicadas pelo MCP e renomeadas para casar com o histórico remoto:

| Migration | O que criou |
|---|---|
| `20261004225041_billing_schema` | 5 tabelas, 20 índices, 7 policies, CHECKs de domínio, `ON DELETE RESTRICT` no cliente e na série |
| `20261004225219_billing_derive` | view `invoice_balance` (saldo, estado, atraso derivados), `refresh_client_delay_days` + 2 triggers |
| `20261004225421_billing_rpcs` | 9 funções de escrita, com guarda compartilhada e validação de estorno |
| `20261004225607_billing_due_date_helpers` | `competencia_index` e `billing_due_date` |

**Snapshot versionado** das tabelas que serão aposentadas: `supabase/snapshots/20261004_pre_billing_rebuild.sql` (216 linhas, restaurável por psql), gerado por `scripts/snapshot-billing.mjs`.

**Verificação:** 51 asserções de RPC + 15 de grade de datas, todas verdes em transação com rollback. Cobre pagamento parcial, overpay recusado, método obrigatório, estorno atribuído ao tipo do alvo (estornar um desconto não infla o recebido), estorno de estorno / entre faturas / over-reversal bloqueados, desconto separado de baixa por perda, ajuste auditado e bloqueado abaixo do liquidado, cancelamento com reemissão, emissão idempotente e **pior atraso** — corrigindo o defeito 6, em que o trigger antigo copiava o mês mais recente e quem pagava o mês novo sumia da priorização.

Produção conferida depois: tabelas novas vazias, antigas intactas, sem resíduo de fixture, nenhum `delay_days` não-zero.

**Três desvios do SDD, registrados na seção da fase:** `get_financeiro_pendencias` migra na Fase 4 e não na 1 (é consumidor do cockpit, e a página viva lê campos antigos); o recompute de `delay_days` é escopado a quem tem fatura (recomputar todos agora zeraria o atraso de todo mundo, e a coluna alimenta dashboard, health score, scoring e Gravity); `assert_invoice_open` e `discount_batch` entraram na lista de RPCs — a distribuição proporcional com teto pertence ao banco, não à UI.

### Financeiro — F0 aprovado: conferência da carga histórica

`docs/operations/faturamento-carga-historica.md` + `.csv`: 582 competências de 2021-03 a 2026-09, 18 séries, com uso, piso, unit, valor calculado e vencimento. É o gate da Fase 2 — o motor não emite competência histórica sem esta conferência aprovada, porque não há planilha para conciliar.

Números: 69 competências com uso real (12%), 513 no piso (88%), **R$ 3.676.252,67** de valor calculado, dos quais **R$ 103.084,09 de excedente** nunca faturado. Os maiores são Lojas Todimo (R$ 33.001,07 — 17.099 OS a R$ 1,93, piso 0), Sipolatti (R$ 27.412,50) e Multiloja (R$ 13.396,50). Anomalias levantadas: 5 séries com índice `IGMP` (typo de `IGPM`), 15 com `contract_months` NULL, 15 sem regra cadastrada, 2 clientes com duas instâncias por mês.

O gerador é `scripts/f0-carga-historica.mjs`, versionado para ser reproduzível. Dois bugs meus apareceram no caminho e estão corrigidos: o script testava `billing_type = 'os'` mas o banco usa `por_os` (o Todimo saiu com R$ 1.152 em vez de R$ 33.001), e a coluna "com uso" contava meses com qualquer snapshot em vez de meses com dado relevante para a série.

### Docs — SDD do rebuild, revisão adversarial e ADR

O rebuild foi especificado em `docs/sdd/financeiro-faturamento-sdd.md`, depois **revisado por seis especialistas em paralelo** (Postgres, financeiro, arquitetura, QA, requisitos e frontend). A revisão produziu 45 correções, das quais as mais graves eram convergentes: três revisores independentes acharam que a Fase 1 aposentava tabelas que funções vivas ainda leem, num ambiente production-only sem rollback. O retire virou a última fase.

O achado mais concreto foi factual: a §3.1 reescrevia de memória a fórmula de uso do motor, e errava em seis pontos — o pior sendo não agregar as instâncias, o que faria a fatura de dois clientes sair pela metade.

Decisões de negócio fechadas na revisão: sem crédito do cliente (o cenário de overpayment era invenção do agente), cancelamento com auditoria, baixa por perda separada de desconto, desconto proporcional com teto, modo travado mantido, e **cada série cobra `unit × max(piso, uso)` sobre o uso compartilhado** — com o exemplo do solicitante (dois módulos, 205 licenças: 10.250 + 4.100 = 14.350) definindo a regra.

`docs/decisions/001-rebuild-faturamento.md` registra a alternativa de patch e seu custo, com a ressalva de que a alegação "sete defeitos, uma causa" era exagerada: a justificativa é o pagamento parcial, e os outros defeitos saem por consequência.

Novo documento de domínio: `docs/modules/financeiro.md`.
