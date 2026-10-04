---
status: vivo
owner: financeiro
verified: 2026-10-03
expires: 2026-11-03
supersedes: []
---

# Faturamento — Conferência da Carga Histórica (F0)

## O que é este artefato

A task **F0** do `docs/sdd/financeiro-faturamento-sdd.md` §5.1. É o **gate da Fase 2**: o motor de emissão se recusa a emitir competência histórica enquanto este documento não tiver uma versão aprovada.

Ele existe porque **não há planilha para conciliar**. O módulo substitui uma planilha que não temos acesso, então a única fonte do "valor certo" é quem opera o financeiro. Este documento apresenta o que o Hub **calcula** a partir da configuração das séries, e o solicitante marca o que está errado.

O detalhe linha a linha está em **`faturamento-carga-historica.csv`** (582 competências, 18 séries, 2021-03 a 2026-09). Este markdown traz o resumo por cliente, os totais e as anomalias — a revisão é sobre os totais e as exceções, não sobre cada linha.

**Formato do CSV:** separador `;` e decimal `,` — abre direto no Excel pt-BR. As colunas são: `cliente; serie; tipo; piso; unit; competencia; mes; uso; uso_real; snapshot; instancias; base; excedente; valor; vencimento; tem_regra`. A coluna `uso_real` diz se a competência tem o dado de uso relevante para a série; quando é `nao`, o valor saiu do piso.

## Como conferir

1. Leia a tabela de resumo por cliente. Para cada um, confira: **valor unitário**, **piso**, **mês inicial** e **valor total calculado**.
2. Leia a tabela de anomalias. Cada linha é uma condição que precisa de decisão.
3. Abra o CSV apenas onde o resumo levantar dúvida.
4. Marque no documento (ou responda ao agente) o que está errado. Correções vão para a **fonte** — a configuração da série — não para o markdown.

## Regra aplicada no cálculo

```
fatura(série, competência) = unit × greatest(piso, uso)
```

- `uso` é **do cliente** e compartilhado entre todas as séries: licenças ativas (agregando todas as instâncias) para séries por licença; OS criadas para séries por OS
- Sem dado de uso na competência → `uso = 0` → fatura = `unit × piso` (o piso)
- **"Com uso" na tabela abaixo** conta competências com o dado **relevante para a série** — licenças ativas para série por licença, OS criadas para série por OS. Um mês com snapshot só de OS não conta para uma série por licença
- Série travada (`usage_driven=false`) → fatura = `unit × piso`, uso ignorado
- `unit × piso = 0` → nenhuma fatura é emitida (não existe documento de R$ 0,00)
- Vencimento = dia `due_day` da competência, com clamp no fim do mês

## Resumo por cliente

| Cliente | Tipo | Unit | Piso | Meses | Com uso | Base | Excedente | **Valor** | De → Até | Regra |
|---|---|---|---|---|---|---|---|---|---|---|
| CENTER KENNEDY | licença | 59,90 | 50 | 33 | 4 | 98.835,00 | **239,60** | **99.074,60** | 2024-01 → 2026-09 | sim |
| Center Móveis | licença | 54,86 | 350 | 1 | 1 | 19.201,00 | **1.481,22** | **20.682,22** | 2026-09 → 2026-09 | não |
| LOJÃO RIO DO PEIXE | licença | 43,75 | 80 | 44 | 4 | 154.000,00 | **1.093,75** | **155.093,75** | 2023-02 → 2026-09 | não |
| LOJAS ADELINO | licença | 56,25 | 32 | 51 | 4 | 91.800,00 | 0,00 | **91.800,00** | 2022-07 → 2026-09 | não |
| LOJAS BERLANDA | licença | 32,25 | 300 | 46 | 4 | 445.050,00 | **11.868,00** | **456.918,00** | 2022-12 → 2026-09 | não |
| LOJAS CYBELAR | licença | 60,00 | 50 | 16 | 4 | 48.000,00 | **480,00** | **48.480,00** | 2025-06 → 2026-09 | não |
| Lojas Dujuca | licença | 56,30 | 70 | 2 | 2 | 7.882,00 | **844,50** | **8.726,50** | 2026-08 → 2026-09 | não |
| Lojas Eletromóveis | licença | 51,11 | 45 | 48 | 4 | 110.397,60 | 0,00 | **110.397,60** | 2022-10 → 2026-09 | sim |
| LOJAS KOERICH | licença | 40,00 | 400 | 67 | 4 | 1.072.000,00 | 0,00 | **1.072.000,00** | 2021-03 → 2026-09 | não |
| LOJAS MM | licença | 29,17 | 600 | 24 | 4 | 420.000,48 | 0,00 | **420.000,48** | 2024-10 → 2026-09 | não |
| Lojas Simonetti | licença | 30,00 | 700 | 4 | 4 | 84.000,00 | 0,00 | **84.000,00** | 2026-06 → 2026-09 | não |
| LOJAS SIPOLATTI | licença | 64,50 | 110 | 6 | 4 | 42.570,00 | **27.412,50** | **69.982,50** | 2026-04 → 2026-09 | não |
| LOJAS SOLAR | licença | 45,00 | 60 | 48 | 4 | 129.600,00 | **6.165,00** | **135.765,00** | 2022-10 → 2026-09 | não |
| **LOJAS TODIMO** | **OS** | 1,93 | 0 | 58 | 10 | 0,00 | **33.001,07** | **33.001,07** | 2021-12 → 2026-09 | não |
| MULTILOJA | licença | 58,50 | 200 | 42 | 4 | 491.400,00 | **13.396,50** | **504.796,50** | 2023-04 → 2026-09 | não |
| OSIRNET | licença | 93,50 | 25 | 31 | 4 | 72.462,50 | **3.740,00** | **76.202,50** | 2024-03 → 2026-09 | não |
| SOLAR MAGAZINE | licença | 36,15 | 130 | 60 | 4 | 281.970,00 | **3.361,95** | **285.331,95** | 2021-10 → 2026-09 | não |
| VALDIR MÓVEIS | licença | 100,00 | 40 | 1 | 0 | 4.000,00 | 0,00 | **4.000,00** | 2026-09 → 2026-09 | sim |

**Regra = sim** significa que a série tem recorrência cadastrada em `contract_charges` (só 18, 21 e 29). As outras 15 tiveram o valor calculado direto da configuração da série — é a regra do SDD §1.2, mas **não está registrada em lugar nenhum**, e é o wizard da Fase 5 que vai criá-la.

## Totais

| | |
|---|---|
| Competências calculadas | **582** |
| **Com uso real** (dado relevante para a série) | **69** (12%) |
| **No piso** (sem dado de uso — fatura = `unit × piso`) | **513** (88%) |
| Com algum snapshot de uso (inclui meses só de OS) | 140 |
| Soma da base | R$ 3.573.168,58 |
| **Soma do excedente** | **R$ 103.084,09** |
| **Soma total** | **R$ 3.676.252,67** |
| Competências com valor zero (sem fatura) | 48 |
| Séries sem regra cadastrada | 15 de 18 |

## Anomalias que precisam de decisão

| Condição | Clientes | O que fazer |
|---|---|---|
| **Índice `IGMP`** (provável typo de `IGPM`) | Eletromóveis, Berlanda, Adelino, Solar Magazine, Koerich | Normalizar na carga |
| **`contract_months` NULL** | 15 séries | O wizard exige o prazo ou marca "mês a mês" explicitamente |
| **Sem regra cadastrada** | 15 séries | O wizard cria a regra; hoje o valor foi inferido de `unit × piso` |
| **Piso 0** | Todimo | Confirmar que o contrato é só consumo. Gera 48 competências de valor zero → nenhuma fatura |
| **Duas instâncias por mês** | LOJAS MM, Simonetti | O uso é somado (correto). Confirmar que é isso mesmo — são duas unidades do mesmo CNPJ? |
| **`auto_renew = false`** | Valdir Móveis | Único contrato com fim definido (2029-08). A parada da recorrência depende do `contract_months`, que existe (36) |
| **Zero uso em toda a série** | Valdir Móveis | Em implantação. A partir de out/2026 o uso deve aparecer |

## O achado que mais precisa de você

**R$ 103.084,09 de excedente** aparece no cálculo — e nunca foi faturado, porque as três séries materializadas (18, 21, 29) foram lançadas no valor do piso.

Os maiores:

| Cliente | Excedente | Origem |
|---|---|---|
| **LOJAS TODIMO** | **R$ 33.001,07** | 17.099 OS em 10 meses × R$ 1,93. Piso 0, então **tudo** é excedente |
| LOJAS SIPOLATTI | R$ 27.412,50 | 425 licenças acima do piso em 6 meses |
| MULTILOJA | R$ 13.396,50 | 229 acima do piso em 10 meses |
| LOJAS BERLANDA | R$ 11.868,00 | 368 acima do piso em 10 meses |
| LOJAS SOLAR | R$ 6.165,00 | 137 acima do piso |
| OSIRNET | R$ 3.740,00 | 40 acima do piso |
| SOLAR MAGAZINE | R$ 3.361,95 | 93 acima do piso |
| Center Móveis | R$ 1.481,22 | 27 acima do piso (1 mês) |
| LOJÃO RIO DO PEIXE | R$ 1.093,75 | 25 acima do piso |
| Lojas Dujuca | R$ 844,50 | 15 acima do piso |
| LOJAS CYBELAR | R$ 480,00 | 8 acima do piso |
| CENTER KENNEDY | R$ 239,60 | 1 licença × 4 meses × R$ 59,90 |

**Pergunta:** esse excedente foi cobrado de alguma forma fora do Hub? Se foi, a fatura histórica entra com ele (o valor calculado está certo). Se não foi, é receita não faturada e a decisão é sua: faturar retroativo, ou registrar como renúncia.

## Ressalvas sobre o cálculo

- **513 das 582 competências não têm dado de uso** e foram calculadas no piso. Para as séries por licença, o dado só existe de **jun/2026** em diante (4 meses); para OS, de **dez/2025** (10 meses). Antes disso, o piso é a melhor estimativa — mas se algum cliente pagou excedente nesses meses, o valor está subestimado e só você sabe. É por isso que a coluna "Com uso" tem 4 na maioria das linhas, e não 10: os outros 6 meses têm snapshot de OS, que não serve para uma série por licença.
- **O uso é uma foto do mês**, agregando instâncias. Se um cliente teve instâncias criadas ou removidas no meio do período, a soma pode não refletir o que foi cobrado.
- **O cálculo ignora reajuste.** Nenhuma série tem `correction_percent`; se houve reajuste aplicado na planilha, o `unit` atual pode não valer para o passado.
- **Mês cheio.** Séries iniciadas no meio do mês faturam o mês inteiro (SDD §1.14).

## Aprovação

Este documento precisa de: **aprovador, data e versão** antes de a Fase 2 emitir qualquer competência histórica.

| Campo | Valor |
|---|---|
| Versão | 1 (2026-10-03) |
| Aprovado por | — |
| Data | — |
| Observações | — |
