# Module — Health Score

## Purpose

`src/lib/healthScore.js` provides a utility to calculate a client’s health score based on usage, support, relationship, financial, and project dimensions. The score is expressed as a total (0‑100) and as individual dimension scores (0‑20).

## Responsibilities

- Compute individual dimension scores (uso, suporte, relacionamento, financeiro, projeto) each ranging from 0‑20.
- Apply health‑rule modifiers to each dimension.
- Weight dimensions according to the client’s stage group and optional custom weights.
- Aggregate a final total score (0‑100) and expose applied rule details for traceability.

## Module Structure

- **Exported Function** `calculateHealthScore(client, rules = [], weights = null)` – orchestrates the calculation.
- **Helpers**: `clamp`, `applyRule`, `isNeutralStage`, `resolveStageGroup`, `calcTemperatura`.
- **Dimension Calculators**: `calcUso`, `calcSuporte`, `calcRelacionamento`, `calcFinanceiro`, `calcProjeto`.

## Core Algorithm Overview

1. **Contract Check** – If `client.contract_active` is `false`, return a zeroed result.
2. **Stage Group Resolution** – `resolveStageGroup` determines one of `"onboarding"`, `"producao"`, or `"producao_sem_projeto"` for weighting.
3. **Weight Loading** – Default weights are 20 for each dimension (temperature 0) unless overridden via the `weights` argument.
4. **Dimension Evaluation** – Each dimension calculator returns `{ score, appliedRules }`.
5. **Weight Application** – Convert each 0‑20 score to a weighted contribution: `(score / 20) * weight`.
6. **Total Calculation** – Sum contributions, round, clamp to 0‑100.
7. **Result Assembly** – Return total, individual scores, temperature, stageGroup, and applied rule mappings.

## Data Flow

```
client ──► resolveStageGroup ──► stageGroup
      │                         │
      │                         ▼
      │                weights[stageGroup] (or defaults)
      │                         │
      ▼                         ▼
calcUso ──► score & rules ──►┐
calcSuporte ─► score & rules ──►│
calcRelacionamento ─► …   │
calcFinanceiro ─► …       │   → weighted contributions → total
calcProjeto ─► …          │
calcTemperatura ──► temp ──┘
```

## Dependencies

- No external libraries; operates on plain JavaScript objects.
- Relies on the shape of client data (usage, support, activities, projects, milestones, etc.) as stored in the backend.
- Consumes health‑rule objects `{ rule_key, label, points }` supplied from the database.

## Integration Points

- Called from UI components displaying client health dashboards.
- May be used in scheduled reports or alerts.
- Accepts custom `weights` to adjust importance per business needs.

## Main User Flows

1. **Standard Scoring** – Pass a full client object and rule set; receive a detailed health report.
2. **Weighted Scoring** – Provide a `weights` map to prioritize certain dimensions for specific client segments.
3. **Zero‑Score Shortcut** – If the client’s contract is inactive, the function short‑circuits to a zeroed result.

## Edge Cases

- Returns a total of `0` and all dimension scores `0` when `client.contract_active === false`.
- Neutral stages (onboarding, estabilização, churned, etc.) bypass usage, support, relationship, and project calculations, defaulting those scores to `20`.
- Temperature is only considered if updated within the last 30 days.
- All applied rules are collected in the `appliedRules` map for auditability.

## Known Risks

- Relies heavily on the exact structure of client data; missing fields may lead to default scores.
- Complex rule set changes require updating the `ALWAYS_INCLUDE` set and rule keys accordingly.
- No validation of `weights` values – malformed weights could skew the total.

## Future Improvements

- Add explicit TypeScript typings for input and output structures.
- Introduce validation of the `rules` and `weights` arguments.
- Provide a streaming API for large client datasets.
- Decouple rule lookup into a separate service for easier updates.

---
*Generated from source code; behavior reflects exactly what the implementation provides.*
