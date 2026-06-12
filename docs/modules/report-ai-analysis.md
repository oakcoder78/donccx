# Module — Report AI Analysis

### Purpose
Provide per-section AI-powered text analysis ("Gerar análise") for operational report sections. The analyst writes custom instructions or accepts a standard summary; the AI returns a concise 3-sentence callout that appears as a highlighted block in the final report.

Available in 6 section types: `escala`, `qualidade_operacao`, `indicadores_operacionais`, `categorias_ocorrencia`, `desempenho_operacional`, `suporte`.

### Responsibilities
- Generate a short (≤3 frases) analytical callout for any supported section type
- Accept optional custom instructions (`analysisContext`) — when present, replaces the default summary and auto-includes a field-value dump
- Accept optional `includeRawData` checkbox — when ON, appends all resolved field values (including chart data) to the prompt
- Feed the generated text into the section's `callout` field, editable by the user before finalizing

### Key Components

| File | Role |
|---|---|
| `src/lib/reportAiService.js` | Prompt builder (`mountUserContent`), system prompt selection, `openrouter-proxy` invocation with 3× retry |
| `src/pages/ReportEditorPage.jsx` | UI: button, checkbox, context textarea, `handleGenerateAnalysis` handler, `getSectionValues` / `getAllSectionValues` |
| `src/lib/reportFields.js` | Field registry — single source of truth for available fields per section type |
| `supabase/functions/openrouter-proxy/index.ts` | Edge function that proxies to OpenRouter with model fallback chain and failure logging |

### Data Interaction

**Tables:**
- `client_usage` — `os_created`, `active_users` (used by escala fields)
- `client_operational_reports` — `data_os`, `data_produtividade` JSONB (used by all operational sections)
- `client_support` — tickets, SLA (used by suporte section)
- `ai_model_logs` — per-model attempt logs (written by `openrouter-proxy`)

**APIs:**
- `{SUPABASE_URL}/functions/v1/openrouter-proxy` — edge function, accepts `{ messages }`, returns AI response

### Prompt Structure

**System prompt — two variants:**
- **Standard** (no custom instructions): generic CS analyst prompt
- **Strict** (customContext present): instructs model to analyze ONLY what the user asked, ignore unrelated metrics

**User prompt — built by `mountUserContent()`:**
```
Without customContext:    <section-specific summary>
With customContext:       <user's instruction text>
                          + Dados completos disponíveis: <field dump>
With includeRawData:      <summary> + <field dump with chart data>
```

**Section summaries — cherry-picked KPIs per type:**

| Section | Fields in summary |
|---|---|
| `escala` | `os_criadas`, `delta_os_criadas`, `usuarios_ativos`, `delta_usuarios_ativos`, `produtos_montados`, `delta_produtos_montados`, `pct_montagem`, `pct_assistencia` |
| `qualidade_operacao` | `taxa_sucesso`, `total_sucesso`, `relatos_imprevistos`, `delta_imprevistos`, `pontualidade`, `atraso_medio_dias` |
| `indicadores_operacionais` | `tempo_execucao` (→ min), `delta_tempo_execucao`, `tempo_transito` (→ min) |
| `categorias_ocorrencia` | Generic text (fields are chart-only, not text-summarizable) |
| `desempenho_operacional` | `indice_produtividade`, `total_profissionais` |
| `suporte` | `tickets_abertos`, `tickets_resolvidos`, `sla_primeira_resposta`, `taxa_resolucao`, `n1_pct`, `n2_pct`, `n3_pct` |

### Data Dump

When included (`customContext` or `includeRawData`), all resolved fields from `reportFields.js` for the given section are serialized as `key: value` pairs. Object/array values use `JSON.stringify`; number values remain numeric; delta/percent/duration formats use `formatFieldValue()`.

### Behavior Matrix

| customContext | includeRawData | Prompt sent to AI |
|---|---|---|
| empty | OFF | Section summary only |
| empty | ON | Summary + all field values (including charts) |
| filled | OFF | User instruction + auto-dump of all field values |
| filled | ON | User instruction + all field values (incl. charts) |

When `customContext` is filled, the system prompt switches to strict mode: "Analyze ONLY what was asked. Ignore any metric not directly related to the request."

### Resolved Field Keys (per section)

Field keys match `reportFields.js` — when the registry was refactored, `mountUserContent()` was updated synchronously. Key mapping for historical reference:

| Old name (broken) | Current key (correct) |
|---|---|
| `total_os` | `os_criadas` |
| `active_users` | `usuarios_ativos` |
| `total_produtos` | `produtos_montados` |
| `taxa_conclusao` | `taxa_sucesso` |
| `com_ocorrencia` | `relatos_imprevistos` |
| `execucao_min` | `tempo_execucao` (hours, converted to min in prompt) |
| `tickets_opened` | `tickets_abertos` |
| `sla` | `sla_primeira_resposta` |

### UI Behavior
- Button, checkbox, and context textarea appear inside the callout block of each section editor
- Button is disabled when `operationalData.current` is null
- `generatingAnalysis` state tracks loading per section (prevents double-clicks)
- After generation, the AI response populates the callout textarea — the analyst can edit freely
- `includeRawData` and `analysisContext` are persisted per-section in `report.content`

### Dependencies
- **`reportFields.js`** — field registry (`getSectionFields`, `resolveAllFields`)
- **`reportAiService.js`** — prompt construction, AI invocation
- **`reportGenerator.js`** — `calloutBlock()` renders the analysis in final HTML
- **`openrouter-proxy`** — edge function, model fallback, failure logging
- **`supabaseClient.js`** — auth session (access token for edge function call)
- **`components/ui/Button`** — standardized button component
