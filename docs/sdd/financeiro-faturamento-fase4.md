---
status: vivo
owner: financeiro
verified: 2026-10-05
expires: 2027-01-04
supersedes: []
---

# Fase 4 — Cockpit de faturamento

> Registro da implementação da Fase 4 do rebuild de faturamento. A especificação
> canônica é `docs/sdd/financeiro-faturamento-sdd.md`; o mapa do domínio é
> `docs/modules/financeiro.md`. Este documento diz o que foi construído, por quê,
> quais regras valem em produção e como operar e testar.

## 1. Escopo e estado

A Fase 4 entrega a tela nova de faturamento, `/financeiro-faturamento`, atrás da
flag `cockpit_faturamento`. A tela antiga, `/financeiro-cockpit`, não mudou e
continua sendo a que o financeiro usa no dia a dia.

Estado em 2026-10-05:

- Em produção: leituras, escritas, fechamento por competência, encerramento com corte (só admin), trava de consolidação e barreira no banco.
- Flag `cockpit_faturamento`: papéis `admin` e `finance`.
- Dados de teste `[TESTE] Alfa`, `[TESTE] Beta` e `[TESTE] Gama` foram removidos em 2026-10-05 (ver seção 9).
- Pendências conhecidas na seção 10.

## 2. Regras de negócio que a tela e o banco aplicam

### 2.1 Competência consolidada

Uma competência só é lida ou alterada pelo faturamento quando o uso dela foi
consolidado. Consolidado significa: o cron de sincronização (`triggered_by = 'cron'`
na `sync_service_log`) concluiu com sucesso a sincronização do mês, depois do fim
dele. O cron roda no dia 1 do mês seguinte, então o mês corrente nunca é
consolidado enquanto está em curso.

- Sincronização manual não consolida. Ela pode trazer uso parcial.
- A regra está em `billing_competencia_consolidada(text)` (migration `20261005280000`).
- O mês corrente não aparece na tela. O seletor de competência lista só os meses
  consolidados, via `billing_competencias_consolidadas()` (migration `20261005320000`).
- Hoje a lista começa em julho de 2026, porque é quando o registro do cron começou.
  Meses anteriores não têm prova de consolidação e ficam fora. Pergunta em aberto
  na seção 10.

### 2.2 Barreira no banco

Toda leitura e escrita de fatura passa pela checagem da competência consolidada,
inclusive para admin e para chamadas diretas ao banco (migration `20261005330000`).

Funções protegidas, cada uma com o original renomeado para `<nome>_motor`:

- Leituras: `billing_cockpit_clientes`, `billing_cockpit_faturas`, `billing_cockpit_extrato`, `billing_cockpit_motivos`, `billing_cockpit_composicao`, `billing_cockpit_lancamentos`.
- Escritas: `adjust_invoice`, `cancel_invoice`, `discount_invoice`, `discount_batch`, `settle_invoice`, `write_off_invoice`, `reverse_entry`, `cancelar_eventual_grupo`.

A recusa usa o código de erro `55000` e a mensagem `competencia_nao_consolidada`.

**Não protegidas:** `encerrar_series` (pode cancelar faturas do mês corrente quando
`p_remover_mes_atual` está ligado), `cobrar_mais_meses` e `reabrir_series`. Ver seção 10.

### 2.3 Fechamento de competência

`close_competencia(p_competencia, p_mode, p_force, p_series_ids)` é o único que
calcula cobrança. Desde a migration `20261005280000` ele é um envelope:

- Modo `real` recusa competência não consolidada, com `competencia_nao_consolidada`.
- Modo `preview` (prévia) não é bloqueado, e serve para ver o que falta.
- O cálculo está em `close_competencia_motor`, sem alteração de lógica.

Resultados por série: `emitiria`, `emitida`, `ja_emitida`, `pulada`, com `reason`.
Motivos de pulo: `sem_regra`, `usage_incomplete`, `fora_janela`, `nao_bilhetavel`,
`valor_zero`. O diálogo mostra a contagem por motivo.

### 2.4 Valor da fatura

`base + excedente`:

- Base: a regra da série (`amount`), ou `percent × unit × max(piso, 1)`.
- Excedente: `max(0, uso − piso) × unit`, só para série por uso e não fixa.
- Contrato fixo mostra só o valor do mês. Contrato por licença mostra a conta.

Na tela, o bloco **Contrato e cálculo** mostra `Base do plano + Excedente = MRR real`.

### 2.5 Encerrar com corte (excepcional, só admin)

`encerrar_com_corte(p_series_id, p_motivo, p_confirmo_uso)` cobra a competência
corrente de uma série e a encerra, numa transação só (migrations `20261005290000`,
`20261005300000` e `20261005310000`).

- **Papel:** só `admin`. A checagem é no banco e na tela.
- **Mês:** só o mês corrente. Antes de chamar a função, o admin sincroniza o uso do cliente.
- **Base:** integral. Não há cobrança proporcional. Redução é desconto, pelo fluxo normal.
- **Excedente:** uso até a data da cobrança.
- **Recusas:** motivo com menos de 10 caracteres; sem confirmação de uso; série não ativa; sem snapshot de uso; linhas de uso pendentes; série sem regra; motor que não emite.
- **Ordem:** emite a competência corrente só da série, depois encerra. Se qualquer passo falha, nada é gravado.
- **Sem tela:** o corte não tem botão na interface. A função fica no banco, para o admin rodar quando for preciso.

Motivo da restrição: o corte cancela a cobrança futura do contrato, então é uma
operação de cliente, não de rotina. O financeiro pede ao admin fora do sistema.

### 2.6 Papéis

| Papel | Ver faturamento | Alterar faturas | Fechar competência | Encerrar com corte |
|---|---|---|---|---|
| admin | sim | sim | sim | sim |
| finance | sim | sim | sim | não |
| manager | não (flag) | não (flag) | não | não |
| sales | não | não | não | não |

- Flag `cockpit_faturamento` (tela): `admin`, `finance`. Configurada por `UPDATE`, sem migration, em 2026-10-05.
- Flag `financeiro_cockpit_write`: `admin`, `finance`, `manager`.
- Leitura do banco: `billing_read_roles()`, a partir de `financial_data`.
- Escrita do banco: `billing_write_roles()`, a partir de `financeiro_cockpit_write`.

## 3. Tela

Rota: `/financeiro-faturamento` (`src/App.jsx`), protegida por `CockpitRoute flagKey="cockpit_faturamento"`.

Página: `src/pages/FinanceiroCockpitV2Page.jsx`.

1. **Topo, quatro blocos:**
   - Faturado no mês, com o excedente incluído.
   - Em aberto, com faturas não quitadas de total.
   - Vencido, com clientes vencidos e maior atraso.
   - Recorrência a emitir (só quem fecha a competência vê).
2. **Filtros:** competência (só consolidadas), busca por nome, situação (todas, vencida, aberta, quitada, sem fatura), tipo (licença, OS, fixo) e "só com saldo".
3. **Lista:** uma linha por cliente, com selo de situação (vencida com dias, aberta, quitada, sem fatura ou sem regra), tipo, uso, MRR mínimo, MRR real, faturas e saldo.
4. **Painel do cliente** (`src/components/billing/ClienteDetalhe.jsx`): cabeçalho com o valor em aberto, bloco de contrato e cálculo, faturas do mês (`FaturasDoCliente.jsx`) e extrato.
5. **Exportação CSV:** a lista respeita os filtros ativos. O extrato exporta a competência do painel. Formato em `src/lib/csv.js`: separador `;`, decimal com vírgula, BOM UTF-8, celulas que começam com `= + - @` neutralizadas.
6. **Fechamento:** botão "Fechar competência" com prévia e contagem de pulos por motivo. Fecha só competência consolidada, e o banco confirma.

Estados: vazio por motivo (sem clientes, sem resultado nos filtros, sem competência consolidada), carregando, erro com nova tentativa, somente leitura com o motivo visível (`ReadOnlyBanner`).

## 4. Dados

Leituras (`supabase/migrations`):

| Função | Migration | Conteúdo |
|---|---|---|
| `billing_cockpit_clientes(p_competencia)` | `20261005150000`, `…220000`, `…250000`, `…260000`, `…270000` | Lista por cliente: estado, saldo, atraso, faturado, vencido, MRR, excedente, `tem_regra` |
| `billing_cockpit_faturas(p_client_id, p_competencia)` | `20261005150000`, `…180000` | Faturas do cliente, inclusive canceladas (no fim) |
| `billing_cockpit_motivos(p_competencia)` | `20261005150000`, `…190000`, `…200000` | Motivo e projeção por série (só quem escreve) |
| `billing_cockpit_composicao(p_invoice_id)` | `20261005210000` | Base, excedente, uso, piso e unidade, do `billing_run_log.detail` |
| `billing_cockpit_extrato(p_client_id, p_competencia)` | `20261005230000`, `…240000` | Extrato com saldo acumulado; ajuste como linha própria |
| `billing_cockpit_lancamentos(p_invoice_id)` | `20261005170000` | Lançamentos da fatura, com estorno quando reversível |
| `billing_pendencias(p_meses_atras)` | `20261005150000` | Pendências por cliente (não tem competência; não está na barreira) |

Regra de tela: nada calcula valor no frontend. Os números vêm do motor ou das leituras.

Tabelas: `contract_series`, `series_rules`, `series_eventuals`, `invoices`,
`invoice_entries`, `billing_run_log`, `client_usage`, `sync_service_log`,
`feature_flags`. Detalhes na SDD.

## 5. Escritas no frontend

Hooks em `src/hooks/useBillingWrites.js` e `src/hooks/useBillingCockpit.js`. Cada
mutação chama uma RPC e invalida as leituras afetadas. A tela não guarda regra:
envia o que a pessoa digitou e mostra o erro que o banco devolve.

Diálogos em `src/components/billing/BillingWriteDialogs.jsx`: baixa, desconto
(aplicar e distribuir), ajuste, baixa por perda, estorno e cancelamento.

## 6. Testes

Rodam no banco vinculado, dentro de transação que termina em `RAISE EXCEPTION`
de propósito, então nada fica gravado. Comando:
`npx --no-install supabase db query --linked -f supabase/tests/<arquivo>.sql`.

| Suíte | Checagens | Cobre |
|---|---|---|
| `billing_rebuild_phase1.sql` | 26 | Schema, views, derivação |
| `billing_rebuild_phase2.sql` | 30 | Motor e fechamento |
| `billing_rebuild_phase3.sql` | 21 | Ciclo de vida das séries |
| `billing_rebuild_phase4_reads.sql` | 11 | Leituras do cockpit |
| `billing_rebuild_phase4_e2e.sql` | 16 | Roteiro com dados ficticios |
| `billing_rebuild_phase4_corte.sql` | 14 | Trava de consolidação e encerrar com corte |
| `billing_rebuild_phase4_barreira.sql` | 8 | Barreira no banco |

Nas suítes que usam meses futuros (2099) ou meses ainda não consolidados, a
consolidação é simulada com inserções em `sync_service_log`, dentro da transação.

A suíte de barreira cria a própria fatura, numa série real, dentro da transação,
e não depende de dados de teste persistentes.

Não há teste de tela automatizado. A validação de tela é manual, com o roteiro
da seção 8.

## 7. Operação

**Fechar uma competência:** o mês precisa estar consolidado (cron concluído no
dia 1 do mês seguinte). Se o mês não aparecer no seletor, o uso ainda não foi
consolidado. Não há o que fazer na tela.

**Encerrar um contrato com corte:** excepcional.
1. Pedido ao admin, fora do sistema, com o motivo do cliente.
2. O admin sincroniza o uso do cliente (Configurações → API DONC ou a ficha do cliente).
3. O admin roda `encerrar_com_corte` pelo banco ou pelo ponto de operação que vier a existir.
4. Redução de valor é desconto, lançado pelo fluxo normal de faturas.

**Sincronização manual:** não consolida o mês. Pode trazer uso parcial. Não usar
como base para fechamento.

**Flag:** `cockpit_faturamento` está em `['admin','finance']`. A mudança foi feita
por `UPDATE`, então está só no banco. Se o banco for recriado a partir das
migrações, a flag volta para `['admin']`.

## 8. Roteiro de validação manual

Com usuário financeiro, em `/financeiro-faturamento`:

1. Seletor lista só meses consolidados (hoje, de julho a setembro de 2026). O mês corrente não aparece.
2. Cabeçalho do cliente mostra o total de todas as faturas emitidas.
3. Cliente sem regra mostra selo "Sem regra lançada" e traços em uso, MRR mínimo e MRR real.
4. Busca, filtros e CSV respeitam o que está na tela.
5. Não há botão de encerrar com corte.

Com admin: o mesmo roteiro, mais o fechamento de competência com prévia.

## 9. Dados de teste

Em 2026-10-05, a pedido do time, foram removidos os clientes `[TESTE] Alfa`,
`[TESTE] Beta` e `[TESTE] Gama`, com as séries, regras, eventuais, faturas,
lançamentos e uso ligados a eles. O script é `supabase/fixtures/billing_test/teardown.sql`.

- Remove só os registros dos clientes `[TESTE] ...`.
- Mantém os registros de execução sem série (`billing_run_log.series_id IS NULL`): são resumos de fechamentos reais de 2026-09 feitos durante os testes, usados como auditoria.
- Não toca em `contract_charges` nem em `billing_payments` (modelo antigo).

Após a limpeza: 0 clientes `[TESTE]`, 0 faturas, 0 lançamentos, 0 regras, 0 séries
encerradas. As 134 cobranças e 82 pagamentos do modelo antigo permanecem.

## 10. Pendências e limites conhecidos

1. **Encerrar série e cancelar faturas do mês corrente:** `encerrar_series` com
   `p_remover_mes_atual` cancela faturas sem passar pela barreira.
2. **Meses anteriores a julho de 2026:** fora da lista, por falta de registro de
   consolidação. Aguardando confirmação de que foram sincronizados por completo.
3. **Prévia do fechamento de competência já fechada:** a prévia diz "Vai emitir"
   mesmo quando a competência já foi fechada. O modo real não emite de novo.
4. **Cancelamento de fatura por perfil:** o financeiro pode cancelar faturas. Mantido
   por decisão.
5. **Contrato fixo com regra de eventuais:** o bloco de cálculo mostra só o valor
   fixo. Eventuais aparecem nas faturas.

## 11. Arquivos

- Migrations: `supabase/migrations/20261005150000` a `20261005330000` (Fase 4).
- Suítes: `supabase/tests/billing_rebuild_phase*.sql`.
- Fixture: `supabase/fixtures/billing_test/`.
- Frontend: `src/pages/FinanceiroCockpitV2Page.jsx`, `src/components/billing/` (ClienteDetalhe, FaturasDoCliente, BillingWriteDialogs), `src/hooks/useBillingCockpit.js`, `src/hooks/useBillingWrites.js`, `src/hooks/useBillingExtrato.js`, `src/lib/csv.js`, `src/lib/clientSync.js` (`sincronizarUsoDonc`, usado pelo `syncClient`).
- Componentes de UI: `src/components/ui/` (Modal, Drawer, ConfirmDialog, StateBadges, StatusViews, Pagination).
