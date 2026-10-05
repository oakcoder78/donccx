# SDD — Ciclo de Vida da Série Contratual (Contract Series Lifecycle)

## Purpose

Documento de Spec-Driven Development — fonte canônica de **como uma série contratual vive e morre**: como o lançamento se mantém sozinho, como a série é encerrada, reaberta, estendida, suspensa e do que ela é isenta.

**Escopo deste documento:** mutação e manutenção do ciclo de vida de `contract_series`. O cockpit financeiro — que *lê* essas séries para calcular MRR, uso e adimplência — tem SDD próprio em `docs/sdd/financeiro-cockpit-sdd.md`. Aqui documenta-se o que *altera* a série.

**Por que um SDD separado e não mais um adendo no do cockpit.** A Phase 1 daquele documento (v1.0, 2026-09-11) desenhou `billing_status` com três estados, incluindo `suspenso`; a v1.7 decidiu "fatura zerada não existe". Este documento **reverte as duas decisões**. Além disso, é a primeira operação do sistema que **apaga linhas financeiras** (`contract_charges`), o que exige seção de risco, critérios de aceite e notas de rollback próprios — um perfil de risco que o SDD do cockpit não cobre. A regra do `docs/README.md` ("um assunto → um documento canônico") resolve o resto: o cockpit lê contratos, isto os altera.

**Estado:** Fases A–E implementadas e verificadas em produção (2026-10-03). Verificação em duas rodadas: uma fixture descartável de duas séries (`ZZ Teste Ciclo de Vida`, removida ao final) e depois o **cliente 21 real**, que é o caso onde a perda seria maior. Doze defeitos saíram desse caminho e estão na tabela da seção 4-bis. O log completo, com os números medidos, está na seção 4-ter.

Entrega 2 pendente: reestruturar o layout da aba Contrato e permitir escolher N séries de uma vez (exige `uuid[]` em `set_nao_cobrar`).

> **As RPCs deste documento foram migradas (2026-10-05).** A Fase 3 do rebuild de faturamento (`docs/sdd/financeiro-faturamento-sdd.md`) moveu `encerrar_series`, `reabrir_series`, `cobrar_mais_meses` e `get_series_vencidas` para `series_rules` + `invoices`. `reativar_series` e `set_nao_cobrar` não mudaram — só tocam `billing_status`. O que muda de comportamento:
>
> - **Encerrar** não apaga mais linhas de `contract_charges` (a projeção materializada deixou de existir). Para a emissão pelo status, e cancela, **por escolha explícita**, a recorrência futura (`p_remover_futuro`) e/ou as parcelas eventuais futuras (`p_cancelar_eventuais`), ambas desligadas por padrão. A regra de cancelamento vem da negociação, não do sistema. Fatura com lançamento não é cancelada — pagamento é fato. `sales` pode encerrar e cancelar por esta ação; o cancelamento avulso de fatura segue restrito a admin, manager e finance.
> - O **eventual de encerramento** vira fatura (`kind='eventual'`), não linha de projeção.
> - **Reabrir** devolve status e `contract_renewal` e nada emite retroativamente; `ensure_series_horizon` não é mais chamada pelo ciclo de vida.
> - **Regressão verificada:** o replay do cliente 21 (61 charges, 48 payments, `ativa` / `2025-10-27` / 36) passa.
>
> As seções deste documento que descrevem o comportamento antigo — §1.2, §1.3, §1.8 — continuam válidas como **regra de negócio**; o que mudou é o mecanismo. O histórico da verificação de 2026-10-03 (§4-ter) fica como está: foi medido no modelo antigo.

### How to use this document

1. **Fase A–E** na seção 4 são a ordem de execução. Uma fase ativa por vez.
2. Cada fase só é marcada completa após `npm run build` e a verificação do checklist dela.
3. **As decisões de negócio da seção 3 já foram tomadas** com o solicitante. Mudar uma delas é decisão de produto, não de implementação — e exige atualizar a seção e o registro de histórico.
4. **Antes de escrever código**, leia a seção 6 (Gotchas). Quatro armadilhas deste domínio custaram tempo real e continuam lá.
5. A seção 2 lista o que existe hoje e o que será criado. Se a produção divergir, atualize a seção 0 antes de agir.

---

## 0. Current System State

### O que existe hoje em produção

**Modelo de dados.** `contract_series` (26 séries, todas com `status='ativa'`) é a fonte. Colunas relevantes: `billing_start`, `billing_end`, `due_day`, `auto_renew`, `status` (`ativa`/`encerrada`), `billing_status` (`ativo`/`suspenso`/`nao_bilhetavel`), `billing_suspended_until`, `contract_months`, `contract_renewal`.

`contract_charges` é a recorrência **materializada**: uma linha por mês, com `month_index` (posição contada de `billing_start`) e `ref_month` (`YYYY-MM`). Hoje há 133 linhas de recorrência em 3 séries. `billing_payments` são os pagamentos (74 linhas), chaveados por `(client_id, series_id, ref_month)`.

**Duração derivada.** `contract_months` (2026-10-01) é a duração do contrato assinado, separada do horizonte materializado. Só 3 séries o têm preenchido — as demais aguardam o Financeiro cadastrar. `contract_renewal` é derivada por trigger (`trg_sync_contract_renewal`) a partir de `billing_start + contract_months`.

**Materialização.** `ensure_series_horizon(series_id)` (2026-10-01) é o caminho único que replica a última linha de recorrência até o horizonte alvo e grava `billing_payments = 'adimplente'` nos meses vencidos sem registro. Idempotente por guarda de `max(month_index)` — **não** por `ON CONFLICT`, porque toda linha de recorrência tem `installment_group IS NULL` e NULLs são distintos num índice único.

**Vencimento derivado.** `trg_sync_charge_due_date` deriva `contract_charges.due_date` da competência + `due_day` da série, com clamp no fim do mês. O clamp é obrigatório: o cast direto estoura `22008` com `due_day` 30 em fevereiro.

**Consumo.** `_financeiro_series_month(p_ref_month)` filtra por `ref_month` exato e só considera `status='ativa'`. Todos os consumidores de `contract_charges` filtram por mês, então meses futuros são inertes — não somam em MRR, não viram pendência, não aparecem em relatório.

**Alerta de série vencida.** `get_series_vencidas()` (2026-10-01) devolve séries ativas, com `contract_months`, **sem** `auto_renew`, `billing_end IS NULL` e `contract_renewal` no passado. Hoje retorna vazio: as 3 séries com `contract_months` têm `auto_renew` ligado. Renderizado por `SeriesVencidasAlerta` no cockpit e na lista de clientes, atrás da flag `contract_series_lifecycle`.

### O que está errado e não funciona

**a) Não existe gatilho independente para o horizonte.** `ensure_series_horizon` é o passo 5 do `monthly-sync`, acoplado a quatro serviços de rede externos. Não há como rodar só o horizonte — o botão "Executar agora" da tela de Configurações dispara o orquestrador inteiro.

**b) O orquestrador está agendado três vezes.** `default-sync` (`0 0 1 * *`), `monthly-sync-job` (`1 0 1 * *`) e `test-fix-$(date +%s)` (`0 9 2 7 *`) apontam para `functions/v1/monthly-sync`. O terceiro tem nome literal de shell — `$(date +%s)` não foi expandido por erro de quoting — e está **ativo**: se não for removido, dispara o orquestrador inteiro em 02/07/2027. O histórico da tela de Configurações mostra execuções duplicadas 5 segundos separadas, de forma consistente.

**c) "Não cobrar" não é do cliente.** O motor lê `contract_series.billing_status`. O `clients.billing_status` é espelho — o trigger `check_billing_suspended_until` só deriva `contract_active` dele. Marcar "Não cobrar" num cliente com um aditivo ativo **não para o aditivo**: as séries continuam faturando.

**d) `suspenso` e `nao_bilhetavel` fazem a série sumir do cockpit sem aviso.** As duas viram `zerada` na engine, e a v1.7 do SDD do cockpit removeu a exibição de fatura zerada — então saem da tabela por completo. O Financeiro vê o cliente desaparecer e não tem como saber se está suspenso, se foi marcado "não cobrar" ou se o contrato venceu. É a mesma falha do cliente 21, agora em outra forma. **7 séries** estão em `nao_bilhetavel` hoje.

**e) Suspensão sem prazo é impossível, mas não por necessidade.** O form exige `billing_suspended_until`, e o trigger `check_billing_suspended_until` levanta `23514` sem ela. O SQL **já suporta** suspensão indefinida: `coalesce(suspended_until >= first_day, true)` dá `true` quando a data é NULL.

**f) Não existe encerramento, nem reabertura, nem estensão.** Nada no sistema encerra uma série. O `status='encerrada'` existe e o form já o trata como read-only (`activeReadOnly`), mas nenhuma ação o produz.

### Files to be touched

| Arquivo | Natureza |
|---|---|
| `supabase/functions/contract-series-sync/index.ts` | **Create** — EF só com o horizonte, chamável isoladamente |
| `supabase/functions/monthly-sync/index.ts` | Modify — remover o passo 5 |
| `supabase/functions/sync-schedule/index.ts` | Modify — ação `run-horizon` |
| `src/components/clients/ContractLifecycleDialogs.jsx` | **Create** — 3 diálogos (encerrar, não cobrar, cobrar mais N meses) |
| `src/components/clients/SeriesVencidasAlerta.jsx` | Modify — 3 ações em vez de 2 |
| `src/components/settings/SettingsSyncStatus.jsx` | Modify — botão "Repor horizonte" |
| `src/components/clients/ClientFormContent.jsx` | Modify — vocabulário de status, N da série encerrada, gate de validação |
| `src/hooks/useContractCharges.js` | Modify — mutações de ciclo de vida |
| `supabase/migrations/<ts>_contract_series_lifecycle.sql` | **Create** — RPCs e vocabulário |
| `docs/system/sync-pipeline.md` | Modify — 5º serviço, gatilhos, regime |
| `docs/sdd/financeiro-cockpit-sdd.md` | Modify — ponteiro e supersessão |

---

## 1. Regras de negócio

Validadas com o solicitante em 2026-10-01. São estas, não as do histórico.

### 1.1 O contrato tem prazo; o mês a mês é decisão

Uma série nasce com um prazo (`contract_months`). Fazer o lançamento dos primeiros N meses é o esperado. O que acontece no mês N+1 depende de uma **decisão**:

- **Renovação automática marcada** → o lançamento continua mês a mês, indefinidamente, replicando o último valor, até alguém encerrar a série.
- **Renovação automática não marcada** → o lançamento para no fim do prazo. Isso é uma **pendência que precisa ser comunicada**, não um silêncio: a série vira "vencida" e aparece no alerta com a decisão pendente.

`contract_months` é o prazo assinado. O horizonte materializado vai além dele quando há renovação automática — a folga de 12 meses existe só para tolerar falha, e por isso nunca aparece em previsão, dash ou relatório.

### 1.2 Encerrar

Encerrar significa que **aquele contrato não será mais cobrado**. É permanente enquanto a série não for reaberta.

Quatro decisões que o encerramento precisa tomar:

| Decisão | Padrão | Por quê |
|---|---|---|
| Meses futuros já lançados | Cancelar e não registrar | Eram folga, nunca foram contratados (caso do cliente no mês a mês) ou foram cancelados por acordo (caso do contrato vigente) |
| **Mês corrente** | **Manter** | A cobrança já foi emitida e ainda é cobrável. Cancelá-la é uma decisão, não um detalhe — daí ser uma opção à parte (`p_remover_mes_atual`), não um efeito colateral |
| `contract_renewal` | `NULL` | Contrato encerrado não tem renovação. Alimenta só o KPI de renovações em 30 dias, o filtro da lista e a tela do cliente — todos ficam certos com `NULL` |
| `contract_months` | **Preservado** | É o registro do que foi contratado. Não alimenta decisão |

`contract_renewal = NULL` é coerente com `contract_months` preservado: o prazo continua sendo um fato, a renovação deixa de existir.

**O motivo do encerramento vai em `encerramento_motivo`, não em `reason`.** `reason` descreve a série — por que a renegociação existe — e sobrescrever o apagava para sempre. Testado: renegociação com motivo "Desconto de 20% por volume contratado", encerrada com "Cliente pediu cancelamento do contrato" deixava o motivo original como `(nulo)`. `reabrir_series` limpa `encerramento_motivo` pelo mesmo motivo que recalcula a renovação: os dois descrevem o estado atual da série.

### 1.3 Encerrar não é apagar pagamento

Ao encerrar, apagam-se `contract_charges` acima do mês corrente — ou a partir do mês anterior, se o mês corrente também for cancelado (§1.2). **`billing_payments` nunca é apagado** — inclusive o de meses futuros. Cliente que paga adiantado tem dinheiro entrando; apagar o registro seria errado. Hoje a UI não cria essa situação (as opções do `PaymentToggle` só trazem meses com dado de uso, que são passados), então é uma escolha defensiva para o futuro, mas o correto é preservar.

### 1.4 Reabrir é sempre o caminho

Reabrir restaura `status='ativa'`, recalcula `contract_renewal` e chama `ensure_series_horizon`, que **reconstrói a cauda apagada** replicando a última linha de recorrência.

Isso vale para os dois caminhos do diálogo de encerramento. Apagar e reabrir volta o mesmo estado que manter teria deixado, então **nenhuma das opções é beco sem saída** — a escolha é higiene de dados, e o diálogo deve dizer isso.

Única exceção: série encerrada **sem nenhuma recorrência lançada** não tem linha para replicar. A reabertura é recusada com mensagem pedindo o lançamento no form — que o `validateSeriesList` já exige antes de qualquer save.

### 1.5 Concessão é concessão, e é um caminho — o caminho da concessão

> **Correção 2026-10-03.** Esta seção dizia que a suspensão foi modelada como
> concessão e que `billing_status = 'suspenso'` foi removido. A segunda metade é verdade; a
> primeira nunca foi implementada. O texto antigo descrevia o desenho pretendido como se
> estivesse em operação. Ver "Três mecanismos e um nome" abaixo.

Suspensão por dificuldade financeira **não zera a linha**. Ela representa perda de receita, e a gestão precisa saber que existem X reais em descontos. A concessão existe para isso: `billing_exceptions` com vigência, quatro tipos — `isencao_total`, `desconto_percent`, `valor_reduzido`, `desconto_unidade` — operada no cockpit por `ExcecaoModal`. A recorrência mantém o valor contratado; a concessão aplica-se por cima só no período.

Consequência: o conceito `billing_status = 'suspenso'` é **removido**. Nenhuma série o usa hoje, então a remoção não custa migração. Confirmado em produção: `suspenso` = 0 séries, `billing_suspended_until` = 0 linhas não nulas.

**Três mecanismos e um nome.** O codebase tem três coisas distintas, e duas delas carregam
o nome "suspender" para quem opera:

| Mecanismo | Como se manifesta | Inverso como | Estado real |
|---|---|---|---|
| **Concessão** | `billing_exceptions` + `ExcecaoModal`, no cockpit | Lançar a concessão | Tabela e modal existem; **0 concessões concedidas** — nunca operada |
| **Não cobrar** | `set_nao_cobrar` → `billing_status='nao_bilhetavel'`, no form do cliente | `set_nao_cobrar(..., NULL)` | **7 séries** em `nao_bilhetavel` |
| Suspensão por data | `billing_suspended_until` | — | **Morta**: coluna vazia, e o trigger a zera sempre que o status não é `suspenso` |

O diálogo deste documento se chama **"Suspender cobrança"** e chama `set_nao_cobrar`, ou
seja, ele opera o segundo mecanismo — um flag permanente de faturamento, sem concessão e
sem data. Não é a concessão da primeira linha, e não volta sozinho como concessão volta.

Isso é uma **colisão de nome entre dois mecanismos reais**, não uma implementação
faltando. O nome foi escolhido na discussão da entrega (o antigo "Não cobrar" foi
renomeado porque soava como crime), e a decisão sobre unificar ficou em aberto. Ver
`TD-015` no backlog.

**Código morto.** `check_billing_suspended_until` mantém o primeiro ramo que zera
`billing_suspended_until`, e `_financeiro_series_month` ainda tem o filtro de `suspenso`.
São inalcançáveis com os dados atuais, mas ficam como rede de segurança caso alguém
reintroduza o status. Não removi: derrubar coluna e reescrever a função do cockpit é
migração com risco de alterar MRR histórico, e o benefício é zero enquanto nada
escrever `'suspenso'`. Se a decisão de `TD-015` passar a usar data, o código volta a ser
necessário.

O rótulo de concessão "não pagar por 6 meses" é `isencao_total`; "pagar 70%" é `desconto_percent`. A distinção entre "o contrato diz isso" e "aqui estamos conceder isso" é o que separa **regra de recorrência** de **concessão**, e as duas coisas precisam continuar separadas:

| | Regra de recorrência | Concessão (`billing_exceptions`) |
|---|---|---|
| O que é | O valor contratado | Um benefício comercial sobre o contratado |
| Como se expressa | N períodos contíguos 1..N | 4 tipos com `valid_from`/`valid_to` |
| Exemplo | Contrato de 36 meses: 12 × R$ 2.500 e depois 24 × R$ 5.000 | Dificuldade financeira: 6 meses de isenção |
| Alcance | A série inteira | Por série ou por cliente |
| Onde | Form do cliente (períodos ilimitados) | Cockpit (`+ Exceção`) |

"Contrato de 36 meses, nos 12 primeiros cobro metade" já é regra de recorrência e funciona hoje — `Adicionar período` não tem limite e `validateRulesContiguous` só exige cobertura contígua de 1..N.

### 1.6 "Suspender cobrança" pergunta o escopo

Suspender cobrança é uma ação sobre o cliente, mas **o escopo não é óbvio**: se o cliente tem duas séries ativas e quer parar de lançar uma, o caminho pode ser **Encerrar série** (definitivo) ou só suspender aquela (reversível).

Então o diálogo pergunta:

- **Todas as séries** — original e aditivos param de ser lançados. O cliente sai do faturamento mas continua ativo na carteira.
- **Só esta série** — as outras seguem normalmente.

O botão **Não cobrar** materializa o cliente inteiro; o botão **Encerrar série** materializa uma série. São ações diferentes e o usuário escolhe.

Propagar para todas as séries ativas é o que falta hoje (§0c).

### 1.7 "Suspender cobrança" não interrompe a materialização

As linhas continuam sendo criadas para séries não-biletáveis. Reverter fica instantâneo porque os meses já existem, sem buraco até o próximo job.

### 1.8 Cobrar mais N meses

Para o caso em que o cliente concorda em continuar pagando por um período antes de parar. É o **Fim da cobrança** que já existe: desmarcar renovação automática e preencher a data. O horizonte para lá sozinho, e ao chegar nela a série entra no alerta de vencida.

O que falta é ser **descobrível**: hoje o usuário teria de saber que desmarcar o checkbox resolve.

---

## 2. Superfície

### 2.1 Diálogos

Todos em `src/components/clients/ContractLifecycleDialogs.jsx`. Renderizam `null` quando não se aplicam.

**Encerrar série** — só aparece quando há meses à frente. Sem meses futuros, o encerramento é imediato e sem diálogo.

```
Encerrar série "Contrato original"?

Ela para de ser lançada imediatamente.
· Meses vencidos e registrados como pagos ficam no histórico.
· Restam 13 meses à frente (fatura até ago/2027) que não serão cobrados.

O que fazer com eles?
(•) Cancelar e não registrar   (•) Manter como registro

[ ] Lançar multa ou ajuste como cobrança eventual

[ Encerrar série ]   [ Voltar ]
```

O texto diz que **ambas as opções são reversíveis**, porque reabrir reconstrói o que foi apagado (§1.4). Isso tira o peso da decisão.

**Não cobrar**

```
Não cobrar este cliente?

Ele sai do faturamento, mas continua ativo na carteira.
(•) Todas as séries — original e aditivos param de ser lançados.
(•) Só esta série — as outras seguem normalmente.

Os meses já lançados são mantidos, para reverter quando quiser.

[ Confirmar ]   [ Voltar ]
```

**Cobrar mais N meses** — no alerta de série vencida.

```
Cobrar mais N meses

A série para de se renovar automaticamente e fatura até dd/mm/aaaa.
Ao chegar nessa data ela entra no alerta de série vencida.

[ Confirmar ]   [ Voltar ]
```

### 2.2 Alerta de série vencida

Três ações em vez de duas: **Encerrar série** (abre o diálogo), **Cobrar mais N meses**, **Renovar mês a mês**.

### 2.3 Vocabulário no form

`billing_status` fica com **Ativo** e **Não cobrar**. Sai o botão "Suspenso" e o input "Suspenso até".

"Concessão temporária" não ganha botão no form: ela já é criada no cockpit (`+ Exceção`), e a seção "Negociações vigentes" do form é somente leitura por decisão anterior.

### 2.4 Série encerrada no form

Uma série encerrada é um **registro do que foi cobrado**, não um contrato a completar:

- `N` passa a ser `max(month_index)` real, não `contract_months`
- a validação de regras contíguas entra no gate de `status === 'ativa'` que o "lançamento obrigatório" já usa

Sem isso, apagar os meses futuros com `contract_months` preservado faria o form recusar o save — *"Os períodos precisam cobrir do mês 1 ao 60"* — e quebraria até uma edição simples de nome.

---

## 3. RPCs

### `encerrar_series(p_series_id uuid, p_remover_futuro boolean, p_eventual jsonb default null)`

> **Contrato atual (Fase 3, correção de 2026-10-05).** A assinatura é `encerrar_series(p_series_id, p_remover_futuro default false, p_eventual, p_motivo, p_remover_mes_atual, p_cancelar_eventuais default false)`. O que acontece com as faturas futuras não liquidadas é decidido pela negociação, não pelo sistema:
> - `p_remover_futuro` cancela a **recorrência** futura não liquidada;
> - `p_cancelar_eventuais` cancela as **parcelas eventuais** futuras não liquidadas;
> - faturas com lançamento nunca são canceladas;
> - a checagem de papel vem antes do retorno de "já encerrada".
>
> A descrição abaixo é o mecanismo original, sobre `contract_charges`. Está mantida como histórico.

```sql
RETURNS jsonb
```

- `FOR UPDATE` na série
- se `p_remover_futuro`: `DELETE FROM contract_charges WHERE series_id = X AND ref_month > mês corrente`. **Não** toca em `billing_payments`
- `UPDATE contract_series SET status='encerrada', contract_renewal=NULL` — `contract_months` intacto
- eventual opcional inserido como `kind='implantacao'`

Uma RPC em vez de três chamadas do front, porque o resultado é atômico: encerrar e apagar as linhas à frente não pode ficar pela metade.

### `reabrir_series(p_series_id uuid)`

- recusa se não houver linha de recorrência para replicar
- `status='ativa'`, `contract_renewal` recalculado a partir de `contract_months`
- chama `ensure_series_horizon`, que reconstrói a cauda

### `set_nao_cobrar(p_client_id int, p_series_id uuid default null)`

- `p_series_id` nulo → todas as séries ativas do cliente; preenchido → só uma
- espelha `clients.billing_status` e `contract_active`

---

## 4. Implementation Phases

### Fase A — Limpeza dos crons

**Status:** Done (2026-10-02)

**Rationale:** Antes de extrair o serviço, o agendamento precisa estar correto — senão a EF nova nasce já rodando em duplicidade. O job `test-fix-$(date +%s)` é o mais urgente: ativo, dispara o orquestrador inteiro e tem data fixa (02/07).

**Scope:**
- Remover `test-fix-$(date +%s)`, `default-sync`; manter `monthly-sync-job` (nome que `manage_cron_job` e `sync-schedule` usam por padrão)
- Cron da EF `contract-series-sync`, poucos minutos fora do orquestrador

#### Checklist

- [x] **Cron:** `cron.unschedule('test-fix-$(date +%s)')` — confirmado pelo nome literal
- [x] **Cron:** `cron.unschedule('default-sync')`
- [x] **Cron:** `monthly-sync-job` é o único agendamento de `monthly-sync`
- [x] **Doc:** `docs/system/sync-pipeline.md` atualizado (1 orquestrador + serviço do horizonte)
- [x] **Build:** `npm run build` sem erros

#### Implementation Log (Fase A)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Fase B — Horizonte como serviço independente

**Status:** Done (2026-10-02)

**Rationale:** `ensure_series_horizon` é idempotente por design — exatamente o perfil de algo que deve poder rodar quantas vezes quiser. Preso a um orquestrador que chama quatro serviços de rede externos, ele não roda quando precisa e herda a falha de qualquer um deles.

**Scope:**
- EF `contract-series-sync`, com `authorizeRequest` próprio, seguindo o padrão de `health-recalc`
- `run-horizon` no `sync-schedule` + botão em Configurações
- Remover o passo 5 do `monthly-sync`

#### Checklist

- [x] **EF:** `contract-series-sync` criada e implantada (v1)
- [x] **Sync-schedule:** ação `run-horizon` implantada (v13)
- [x] **UI:** botão "Repor horizonte" em `SettingsSyncStatus.jsx`, irmão do "Executar agora"
- [x] **Monthly-sync:** passo do horizonte removido do corpo e implantado (v37)
- [x] **Deploy:** `verify_jwt = false` confirmado; `[functions.contract-series-sync]` em `config.toml`
- [x] **Verificação:** 2ª passada em todas as séries ativas → `sum = 0`
- [x] **Build:** `npm run build` sem erros

#### Implementation Log (Fase B)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Fase C — Encerrar e reabrir

**Status:** Done, exceto as verificações marcadas (2026-10-02)

**Rationale:** Primeira operação do sistema que apaga dados financeiros. Vai por conta própria porque a validação do form precisa mudar junto, e as duas coisas só fazem sentido em conjunto.

**Scope:**
- RPCs `encerrar_series` e `reabrir_series`
- Diálogo de encerramento, com eventual opcional
- Série encerrada exibe e valida pelo `max(month_index)` real

#### Checklist

- [x] **Migration:** `encerrar_series` — apaga `contract_charges` futuros, nunca `billing_payments`
- [x] **Migration:** `reabrir_series` — recusa sem linha para replicar; recalcula `contract_renewal`
- [x] **Migration:** `ensure_series_horizon` retorna 0 com `status='encerrada'` (verificado)
- [x] **Hook:** `useContractCharges.js` — o `UPDATE` cru de `encerrar` foi removido; encerrar só via RPC
- [x] **UI:** `ContractLifecycleDialogs.jsx` com o diálogo de encerramento
- [x] **Form:** `N` da série encerrada = o que existe, não o prazo contratado
- [x] **Form:** regra contígua e exigência de período lançado dentro do gate de `status === 'ativa'`
- [x] **Verificação:** encerrar o cliente 21 → **49** meses (2022-10 a 2026-10); os 12 de folga (2026-11 a 2027-10) caem; 48 pagamentos intactos; `contract_months` 36 preservado; `contract_renewal` NULL; motivo gravado em `encerramento_motivo`; **cockpit 2026-09 e 2026-10 continuam 2.299,95**. Executado em 2026-10-03.
- [x] **Verificação:** reabrir o cliente 21 → volta a **61** meses (2022-10 a 2027-10), `contract_renewal` de volta a 2025-10-27, `encerramento_motivo` limpo, 48 pagamentos preservados, cockpit 2026-09 em 2.299,95. Cliente idêntico ao estado inicial. Executado em 2026-10-03.
- [x] **Verificação:** série encerrada continua editando nome do cliente sem erro de validação — verificado no navegador com série encerrada + save (seção 4-ter, linha 4)
- [x] **Build:** `npm run build` sem erros

#### Implementation Log (Fase C)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Fase D — "Não cobrar" com escopo

**Status:** Done (2026-10-02)

**Rationale:** Hoje "Não cobrar" num cliente com aditivo ativo não para o aditivo — o motor lê `contract_series.billing_status` e o `clients.billing_status` é só espelho. Sem isso, 7 séries marcadas continuam faturando.

**Scope:**
- RPC `set_nao_cobrar`
- Diálogo de escopo no form
- Botão "Reativar" para desfazer

#### Checklist

- [x] **Migration:** `set_nao_cobrar` com propagação por `p_series_id` nulo
- [x] **Migration:** espelha `clients.billing_status` (só em ação cliente-wide) e `contract_active` via trigger
- [x] **UI:** diálogo geral / só esta série, com seletor quando o cliente tem >1 série
- [x] **UI:** botão "Não cobrar" abre o diálogo em vez de gravar direto
- [x] **UI:** caminho de reativação visível — botão na aba da série quando ela está `nao_bilhetavel`, via `reativar_series`
- [x] **Verificação:** cliente com 2 séries → "todas" marca as 2 e o cliente; "só esta" marca 1 e o cliente segue `ativo`
- [x] **Verificação:** materialização da folga **não** para (§1.7) — série `nao_bilhetavel` materializa 12 meses, e 0 pagamentos futuros
- [x] **Build:** `npm run build` sem erros

#### Implementation Log (Fase D)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Fase E — Remover suspensão

**Status:** Done (2026-10-02)

**Rationale:** Por último, porque até aqui a concessão temporária já está no lugar (`ExcecaoModal` do cockpit) e nada se perde. Nenhuma série usa `suspenso` hoje, então a remoção é só front + CHECK.

**Scope:**
- Trigger `check_billing_suspended_until` reescrito sem o ramo de suspensão
- CHECK de `clients.billing_status` apertado para dois valores
- Botão e input de suspensão fora do form

#### Checklist

- [x] **Migration:** trigger reescrito, **mantendo** o sync de `contract_active`
- [x] **Migration:** `CHECK (billing_status IN ('ativo','nao_bilhetavel'))` em `clients` (confirmado em `pg_constraint`)
- [x] **Migration:** `contract_series.billing_status` sem CHECK próprio — sem série em `suspenso` (0 de 26), sem backfill
- [x] **UI:** botão "Suspenso" e input "Suspenso até" removidos
- [x] **UI:** validação que exige a data, removida
- [x] **UI:** hint de "Status de cobrança" aponta para Concessão no cockpit
- [x] **Build:** `npm run build` sem erros

#### Implementation Log (Fase E)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

## 4-bis. Defeitos encontrados na verificação manual

Nenhum destes apareceu em build, em revisão ou nos testes de SQL das fases. Todos
apareceram quando alguém operou a tela de verdade, sobre uma fixture descartável
(cliente "ZZ Teste Ciclo de Vida", duas séries). O padrão é o mesmo em quase todos:
**o banco estava certo e a tela dizia a coisa errada**, ou o banco fazia a coisa
errada em silêncio.

| # | Defeito | Como se manifestava | Por que escapou |
|---|---|---|---|
| 1 | `ensure_series_horizon` só aplicava o teto do prazo com `auto_renew=false AND billing_end IS NOT NULL` | Contrato encerrado continuava sendo lançado até `current+12`. O caso da série vencida — renovação desligada, `billing_end` nulo — é justamente o que pulava o clamp | A fixture da série vencida nunca passou por `ensure_series_horizon`; os testes anteriores só cobriam `auto_renew=true` |
| 2 | `ensure_series_horizon` apagava `billing_payments` de meses futuros | Contrariava §1.3. Só apareceu ao corrigir (1), porque com o clamp certo o prepay passou a estar acima da última recorrência | O teste que exercitava o reaproveitamento nunca tinha pagamento órfão |
| 3 | O `onDone` de "Não cobrar" escrevia no buffer da série **ativa**, sem olhar o escopo | Marcar "só a série Vencida" marcou a Original, o cliente inteiro saiu do faturamento, e a série realmente escolhida voltou para ativa no save seguinte | `form` é o buffer da série ativa; pareceria inofensivo lendo só o nome do campo |
| 4 | O form semeia o estado **uma vez**; ação de ciclo de vida não ressemeava | Salvar sobrescrevia o que a RPC gravou | Só apareceu ao combinar ação de ciclo de vida com o botão Salvar |
| 5 | `resincronizarComBanco` descartava edições não salvas das 7 seções por-série | Suspender cobrança apagava trabalho em Plano, Recorrência, Eventuais, Faixas e Produtos | Nenhuma verificação checava o que acontecia com o resto do form |
| 6 | `aplicarNoForm` referenciava `clientId`, que só existe no `handleSubmit` | ReferenceError **depois** do patch: a série mudava na tela, as contagens não, e o erro parecia falha da ação | `clientId` é nome plausível; o `setSeriesReady(false)` da versão anterior rodava antes de estourar, o re-seed completava e o erro aparecia em lugar nenhum |
| 7 | Encerrar só travava a folha até o fim do bloco da série | Daí para baixo tudo editável, e suspender ainda abria diálogo numa série encerrada | `activeReadOnly` era passado corretamente para 3 seções e faltava em 2 — sem teste de cobertura |
| 8 | `contract_series.reason` fazia dois papéis | Encerrar uma renegociação apagava o motivo pelo qual ela existia | Nada escrevia nos dois campos ao mesmo tempo |
| 9 | `_financeiro_series_month` filtrava por `status='ativa'` | Encerrar zerava o MRR de **todos** os meses, inclusive os pagos | O teste olhava o mês corrente, não o histórico |
| 10 | Suspender ("Não cobrar") confirmava com `variant="danger"` | Ação reversível visualmente idêntica à irreversível | `danger` é a única cor de perigo da paleta e foi usada por costume |
| 11 | O save gravava `contract_months: s.N` | Salvar uma série **encerrada** sobrescrevia o prazo assinado pelo N de registros. No cliente 21 (prazo 36, 49 registrados) salvar renomeando o cliente deixaria o prazo 49 | `N` é igual ao prazo em série **ativa**, então o bug só aparece depois que a Fase C passou a usar N = "o que foi registrado" |
| 12 | `saveCharges` apagava **todas** as cobranças da série e reinseria as do form | Abrir o cliente 21, não mudar nada e salvar destruía 25 linhas de faturamento real (2025-11 a 2027-10). Voltavam porque `ensure_series_horizon` roda depois e reconstrói — ou seja, a integridade dependia de a reconstrução acertar | O horizonte mascara a perda: depois do save o estado final fica certo. Só apareceu ao comparar a quantidade de linhas com o que o form realmente edita (36) |

| 13 | §1.5 descrevia a concessão como caminho de suspensão, e o diálogo "Suspender cobrança" opera `nao_bilhetavel` | Quem lesse o documento acharia que suspender cobrança é lançar concessão. Não é: o diálogo liga uma flag permanente sem data. As 7 séries em `nao_bilhetavel` não têm concessão nenhuma | O documento passou a Fase E inteiro descrevendo um desenho, e o texto não foi conferido contra `pg_proc` depois. `billing_exceptions` existia, e isso foi tomado como "a concessão está no lugar" |

**Lição que os treze têm em comum:** nenhum é um erro de cálculo. São erros de
**contrato entre camadas** — entre o que a tela mostra e o que o buffer é, entre o
que a RPC grava e o que o motor lê, entre o que duas colunas com o mesmo nome
significam. Build, lint e teste de unidade não olham nenhuma dessas fronteiras.

O que pega esses casos é operar a tela com dados que ninguém planejou: uma segunda
série, um mês corrente com cobrança emitida, uma renegociação que existe para ter
motivo. Vale criar a fixture antes da implementação, não depois do primeiro bug.

### Suspeita que não se confirmou

Ao consertar o defeito 12, alya-se que o mesmo save **destruído** recomputaria o
`due_date` das linhas recriadas — e para série com reajuste no meio do prazo, a recriação
replicaria a última linha e achataria o histórico de valores.

**Não é problema.** `trg_sync_charge_due_date` só age em `kind='recorrencia'` e
calcula `due_date` como função pura de (`due_day` da série, `ref_month`): clamp do dia no
mês. Recriar a linha reproduz o mesmo valor por construção. Conferido nas 61 linhas do
cliente 21: 61/61 batem com a fórmula, dia 27 em todas.

Eventuais passam por outro caminho: o trigger não as toca, mas elas fazem round-trip
`regroupEventuais` → `eventualStart` → `expandEventuais`, que preserva o dia —
`regroupEventuais` lê `c.due_date` e `expandEventuais` o regrava a partir dali.
Validado com 1 e com 3 parcelas: os dias 11, 11 e 11 sobreviveram ao round-trip.

O que **não** é garantido pela correção do 12: se o usuário mudar o `due_day` da série,
todas as `due_date` mudam, por desenho do trigger. Isso é comportamento, não regressão.

---

## 4-ter. Log de verificação em produção

Duas rodadas. A primeira com uma fixture descartável de duas séries, porque nenhuma das
combinações necessárias existia: cliente com 2+ séries ativas, série vencida, série
encerrada. A segunda no **cliente 21**, que é onde a perda de dado seria maior e que ninguém
tinha Fixture equivalente.

Todos os números abaixo foram medidos no banco depois da operação. Nenhum é estimativa.

### Rodada 1 — fixture `ZZ Teste Ciclo de Vida` (cliente 46)

| # | Operação | Resultado medido |
|---|---|---|
| 1 | Suspender série específica | Série alvo `nao_bilhetavel`, **cliente segue `ativo`**, MRR da outra série intacto |
| 2 | Fólga de série suspensa | `ensure_series_horizon` materializou **12 meses**, **0 pagamentos futuros** (§1.7) |
| 3 | Encerrar mantendo mês corrente | Sobraram **3** meses (ago, set, out); pagamento prepaid futuro **intacto** |
| 4 | Encerrar cancelando mês corrente | Sobraram **2** meses (ago, set); pagamento prepaid **intacto** |
| 5 | Reabrir após cada um | Números voltaram ao estado anterior; horizonte idempotente (2ª passada = 0) |
| 6 | Edição não salva em outra seção + suspender | O valor digitado **sobreviveu** — corrigiu o defeito 5 |
| 7 | Encerrar e reabrir **sem recarregar** | Contagens derivadas mudaram na hora (3 → 12 → 3) — corrigiu o defeito do N stale |

### Rodada 2 — cliente 21 real (`Comercial de Eletromóveis Ltda`)

Estado inicial medido: 61 meses de recorrência (2022-10 a 2027-10) em valor único de
2.299,95, soma 140.296,95, **48 pagamentos**, contrato de 36 meses com renovação em
2025-10-27, `auto_renew` ligado, dia de vencimento 27.

| # | Operação | Resultado medido |
|---|---|---|
| 1 | Encerrar, mantendo o mês corrente | 61 → **49** meses; 48 pagamentos intactos; `contract_months` **36 preservado**; `contract_renewal` NULL; motivo em `encerramento_motivo`; **cockpit 2026-09 e 2026-10 em 2.299,95** |
| 2 | Reabrir | Volta a **61** meses (2022-10 a 2027-10), renovação a 2025-10-27, motivo do encerramento limpo, 48 pagamentos, cockpit inalterado. **Cliente idêntico ao estado inicial** |
| 3 | Salvar sem mudar o contrato (muda a razão social) | **61 meses preservadas**, `month_index` 1..61, soma 140.296,95, 48 pagamentos, prazo 36, renovação 2025-10-27 — corrigiu o defeito 12 |
| 4 | Salvar de novo | Idem. Repetíção do save não degrada nada |

O item 3 é o que interessa: **era exatamente o caminho destrutivo**. Sem a correção, as 61
linhas caíam para 36 e as 25 de faturamento real eram destruídas — voltavam porque o
horizonte rodava depois, o que é justamente o que escondia o defeito.

### O que o teste mudou no desenho

| Achado | Ajuste no documento |
|---|---|
| O mês corrente é cobrança emitada, não projeção | §1.2 ganhou uma **quarta** decisão, e `encerrar_series` ganhou `p_remover_mes_atual` |
| O mesmo `reason` servia à renegociação e ao encerramento | Nova coluna `encerramento_motivo`; §1.2 documenta por que |
| Encerrar zeria o MRR do histórico inteiro | `_financeiro_series_month` passou a contar série encerrada nos meses em que há cobrança |
| Ação reversível com cor de irreversível | `danger` passou a ser exclusivo do encerramento; §1.6 virou "Suspender cobrança" |
| Série encerrada é registro do que foi cobrado, não contrato a completar | Mantido deliberadamente: sem isso, salvar trunca o histórico. O campo passou a dizer "Meses registrados" com o prazo assinado ao lado |
| `due_date` não se perde ao recriar linha | **Não era problema.** Investigado e descartado — §4-bis |

### Limite desta verificação

- Só o cliente 21 cobriu renovação automática com término já ultrapassado. Não
  foi testado o caminho de `cobrar_mais_meses` em série com `auto_renew=false` desde a UI —
  coberto por SQL.
- O `ensure_series_horizon` roda em horário diário (dia 1, 00:05 UTC). Nenhum teste foi feito
  esperando o agendamento; os testes chamaram a função direto.
- `billing_exceptions` (concessão) continua sem cobertura de UI: §1.5 virou a Fase E, mas
  a substituição de `suspenso` por concessão nunca foi operada na tela.

---

## 5. Current Checkpoint

### Production state

- Fases A–E **não iniciadas**. Este documento está em `drafted`.
- Em produção desde 2026-10-01: `contract_months`, `contract_renewal` derivada, `ensure_series_horizon` como passo 5 do `monthly-sync`, `due_date` derivado por trigger, `get_series_vencidas()`, flag `contract_series_lifecycle`, alerta de série vencida com 2 ações.
- O cliente 21 foi materializado à mão durante o desenvolvimento — não depende de job para estar correto hoje. Estado verificado em 2026-10-03: 61 meses de recorrência (2022-10 a 2027-10) em valor único de 2.299,95, soma 140.296,95, 48 pagamentos, contrato de 36 meses com renovação 2025-10-27 e `auto_renew` ligado.

### Architectural decisions

| Decision | Rationale |
|---|---|
| SDD novo em vez de adendo no do cockpit | Reverte decisões registradas lá (3 estados de `billing_status`, "fatura zerada não existe") e é a primeira operação que apaga dado financeiro — perfil de risco que o do cockpit não cobre |
| `contract_renewal = NULL` no encerramento | Contrato encerrado não tem renovação. `contract_months` preservado: o prazo é fato, a renovação não existe |
| Apagar `contract_charges`, nunca `billing_payments` | Dinheiro que entrou não se apaga. Inclui meses futuros (pagamento adiantado) |
| Reabrir reconstrói em vez de restaurar snapshot | `ensure_series_horizon` replica a última linha — nenhum estado precisa ser guardado |
| Suspensão vira concessão, e `suspenso` sai do vocabulário | Zero é perda de receita invisível; a concessão torna a perda legível. Zero séries usam `suspenso` |
| "Não cobrar" global **não** interrompe a materialização | Reverter instantâneo, sem buraco até o próximo job |
| Alvo do horizonte e folga dentro da RPC | Com dois chamadores (form e job) seriam duas definições do mesmo número |
| Idempotência por guarda de `max(month_index)`, não `ON CONFLICT` | `installment_group IS NULL` em toda recorrência anula o índice único |
| Mês futuro nunca vira previsão | Todos os consumidores filtram `ref_month` exato; a folga é inerte |

---

## 6. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`.
- **`age(a, b)` returns `a - b`.** Inverte os argumentos e o índice do mês sai negativo. É a armadilha que já custou uma sessão.
- **`ref_month` é texto `YYYY-MM`.** `::date` direto estoura `22007`; parse com `|| '-01'`.
- **`installment_group IS NULL`** em toda linha de recorrência: NULLs são distintos num índice único, então `ON CONFLICT` nunca deduplica recorrência.
- **`billing_payments` não tem FK para `contract_charges`.** Sobrevive ao `delete`+`insert` do save — desejado — e vira órfã se o contrato encolher sem limpeza.
- **`cron.schedule` não desagenda o anterior.** `manage_cron_job` só desagenda pelo nome, então jobs criados fora dele sobrevivem — foi assim que `default-sync` se duplicou.
- **`cron.timezone` é GMT.** `1 0 1 * *` roda às 21:01 BRT, não 00:01.
- **Série encerrada é registro, não contrato a completar.** Validar contra `contract_months` num `status='encerrada'` trava o save.
- **Antes de chamar uma RPC nova em produção, valide a matemática com um `SELECT` somente-leitura.** `SELECT age(...)` custa nada; uma chamada errada em dado de produção, sim.

---

## 7. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — o que existe e o que ainda não foi criado.
2. Read **Section 1 (Regras de negócio)** antes de escrever código. As decisões ali foram tomadas com o solicitante e **não** são suas para mudar.
3. Identifique a **fase ativa** pelo status na seção 4. Uma fase por vez.
4. Implemente item por item, marcando ✅ ao concluir e verificar.
5. Rode `npm run build` ao fim da fase. **Nenhuma fase fecha sem isso.**
6. Preencha o **Implementation Log** com data, hash, arquivos e resumo.
7. Atualize a seção 5 com o estado real.

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

## History

| Versão | Data | Autor | Mudança |
|---|---|---|---|
| 0.1 | 2026-10-01 | DoncCX Hub | Draft inicial. Extraído do adendo v2.0 do SDD do cockpit após decisão de que mutação de série é assunto distinto de leitura pelo cockpit. Fases A–E com decisões de negócio validadas. Aguardando portão de validação. |

---

## Validation checklist — before publishing

- [x] Section 0 reflete o estado real (migration `20261001224706`, produção via `information_schema`/`pg_policies`/`cron.job`, `contractRules.js`, `useContractCharges.js`, `SettingsSyncStatus.jsx`)
- [x] Arquivos a tocar verificados como existentes
- [x] Contratos de dados usam nomes reais de coluna (`contract_months`, `contract_renewal`, `billing_status`, `billing_suspended_until`, `contract_charges.ref_month`, `billing_payments` PK tripla)
- [x] Gotchas incluem as armadilhas de projeto e as quatro específicas deste domínio
- [x] Convenção de linguagem (EN para instrução, PT para racional)
- [x] **Portão de validação com o Financeiro** — cumprido na prática: as decisões de §1 (escopo do "não cobrar", meses à frente no encerramento, preserção de pagamento, suspensão) foram confirmadas durante a verificação e ajustadas no texto conforme o que o teste mostrou