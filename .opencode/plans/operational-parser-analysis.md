# Análise: Parser Operacional vs Frontend

## Pipeline

```
n8n (CSV) → parseOs.ts / parseProdutividade.ts → JSON → operational-report-sync (EF) → client_operational_reports
```

## Fórmulas do Parser

### taxa_sucesso ← a que você quer entender

```
taxa_sucesso = sucesso / (sucesso + ocorrencia + cancelado + atrasadas_nao_concluidas) × 100
```

Onde `atrasadas_nao_concluidas` = OS em `liberada_nao_iniciada` ou `iniciada_nao_concluida` com `Data_Agendamento < hoje`.

**Isso explica os 94,9%.** O denominador **não** inclui:
- `nao_liberada` (412) — OS nem liberadas
- `liberada_nao_iniciada` sem atraso (parte das 221)
- `outros`

O `total_os = 7.911` inclui **todas** as OS, inclusive as que ainda não entraram em fluxo.

### Demais cálculos

| Campo | Cálculo |
|-------|---------|
| `tempo_medio_execucao_horas` | Média `(Data_Finalizacao - Data_Inicio)` em horas |
| `tempo_medio_atendimento_dias` | Média `(Data_Finalizacao - Data_Criacao)` em dias |
| `pontualidade` | `no_prazo / (no_prazo + atrasadas) × 100` (compara só datas) |
| `atraso_medio_dias` | `total_dias_atraso / atrasadas` |
| Produtividade | Médias ponderadas por `DiasTrabalhados` |

## Mapa Parser → Frontend

### `data_os.sumario`
| Parser | Frontend | OK |
|--------|----------|----|
| `total_os` | `escala.quantidade_os` | ✓ |
| `taxa_sucesso` | `qualidade.taxa_sucesso` | ✓ lê o pré-calculado |
| `sub_status` | `categorias_ocorrencia.sub_status_breakdown` | ✓ |

### `data_os.operacional`
| Parser | Frontend | OK |
|--------|----------|----|
| `total_sucesso` | `qualidade.total_sucesso` | ✓ |
| `total_ocorrencias` | `qualidade.relatos_imprevistos` | ✓ |
| `total_nao_liberada` | `qualidade.nao_liberadas` | ✓ |
| `total_liberada_nao_iniciada` | `qualidade.liberada_nao_iniciada` | ✓ |
| `atrasadas_nao_concluidas` | `qualidade.atrasadas_nao_concluidas` | ✓ |
| `media_produtos_por_os` | `indicadores.produtos_por_os` | ✓ |

### `data_os.tempos`
| Parser | Frontend | OK |
|--------|----------|----|
| `tempo_medio_execucao_horas` | `indicadores.tempo_execucao` | ✓ |
| `tempo_medio_atendimento_dias` | `indicadores.tempo_atendimento` | ✓ renomeado |
| `pontualidade.*` | `qualidade.pontualidade` etc | ✓ |

### `data_produtividade`
| Parser | Frontend | OK |
|--------|----------|----|
| `tempo_transito_medio_minutos` | `indicadores.tempo_transito` (/60) | ✓ |
| `indice_produtividade_medio` | `desempenho.indice_produtividade` | ✓ |

## Gap de 98 OS

Antes da sincronia, o gap era `cancelado (103) + iniciada_nao_concluida (3) + outros (0)` = ~106. Esses sub-status existem no `sub_status` mas não têm field resolve individual.

## Conclusões

1. **`taxa_sucesso` já está correta** — o frontend lê o valor pré-calculado pelo parser, que usa a fórmula oficial. A diferença que você notou era porque o denominador não é `total_os`, e sim `sucesso + ocorrencia + cancelado + atrasadas_nao_concluidas`.

2. **Nenhum resolve em reportFields.js precisa ser alterado** — todos os campos lidos do parser batem com os cálculos.

3. **Ajustes opcionais:**
   - Adicionar field `os_canceladas` (expõe `sub_status.cancelado.total`)
   - Adicionar field `os_iniciadas_nao_concluidas` (expõe `sub_status.iniciada_nao_concluida.total`)

4. **O documento completo deve ser salvo em** `docs/system/operational-parser-reference.md` após aprovação.
