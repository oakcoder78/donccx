# ADR-001 — Rebuild do módulo de faturamento em vez de patch

**Status:** Accepted (2026-10-03)
**Contexto:** `docs/sdd/financeiro-faturamento-sdd.md`
**Decisores:** solicitante (dono do processo financeiro) + implementação

---

## Contexto

Em 2026-10-03, ao validar o cliente 18 no cockpit, encontramos **sete defeitos** no módulo financeiro. Seis estavam visíveis ou latentes na tela; o sétimo foi descoberto ao escrever o SDD.

| # | Defeito | Natureza |
|---|---|---|
| 1 | A linha da série mostra `billing_start` sob o rótulo "vence dia" | render |
| 2 | Uma implantação de R$ 15.000 aparece como "adimplente" | modelo de dados |
| 3 | Não existe indicador de atraso quando há status | render |
| 4 | A baixa em lote fabrica `paid_at = due_date` | render |
| 5 | Junho mostra "não sincronizou" quando sincronizou parcialmente | fonte de dados |
| 6 | `clients.delay_days` copia o atraso do mês mais recente, não o pior | trigger |
| 7 | **O engine subfatura cliente multi-módulo** — suprime o excedente de toda série que não seja `kind='original'` | engine |

Além disso, um requisito de negócio confirmado pelo solicitante não é suportado pelo modelo atual: **pagamento parcial**. O cliente pode pagar parte de um eventual e parte de um MRR, ou pagar um e não o outro. O modelo guarda um `status` por `(cliente, série, competência)` e não tem onde registrar valor.

O dado é descartável: 3 séries com cobrança, 134 linhas em `contract_charges`, 82 em `billing_payments`. Nenhum histórico contábil depende do Hub — o controle ainda vive em planilha, e o corte para o Hub está previsto para nov/2026.

---

## Decisão

**Rebuild da fundação**, não patch dos sete defeitos.

A causa comum dos defeitos 2 e 7 (e da impossibilidade de pagamento parcial) é arquitetural: `contract_charges` conflaciona **plano comercial** e **documento emitido**, e `billing_payments` guarda **status** onde a realidade tem **valores**. Os outros cinco defeitos são pontuais, mas seriam corrigidos dentro de uma estrutura que precisa ser trocada de qualquer forma.

O desenho novo separa:

- **Regra** (`series_rules`) — o plano: faixas de preço por mês de contrato
- **Fatura** (`invoices`) — o documento emitido, com número, competência, valor e vencimento
- **Lançamentos** (`invoice_entries`) — pagamento, desconto, baixa e estorno, por valor

E o estado da fatura passa a ser **derivado** do saldo, não gravado.

---

## Alternativas consideradas

### Alternativa A — Patch dos sete defeitos, mantendo o modelo

| Item | Trabalho | Custo |
|---|---|---|
| 1 | Trocar `billing_start` por `due_date` no render | 1 arquivo, ~10 linhas |
| 3 | Derivar atraso de `due_date` em vez de status | render + 1 campo no RPC |
| 4 | Remover o `forcePaid` que inventa a data | 1 função |
| 5 | Trocar a fonte da lista de meses | 1 hook |
| 6 | Mudar o trigger para "pior atraso" | 1 migration pequena |
| 2 | **Não tem patch.** O status por competência não distingue duas faturas | exigiria nova tabela |
| 7 | Remover a guarda `kind='original'` | 1 migration, **mas** só é seguro com pagamento por fatura |
| parcial | **Não tem patch.** Um status não representa valor | exigiria novo modelo de pagamento |

**Resultado:** seis dos sete poderiam ser corrigidos pontualmente, mas os dois que importam — adimplência por fatura e pagamento parcial — exigiriam, cada um, uma tabela nova de lançamentos. Ou seja, a alternativa A **converge para o rebuild** assim que se tenta satisfazer o requisito de parcial.

### Alternativa B — Manter o modelo e registrar parcial em texto livre

Registrar "pagou 9.000 de 15.000" numa observação, mantendo o status binário.

**Rejeitada:** o saldo não seria calculável, o atraso não refletiria o valor devido, e a conferência contra a planilha (que é o objetivo declarado do módulo) não teria como fechar. Seria uma planilha com aparência de sistema.

### Alternativa C — Adiar o rebuild, corrigir só o visível, e refazer depois

**Rejeitada:** o corte para nov/2026 exige que o Hub substitua a planilha. Entrar no corte com um modelo que não suporta parcial significa migrar os dados duas vezes — uma agora e outra no rebuild.

---

## Consequências

**Positivas:**
- Pagamento parcial passa a ser representável
- Adimplência por fatura, com estado derivado
- O horizonte materializado deixa de existir como dado (elimina a cauda, o truncamento no save e a chave sintética)
- Defeitos 1–7 saem por construção, não por remendo
- `clients.delay_days` passa a refletir o pior atraso, corrigindo dashboard, health score, scoring e Gravity

**Negativas / custos:**
- Sete fases em vez de sete patches; o caminho crítico até nov/2026 é maior
- 18 arquivos de frontend tocados, incluindo dois que ninguém tinha mapeado (`BillingSchedule.jsx`, `ClientSubDados.jsx`)
- As RPCs de ciclo de vida, verificadas em produção em 2026-10-03, precisam ser migradas (Fase 3) — com risco de regressão sobre um comportamento recém-validado
- O dado atual é abandonado; o histórico entra pelo wizard, conferido contra o F0

**Mitigações:**
- As tabelas antigas **não são dropadas até a Fase 7**, com gate verificável de zero referências
- Snapshot versionado antes de qualquer alteração
- Replay dos baselines do cliente 21 (61 meses, 48 pagamentos, MRR R$ 2.299,95) como teste de regressão obrigatório
- Fixture guiada com dado sujo, replicando as condições que produziram os 13 defeitos do módulo de ciclo de vida

---

## Notas

- O defeito 7 é **latente**: nenhum cliente tem duas séries hoje, então ele nunca produziu uma fatura errada. Vai produzir no dia em que o primeiro módulo for lançado. Isso é parte da urgência.
- A pergunta "rebuild ou patch?" foi levantada por uma revisão adversarial do SDD (arquiteto), que apontou que a alegação "sete defeitos, uma causa" era exagerada — quatro dos defeitos não derivam da conflação. A revisão está correta quanto ao exagero, e este ADR corrige a alegação: **a justificativa é o pagamento parcial e a adimplência por fatura**, não os sete defeitos. Os outros cinco são consequência de corrigir a fundação no mesmo movimento, não a razão dele.
