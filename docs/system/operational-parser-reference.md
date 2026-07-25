# Operational Parser — Cálculos de Dados

## Pipeline

```
n8n (CSV) → parseOs.ts / parseProdutividade.ts → JSON → operational-report-sync (EF) → client_operational_reports
```

O n8n dispara POST `/run` com `{ cliente, mes }`, lê 2 CSVs do Donc, executa os parsers e envia os JSONs resultantes para a Edge Function `operational-report-sync`, que faz UPSERT em `client_operational_reports`.

---

## parseOs.ts — Ordens de Serviço

**Input:** `Os.csv` (delimitador `;`)

### Classificação de Status (`classifyStatus`)

| Status CSV | Classificação |
|------------|---------------|
| `"Finalizado -"` (exato) | `sucesso` |
| `"Finalizado - " + texto` | `sucesso` |
| `"Cancelado -" + texto` | `cancelado` |
| `"Problema Geral -" + texto` | `ocorrencia` |
| `"Reagendado pelo Profissional -" + texto` | `ocorrencia` |
| `"Encaminhada -" / "Encaminhada"` | `liberada_nao_iniciada` |
| `"Aguardando Profissional"` | `nao_liberada` |
| `"Em Rota -" / "Retirado -" / "No Cliente -" / "Chegando -"` | `iniciada_nao_concluida` |
| Qualquer outro | `outros` |

**Atenção:** `"Problema Geral"` → `ocorrencia`, **não** `cancelado`.

### Deduplicação

- `total_os = osMap.size` (conta **1 por Id**, ignora duplicatas)
- Linhas de continuação (sem `Id`) são linhas de produto — herdam dados da OS-pai e adicionam código/produto/valor/quantidade

### `sub_status`

Agrega OS por tipo + motivo (subtipos com contagem). Usado no gráfico "Distribuição por Status" do relatório.

### `taxa_sucesso` — fórmula oficial

```
taxa_sucesso = sucesso / (sucesso + ocorrencia + cancelado + atrasadas_nao_concluidas) × 100
```

Onde `atrasadas_nao_concluidas` = OS em `liberada_nao_iniciada` **ou** `iniciada_nao_concluida` com `Data_Agendamento < hoje`.

**Os demais status (`nao_liberada`, `liberada_nao_iniciada` não atrasadas, `outros`) são excluídos** do cálculo — não entraram em fluxo de execução ainda.

Exemplo com dados reais (cliente 4, 2026-05):
```
sucesso = 6.917
ocorrencia = 255
cancelado = 103
atrasadas_nao_concluidas = 15

taxa_sucesso = 6917 / (6917 + 255 + 103 + 15) × 100 = 94,9%
```

### `tempo_medio_execucao_horas`

Média de `(Data_Finalizacao - Data_Inicio)` em horas. Apenas OS com ambas as datas.

### `tempo_medio_atendimento_dias`

Média de `(Data_Finalizacao - Data_Criacao)` em dias. Apenas OS com ambas as datas.

### Pontualidade

Compara `Data_Inicio` vs `Data_Agendamento` (apenas datas, sem hora):
- `Data_Inicio <= Data_Agendamento` → `no_prazo++`
- `Data_Inicio > Data_Agendamento` → `atrasadas++`, soma dias de atraso
- `percentual_pontualidade = no_prazo / (no_prazo + atrasadas) × 100`
- `atraso_medio_dias = total_dias_atraso / atrasadas`

---

## parseProdutividade.ts — Produtividade

**Input:** `RelatorioProdutividade.csv` (delimitador `;`)

### Conversões

| Função | Exemplo | Resultado |
|--------|---------|-----------|
| `parseTimeToMinutes` | `"02:30"` | `150` min |
| `parseProdutividadeIndex` | `"85,5%"` | `85.5` |

### Médias Ponderadas (peso = DiasTrabalhados)

```
peso = dias_trabalhados (se 0, usa 1)
media = Σ(valor × peso) / Σ(peso)
```

### Campos Calculados

| Campo | Origem |
|-------|--------|
| `indice_produtividade_medio` | Média ponderada do índice |
| `tempo_execucao_medio_minutos` | Média ponderada do tempo de execução |
| `tempo_transito_medio_minutos` | Média ponderada do tempo em trânsito |
| `tempo_ocioso_medio_minutos` | Média ponderada do tempo ocioso |

---

## Mapa: Parser → Frontend (`reportFields.js`)

### `data_os.sumario`

| Chave parser | reportFields resolve | OK? |
|-------------|----------------------|-----|
| `total_os` | `escala.quantidade_os` (via `sumario.total_os`) | ✓ |
| `taxa_sucesso` | `qualidade_operacao.taxa_sucesso` (via `sumario.taxa_sucesso`) | ✓ |
| `taxa_sucesso` | `desempenho_operacional.taxa_sucesso_geral` (via `sumario.taxa_sucesso`) | ✓ |
| `sub_status` | `categorias_ocorrencia.sub_status_breakdown` (chart) | ✓ |
| `motivos_cancelamento` | `categorias_ocorrencia.motivos_cancelamento` (chart) | ✓ |
| `por_tipo` | `escala.os_por_tipo` / `escala.media_os_por_tipo` | ✓ |

### `data_os.operacional`

| Chave parser | reportFields resolve | OK? |
|-------------|----------------------|-----|
| `total_sucesso` | `qualidade_operacao.total_sucesso` | ✓ |
| `total_ocorrencias` | `qualidade_operacao.relatos_imprevistos` | ✓ |
| `atrasadas_nao_concluidas` | `qualidade_operacao.atrasadas_nao_concluidas` | ✓ |
| `os_sem_inicio` | `qualidade_operacao.os_sem_inicio` | ✓ |
| `os_pedido_peca` | `qualidade_operacao.os_pedido_peca` | ✓ |
| `total_nao_liberada` | `qualidade_operacao.nao_liberadas` | ✓ |
| `total_liberada_nao_iniciada` | `qualidade_operacao.liberada_nao_iniciada` | ✓ |
| `media_produtos_por_os` | `indicadores_operacionais.produtos_por_os` | ✓ |

### `data_os.sub_status`

| Chave parser | reportFields resolve | OK? |
|-------------|----------------------|-----|
| `cancelado.total` | `qualidade_operacao.os_canceladas` | ✓ (adicionado 2026-07) |
| `iniciada_nao_concluida.total` | `qualidade_operacao.os_iniciadas_nao_concluidas` | ✓ (adicionado 2026-07) |

### `data_os.tempos`

| Chave parser | reportFields resolve | OK? |
|-------------|----------------------|-----|
| `tempo_medio_execucao_horas` | `indicadores_operacionais.tempo_execucao` | ✓ |
| `tempo_medio_atendimento_dias` | `indicadores_operacionais.tempo_atendimento` | ✓ |
| `pontualidade.percentual_pontualidade` | `qualidade_operacao.pontualidade` | ✓ |
| `pontualidade.no_prazo` | `qualidade_operacao.no_prazo` | ✓ |
| `pontualidade.atrasadas` | `qualidade_operacao.atrasadas` | ✓ |
| `pontualidade.atraso_medio_dias` | `qualidade_operacao.atraso_medio_dias` | ✓ |

### `data_produtividade.sumario`

| Chave parser | reportFields resolve | OK? |
|-------------|----------------------|-----|
| `tempo_transito_medio_minutos` | `indicadores_operacionais.tempo_transito` (via `/ 60`) | ✓ |
| `indice_produtividade_medio` | `desempenho_operacional.indice_produtividade` | ✓ |
| `total_profissionais` | `desempenho_operacional.total_profissionais` | ✓ |

---

## Análise de Discrepâncias

### 1. `taxa_sucesso` — Fórmula do parser vs expectativa

A fórmula oficial do parser é:
```
taxa_sucesso = sucesso / (sucesso + ocorrencia + cancelado + atrasadas_nao_concluidas) × 100
```

O frontend já lê este valor via `data_os.sumario.taxa_sucesso` (pré-calculado). **Não precisa alterar.**

O `total_os` (ex: 7.911) inclui `nao_liberada` + `liberada_nao_iniciada` (não atrasadas) + `outros`, que **não entram** no cálculo da taxa. É por isso que `sucesso / total_os` ≠ `taxa_sucesso`.

### 2. Gap de OS não mapeadas

Na versão anterior dos dados, `sucesso + ocorrencia + nao_liberada + liberada_nao_iniciada` = 7.014, mas `total_os` = 7.112. O gap de 98 era composto por:
- `cancelado` (~103, varia conforme mês)
- `iniciada_nao_concluida` (~3)
- `outros` (~0)

Agora expostos como fields: `os_canceladas` e `os_iniciadas_nao_concluidas`.

### 3. `tempo_medio_atendimento_dias` — Label renomeado

O parser calcula como `(Data_Finalizacao - Data_Criacao)` em dias. O campo `tempo_atendimento` foi renomeado para **"Tempo médio para atribuição"**.

### 4. `tempo_medio_execucao_horas` — Fallback

O campo `tempo_execucao` prefere `data_os.tempos.tempo_medio_execucao_horas`, com fallback para `data_produtividade.sumario.tempo_execucao_medio_minutos / 60`.

### 5. `pontualidade` — Só datas, sem hora

Compara apenas a **data** (sem hora) entre `Data_Inicio` e `Data_Agendamento`. Iniciar no mesmo dia do agendamento conta como pontual, independente do horário.
