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

### Financeiro — validação da Fase 1 e hardening

Validação da Fase 1 contra a spec, com leitura das migrations e checagens de catálogo em produção. Achados corrigidos por duas migrations novas (as já aplicadas não foram editadas):

- **Vazamento de saldo:** `invoice_balance` rodava com privilégios do dono e contornava a RLS. Agora `security_invoker`. Hoje é latente (a tabela de faturas está vazia), mas viraria real na Fase 2.
- **Funções sensíveis expostas:** `assert_invoice_open` (devolvia o saldo em erro), `invoice_state`, `generate_invoice_number` e `refresh_client_delay_days` estavam executáveis por qualquer usuário logado. Revogadas.
- **Corrida no saldo:** duas baixas simultâneas podiam passar a mesma checagem e pagar a maior. Faturas agora travadas (`FOR UPDATE`) antes da leitura.
- **Numeração:** reemissão idempotente gastava número da sequência; corrigido.
- **Regras:** cancelar fatura com pagamento é recusado (estorne antes); ajuste para zero é recusado (use cancelamento); recorrência exige série.

Suíte de verificação versionada em `supabase/tests/billing_rebuild_phase1.sql` (10 checagens, transação com rollback). A afirmação "66 asserções verdes" da Fase 1 não tinha artefato no repositório; esta suíte é o que sobra verificável.

**Segunda passada de hardening** (revisão do commit `87a361d`). Duas lacunas fechadas:

- **Privilégios de tabela.** `authenticated` ainda tinha `SIUD` em `invoices`, `invoice_entries` e `billing_run_log`. A migration original revogou de `anon` e `public` mas não de `authenticated`, e o Supabase concede `ALL` por padrão em tabela nova — o `GRANT SELECT` que veio depois não remove o resto. O RLS bloqueava (só existem policies de SELECT), então nunca foi explorável, mas contradizia a spec e era a mesma classe latente da view `invoice_balance`. Corrigido em `billing_table_grants`, que também revogou `USAGE` na sequência de numeração: permitia queimar número de fatura com um `nextval` direto.
- **Auditoria exige usuário.** A migration `billing_audit_requires_user` que estava retida foi aplicada. Cancelar e ajustar sob `service_role` agora falham com mensagem clara em vez de erro de CHECK.

**Suíte expandida de 10 para 19 checagens** — voltaram a grade de datas (15 casos), o `discount_batch`, a baixa por perda separada de desconto, a validação de método, o estorno entre faturas, o pior atraso e os privilégios de tabela e de sequência. 19 passaram, 0 falharam, em transação revertida.

**Contiguidade das faixas de `series_rules` — resolvida.** Era o último item da Fase 1 e bloqueava a Fase 2: um buraco silencioso (`1-12` e depois `14-36`) significa competência sem regra — fatura não emitida, sem aviso, que é exatamente a classe de defeito que o rebuild existe para eliminar. `assert_series_rules_contiguous()` valida começar no mês 1, sem buraco, sem sobreposição e no máximo uma faixa aberta no fim; um constraint trigger **deferido** roda no COMMIT, porque o form escreve as faixas em várias linhas e o estado intermediário é inválido (inserir `14-36` antes de `1-12` tem buraco) — validar linha a linha rejeitaria um conjunto válido no fim.

A suíte foi de 19 para **26 checagens**: 26 passaram, 0 falharam.

### Financeiro — Fase 3: ciclo de vida migrado para o modelo novo

As RPCs de ciclo de vida passam a operar sobre `series_rules` + `invoices`. Duas das cinco não precisaram de nada — `reativar_series` e `set_nao_cobrar` só tocam `billing_status`.

**Correção pós-validação.** A primeira versão cancelava toda fatura futura do encerramento, parcelas eventuais inclusive, o que o comportamento antigo não fazia. Agora a escolha é explícita: `p_remover_futuro` cancela a recorrência, `p_cancelar_eventuais` cancela o eventual, ambos desmarcados por padrão, e `cancelar_eventual_grupo` cancela as parcelas de um eventual de uma vez. A checagem de papel vem antes do retorno de "já encerrada", e o diálogo perdeu duas frases que ficariam falsas. Suíte: 19 checagens, 0 falhas. Migration `20261005130000_billing_lifecycle_eventual_choice`.

**Em aberto:** `sales` ainda pode encerrar série sem poder cancelar as faturas futuras.

O que muda de conceito, e é a parte que importa:

- **Encerrar** antes **apagava** as linhas futuras de `contract_charges` — a projeção materializada. No modelo novo não existe projeção: a fatura nasce quando a competência fecha. Então encerrar agora **cancela as faturas futuras não liquidadas** e para a emissão pelo status. Fatura com lançamento não é cancelada — pagamento é fato, não projeção.
- O **eventual de encerramento** (multa, acerto) vira **fatura**, não linha de projeção.
- **Reabrir** devolve status e `contract_renewal` e **nada emite retroativamente**. Antes rematerializava a projeção via `ensure_series_horizon`; agora não há o que rematerializar.
- **Cobrar mais meses** só estende `billing_end` — o motor lê a janela na hora de emitir.

**Suíte de 14 checagens, 0 falhas**, incluindo o que mais importava: o **replay do cliente 21 real**. Encerrar e reabrir não toca o modelo antigo — 61 charges continuam 61, 48 pagamentos continuam 48, e a série volta exata ao estado anterior (`ativa` / `2025-10-27` / 36).

Desvios registrados: encerrar **não** trunca a janela da regra (o status já para a emissão, e truncar seria estado a restaurar no reopen); `ensure_series_horizon` **não** foi aposentada nesta fase (o cron e o botão ainda a chamam, e `contract_charges` só morre na Fase 7) — o que importa é que o ciclo de vida parou de chamá-la. Fica uma **limitação transitória deliberada**: uma ação de ciclo de vida não aparece no cockpit **antigo** depois desta fase, porque ele lê `contract_charges`. A janela é curta — a Fase 4 reescreve o cockpit.

### Financeiro — `issue_invoice` vira primitivo interno

A validação da Fase 2 deixou uma decisão pendente: `issue_invoice` era executável por `authenticated`, então um usuário de financeiro podia emitir fatura de valor arbitrário chamando a RPC direto — pulando o gate do F0, o gate de completude do uso e a fórmula do §3.2.

Revogado de `authenticated`; fica só para `service_role`. O motor (`close_competencia`) é `SECURITY DEFINER` e roda como dono, então não dependia desse grant, e nada no frontend nem nas Edge Functions chamava a função — verificado por varredura. Os gates existem contra **erro**, não contra má-fé, e um caminho que os pula por acidente é um footgun.

**Consequência:** fatura avulsa deixa de ser possível pela interface. Se virar necessidade, merece RPC própria com regra, não o primitivo cru.

Junto: `search_path` fixado em `competencia_index` e `billing_due_date`, os dois helpers da Fase 1 que não tinham — são `IMMUTABLE` e não leem tabela, então o risco era baixo, mas é higiene. A checagem 10 da suíte da Fase 1 passou a cobrir o `issue_invoice`.

### Segurança — `manage_cron_job` era executável por `anon`

Achado na validação da Fase 2 do faturamento, mas de outro domínio (sync) — por isso migration e commit separados.

`manage_cron_job` é `SECURITY DEFINER`, **não tinha guard nenhum**, e `anon` tinha `EXECUTE`. A ação `schedule` aceita `p_url` arbitrário e agenda um job que faz `net.http_post` para essa URL com o header `x-webhook-secret` lido de `vault.decrypted_secrets`. Com a chave anon — pública, está no bundle — qualquer pessoa **exfiltrava o segredo do webhook de sync** no primeiro minuto, e ainda podia dar `unschedule` nos jobs reais, parando o sync.

**Por que a auditoria de junho não pegou:** `manage_cron_job` nasceu em `20260701000002`, depois da auditoria; e o §2.4 daquela revisou `search_path` das funções existentes, não quem pode executá-las.

Revogado de `anon` e `authenticated`, mantido para `service_role` — que é quem chama (`monthly-sync`, `sync-schedule`). **Nota de execução:** o primeiro `REVOKE` não pegou, porque o ACL tinha o grant para `PUBLIC`; foi preciso revogar de `PUBLIC` e reconceder explicitamente.

Na mesma varredura, **`create_default_fases`**: escreve em `onboarding_fases` e `onboardings.fase_atual_id`, era executável por `anon`, e **não é chamada por ninguém** — nem frontend, nem Edge Function, nem trigger, nem cron. Revogada; a remoção ficou como TD-016.

`set_impersonation` e `clear_impersonation` perderam o acesso de `anon` por higiene — a primeira já exige `role='admin'` internamente.

**Não tocadas de propósito:** `get_user_role` (as policies de RLS a chamam, inclusive para anon), `get_effective_role` (wrapper dela), `register_report_view` e `check_report_access` (o `ReportPublicPage` roda como anon).

Suíte nova: `supabase/tests/security_function_grants.sql`, 4 checagens, 0 falhas. Guarda a regra — função `SECURITY DEFINER` sem guard interno não pode ser executável por `anon` nem por `authenticated`. O TD-017 propõe que ela vire varredura dinâmica no CI, porque o padrão se repete: função nova nasce com os grants default do Supabase e ninguém revisa.

### Financeiro — Fase 2: o motor de emissão

`close_competencia(competencia, modo, force, series_ids)` fecha uma competência: calcula o valor de cada série ativa e emite. Dois modos — **preview** não persiste nada e lista o que seria emitido e o que seria pulado com o motivo; **real** emite e registra em `billing_run_log`.

Cobre a regra de parada da recorrência (as cinco combinações de `billing_end` × `contract_months` × `auto_renew`), o gate de completude do uso (bloqueia em snapshot ausente ou pendente, com `force` para sobrepor), os eventuais parcelados, o lock de concorrência (`pg_advisory_xact_lock`) e o gate do F0 — emissão de competência anterior ao corte exige a flag `billing_f0_approved`, que está ligada com a aprovação registrada.

**Suíte de 28 checagens, 0 falhas**, em transação revertida. Ela encontrou **três defeitos reais** antes de qualquer emissão:

- O CHECK de `billing_type` não permitia `fixo` — a terceira base do SDD não podia ser cadastrada.
- O motor comparava `billing_type = 'os'`, mas o banco guarda **`por_os`**. O Todimo cairia no ramo de licença e a fatura sairia R$ 310,73 em vez de R$ 6.641,13. É o mesmo erro que eu tinha cometido no gerador do F0.
- A fórmula do valor **ignorava a faixa** para série usage-driven: eu calculava `unit × max(piso, uso)`, que só coincide com o correto quando a faixa vale exatamente `unit × piso`. Uma faixa percentual — "os 12 primeiros meses a 50%" — era silenciosamente ignorada e o cliente pagava preço cheio. Corrigido para `base + excedente`, que é o que o engine vivo faz.

O §3.2 do SDD foi corrigido junto, e a checagem de paridade contra `_financeiro_series_month` passa para 2026-06 a 2026-09.

Produção conferida: 0 faturas, 0 lançamentos, tabelas antigas intactas (134 charges, 82 payments). O motor não tem faixas para ler até o wizard carregá-las (Fase 5).

**Validação da Fase 2.** Suítes rodadas em produção, em transação revertida: Fase 1 com 26 checagens, Fase 2 com 30. Dois defeitos confirmados por sondas e corrigidos na migration `20261005010000`:

- **Resumo contado como fatura.** A linha-resumo do `billing_run_log` gravava `outcome='emitida'`. Uma fatura aparecia como três linhas emitidas. Agora é `resumo`.
- **Parcela zero abortava o fechamento.** Uma parcela eventual de valor zero levantava `22023` e cancelava a competência inteira. Agora é `pulada / valor_zero`.

Verificado e sem mudança: fórmula `base + excedente`, regra de parada, calendário de eventuais, contrato de retorno (§4.2), paridade com o motor antigo (check 28), gate do F0 e a contiguidade das faixas.

**Em aberto, decisão pendente:** `issue_invoice` é executável por `authenticated`. Um usuário de financeiro pode emitir fatura de valor arbitrário fora do motor, pulando o gate do F0, o gate de completude do uso e a fórmula do §3.2. Confirmado por sonda, revertida. Se a emissão deve passar só pelo motor, a correção é revogar o EXECUTE de `authenticated`; o motor roda como dono e não depende desse grant.

**Desvio registrado:** o Edge Function para o caminho de cron fica para a Fase 6 — o cockpit da Fase 4 chama a RPC direto, então o corte não depende dele.

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
