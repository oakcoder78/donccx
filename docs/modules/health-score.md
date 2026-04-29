# Module — Health Score

## Purpose
`src/lib/healthScore.js` provides a utility to calculate a client's health score based on 6 dimensions: Uso, Suporte, Relacionamento, Financeiro, Projeto, and Temperatura CSM. The score is expressed as a total (0‑100) and as individual dimension scores (0‑20).

## Responsibilities
- Compute individual dimension scores each ranging from 0‑20.
- Apply health‑rule modifiers to each dimension.
- Weight dimensions according to the client's stage group via health_dimension_weights.
- Aggregate a final total score (0‑100) and expose applied rule details for traceability.

## Module Structure
- **Exported Function** `calculateHealthScore(client, rules = [], weights = null)` – orchestrates the calculation.
- **Helpers**: `clamp`, `applyRule`, `isNeutralStage`, `resolveStageGroup`, `calcTemperatura`.
- **Dimension Calculators**: `calcUso`, `calcSuporte`, `calcRelacionamento`, `calcFinanceiro`, `calcProjeto`.

## Stage Groups and Weights
The module determines the stage group via `resolveStageGroup`:
- **onboarding** – Client is in the onboarding stage. Weights: Uso=0, Suporte=0, Relacionamento=0, Financeiro=20, Projeto=20, Temperatura=0
- **producao** – Client in production (Estabilização or Fluindo). Weights: Uso=20, Suporte=20, Relacionamento=20, Financeiro=20, Projeto=20, Temperatura=20 (if applicable)
- **producao_sem_projeto** – Client in production but no active project.

Additionally, neutral stages (`sem estágio`, `onboarding`, `estabilização`, `em espera`, `churned`) bypass Uso/Suporte/Relacionamento/Projeto calculations, defaulting those scores to 20.

Custom weights can be supplied via the `weights` argument.

## Core Algorithm Overview
1. **Contract Check** – If `client.contract_active` is `false`, return a zeroed result.
2. **Stage Group Resolution** – `resolveStageGroup` determines the group for weighting.
3. **Weight Loading** – Default weights per group unless overridden via `weights`.
4. **Dimension Evaluation** – Each dimension calculator returns `{ score, appliedRules }`.
5. **Weight Application** – Convert each 0‑20 score to a weighted contribution: `(score / 20) * weight`.
6. **Total Calculation** – Sum contributions, round, clamp to 0‑100.
7. **Result Assembly** – Return total, individual scores, temperature, stageGroup, and applied rule mappings.

## Dimensões de Projeto (Project Dimension Rules)
The `calcProjeto` function applies the following rules based on onboarding data:
| Rule Key | Descrição | Condição |
|---------|-----------|----------|
| `no_proj` | Nenhum projeto ativo | No active onboardings |
| `onb_travado` | Onboarding bloqueado | Any onboarding status='travado' |
| `onb_atencao` | Onboarding requer atenção | Any onboarding status='atencao' |
| `mp_late` | Fase com prazo vencido | Up to 3 late fases (planned_end < today, status ≠ concluida) |
| `onb_atividade_vencida` | Atividade de onboarding vencida | Any activity with due_date < today and status ≠ concluida |
| `ob_late` | Go-Live antigo com fases abertas | Go-Live concluded >90 days ago AND other phases still pending |
| `projeto_atrasado` | Projeto com atraso geral | General project delay rule |

The `ob_late` rule specifically checks:
```js
const goLiveFase = onboarding.onboarding_fases.find(f => f.onboarding_fase_types?.name === 'Go-Live')
if (goLiveFase?.occurred_at) {
  const daysSinceGoLive = (Date.now() - new Date(goLiveFase.occurred_at).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceGoLive > 90) {
    const hasPendingFases = onboarding.onboarding_fases.some(f => f.status !== 'concluida')
    if (hasPendingFases) mod += applyRule(rules, 'ob_late', appliedRules)
  }
}
```

## Temperatura CSM
`calcTemperatura` returns a value 0‑20 based on `client.csm_temperature` and `client.temperature_updated_at`:
- Returns 0 if `temperature_updated_at` is null or older than 30 days.
- Otherwise returns the raw temperature value (typically 0‑10 scaled to 0‑20).

## Data Flow
```
client ──► resolveStageGroup ──► stageGroup
      │                         │
      │                         ▼
      │                weights[stageGroup] (or defaults)
      │                         │
      ▼                         ▼
calcUso ──► score & rules ──►┐
calcSuporte ──► score & rules ──►│
calcRelacionamento ──► …   │
calcFinanceiro ──► …       │   → weighted contributions → total
calcProjeto ──► …          │
calcTemperatura ──► temp ──┘
```

## Dependencies
- No external libraries; operates on plain JavaScript objects.
- Relies on the shape of client data (usage, support, activities, projects, onboardings, onboarding_fases, etc.) as stored in the backend.
- Consumes health‑rule objects `{ rule_key, label, points }` supplied from the database.

## Integration Points
- Called from UI components displaying client health dashboards.
- May be used in scheduled reports or alerts.
- Accepts custom `weights` to adjust importance per business needs.

## Main User Flows
1. **Standard Scoring** – Pass a full client object and rule set; receive a detailed health report.
2. **Weighted Scoring** – Provide a `weights` map to prioritize certain dimensions for specific client segments.
3. **Zero‑Score Shortcut** – If the client's contract is inactive, the function short‑circuits to a zeroed result.

## Edge Cases
- Returns a total of `0` and all dimension scores `0` when `client.contract_active === false`.
- Neutral stages bypass usage, support, relationship, and project calculations, defaulting those scores to `20`.
- Temperature is only considered if updated within the last 30 days.
- All applied rules are collected in the `appliedRules` map for auditability.
- The `ob_late` rule only applies when Go-Live has an `occurred_at` date, not just planned.

## Known Risks
- Relies heavily on the exact structure of client data; missing fields may lead to default scores.
- Complex rule set changes require updating the `ALWAYS_INCLUDE` set and rule keys accordingly.
- No validation of `weights` values – malformed weights could skew the total.

## Future Improvements
- Add explicit TypeScript typings for input and output structures.
- Introduce validation of the `rules` and `weights` arguments.
- Provide a streaming API for large client datasets.
- Decouple rule lookup into a separate service for easier updates.
- Add more project dimension rules (e.g., activity completion rates).

---
*Generated from source code; behavior reflects exactly what the implementation provides.*