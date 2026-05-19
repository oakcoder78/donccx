# SDD — Greeting Engine

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the Greeting Engine subproject inside doncCX Hub. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully to understand the current state, architecture, constraints, and active phase.
2. **During implementation:** Follow the checklist for the active phase item-by-item and validate changes continuously.
3. **After implementation:** Fill the Implementation Log, update Section 0, and update the Current Checkpoint.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** doncCX production dashboard
- **SDD stage:** `Active`
- **Active phase:** Phase A — Narrative Stabilization

### What already exists related to this work

The Greeting Engine already evolved from a simple random greeting system into a contextual narrative runtime.

Implemented foundations:

- Deterministic greeting composition
- Temporal provider
- Identity provider
- Operational provider
- Fragment pipeline
- Contextual orchestration
- Priority-based composition
- Contextual debug infrastructure
- Minimal observability runtime
- Narrative tone governance
- Dashboard integration
- Deterministic seed generation
- Context-aware composition
- Fallback path

Existing documentation:

- `greeting-engine.md`
- `greeting-engine-content.md`
- `greeting-engine-runtime.md`
- `greeting-engine-roadmap.md` (historical — superseded by v2)
- `greeting-engine-roadmap-v2.md` (current strategic direction)
- `greeting-engine-phase-1-spec.md`
- `greeting-engine-debug.md`
- `greeting-engine-tone-guide.md`

Existing runtime structure:

```text
DashboardPage.jsx
    ↓
useGreeting() (hooks/useGreeting.ts)
    ↓
compose() (compose.ts)
    ↓
seed.ts ──► generateSeed / deterministicIndex
    ↓
content/temporal.ts   ──► getTemporalFragments
content/identity.ts   ──► getIdentityFragments
content/operational.ts──► getOperationalFragments
    ↓
mergeFragments()
    ↓
priority resolution
    ↓
observability.ts ──► observeGreeting
    ↓
primary (text) + contextual (extra) output
```

### What does NOT exist yet — deferred capabilities

Per the strategic direction (`greeting-engine-roadmap-v2.md`), the following remain intentionally deferred:

- AI-generated narratives
- Weather layer
- Environmental awareness
- Predictive intelligence
- Behavioral adaptation
- User-specific personalization learning
- Remote content management (Phase C)
- Production analytics
- Narrative telemetry
- Autonomous recommendations
- Contextual expansion (Phase D)
- Narrative intelligence (Phase F)

Current focus is:

```text
Narrative stabilization via real-world observation (Phase A)
```

### Files to be touched

| File | Change type |
|---|---|---|
| `src/lib/greeting-engine/types.ts` | Modify — future context contracts |
| `src/lib/greeting-engine/compose.ts` | Modify — orchestration evolution |
| `src/lib/greeting-engine/seed.ts` | Modify — deterministic seed runtime |
| `src/lib/greeting-engine/debug.ts` | Modify — contextual validation |
| `src/lib/greeting-engine/observability.ts` | Modify — lightweight dev logs |
| `src/lib/greeting-engine/index.ts` | Modify — barrel exports |
| `src/lib/greeting-engine/content/temporal.ts` | Modify — narrative refinement |
| `src/lib/greeting-engine/content/identity.ts` | Modify — narrative refinement |
| `src/lib/greeting-engine/content/operational.ts` | Modify — narrative refinement |
| `src/lib/greeting-engine/hooks/useGreeting.ts` | Modify — runtime evolution |
| `src/components/dashboard/DashboardPage.jsx` | Modify — dashboard integration |
| `docs/modules/greeting-engine*.md` | Modify — documentation updates |

> **Nota:** `temporal.ts`, `identity.ts`, `operational.ts` no nível raiz de `greeting-engine/` foram removidos na Fase 1 de refatoração (2026-05-18). Os arquivos reais estão em `content/`. Não recriá-los.

---

## 1. Global Definitions

### Narrative Philosophy

The Greeting Engine exists to create:

```text
silent contextual operational atmosphere
```

The system must NEVER:

- behave like a chatbot
- behave like a copiloto
- over-personalize
- simulate emotional intimacy
- generate fake urgency
- dominate dashboard attention
- compete with operational metrics

The system SHOULD:

- enrich atmosphere
- suggest operational context
- humanize the interface subtly
- remain calm and professional
- feel naturally integrated into the dashboard

---

### Layer Definitions

| Layer | Purpose |
|---|---|
| `temporal` | Time-of-day and time-context atmosphere |
| `identity` | User-role and identity context |
| `operational` | Portfolio and operational state |

---

### Runtime Output Structure

| Field | Purpose |
|---|---|
| `text` | Primary greeting headline |
| `extra` | Contextual narrative line |
| `fragments` | Internal composition fragments |
| `metadata` | Runtime orchestration metadata |

---

### Deterministic Runtime Rules

The Greeting Engine MUST remain deterministic.

Rules:

- same user + same date = same narrative
- runtime cannot use Math.random()
- selection must be seed-driven
- composition must remain reproducible

---

## 2. Design System Reference

### Dashboard Hierarchy

The dashboard greeting area follows a strict semantic hierarchy:

```text
Line 1 → Temporal greeting
Line 2 → Date context
Line 3 → Contextual narrative
```

Example:

```text
Boa noite, Jorge
Quinta-feira, 7 de maio de 2026
Carteira equilibrada
```

Rules:

- Line 1 remains fixed/temporal
- Line 2 remains informational/date-driven
- Line 3 is controlled by Greeting Engine contextual orchestration

The Greeting Engine must NEVER take over the main headline.

---

### Tone Reference

The official narrative governance lives in:

```text
docs/modules/greeting-engine-tone-guide.md
```

All future content pools MUST follow that document.

---

## 3. Component Tree

```text
DashboardPage
└── Greeting Header
    ├── Primary Greeting (temporal)
    ├── Date Context
    └── Contextual Narrative

Greeting Engine
├── useGreeting()
├── composeGreeting()
├── Providers
│   ├── temporal
│   ├── identity
│   └── operational
├── Fragment Pipeline
├── Seed Runtime
├── Debug Runtime
└── Observability Runtime
```

---

## 4. Data Contracts

### GreetingContext

```ts
interface GreetingContext {
  profile: {
    id: string
    name: string
    role: 'admin' | 'manager' | 'csm' | 'analyst'
    gender?: 'male' | 'female' | 'other'
    birth_date?: string   // ISO date
    created_at: string    // for tenure calculation
  }
  operational?: {
    criticalClients?: number
  }
  temporal: {
    hour: number          // 0-23
    dayOfWeek: number     // 0-6
    month: number         // 0-11
    isBirthday: boolean
    isAnniversary: boolean
  }
}

export type GreetingContextInput = Pick<GreetingContext, 'profile' | 'temporal' | 'operational'>
```

---

### GreetingFragment

```ts
interface GreetingFragment {
  layer: 'temporal' | 'identity' | 'operational'
  text: string
  weight: number
  deterministic: boolean  // true if non-random
}
```

---

### GreetingResult

```ts
interface GreetingResult {
  text: string
  extra?: string            // optional contextual line
  fragments: GreetingFragment[]
  metadata: {
    generatedAt: string     // ISO timestamp
    seed: string            // for deterministic reproduction
    layers: string[]        // layers that contributed
    fallback: boolean       // true if fallback path was used
  }
}
```

---

### Operational Thresholds

| Critical clients | Category | Weight |
|---|---|---|
| `0` | clean | 40 |
| `1-2` | mild | 45 |
| `3+` | attention | 50 |

Implementation in `content/operational.ts:31-40`.

Rules:

- no explicit alerts
- no imperative language
- no operational panic
- no telemetry-style phrasing

---

## 5. Narrative Rules

### Approved Characteristics

- subtle
- operational
- observational
- calm
- professional
- atmospheric
- restrained

---

### Forbidden Characteristics

- motivational
- gamified
- chatbot-like
- emotionally manipulative
- imperative
- over-personalized
- urgency-driven
- celebratory

---

### Approved Examples

```text
Carteira equilibrada
Clientes em atenção
Movimento relevante na carteira
Clientes em foco
Gestão em dia
```

---

### Forbidden Examples

```text
Você precisa agir AGORA!
Seus clientes te esperam
Hora de revisar o painel
ALERTA! carteira em risco
Bora transformar dados em ação?
```

---

## 6. Runtime Architecture

### Composition Flow

```text
context
    ↓
providers
    ↓
fragment generation
    ↓
mergeFragments()
    ↓
priority resolution
    ↓
primary + extra selection
```

---

### Priority Rules

Fragments compete via weight. Higher weight wins contextual selection.

All weights as implemented:

| Fragment | Weight | File |
|---|---|---|
| Temporal (weekday) | 5 | `content/temporal.ts:52` |
| Temporal (saudação) | 10 | `content/temporal.ts:43` |
| Identity (role) | 20 | `content/identity.ts:77` |
| Identity (anniversary) | 30 | `content/identity.ts:66` |
| Operational (clean) | 40 | `content/operational.ts:33` |
| Operational (mild) | 45 | `content/operational.ts:36` |
| Identity (birthday) | 50 | `content/identity.ts:57` |
| Operational (attention) | 50 | `content/operational.ts:39` |

> **Nota:** `identity.birthday` e `operational.attention` compartilham weight 50. Quando ambos ocorrem, o comportamento de seleção é determinado pela ordem de merge e pelo seed. Atualmente não há desempate explícito — decisão arquitetural consciente. Se necessário no futuro, implementar priority tiebreaker.

---

### Silence Behavior

Silence is valid.

Providers may return:

```ts
[]
```

without causing runtime failure.

Fallbacks should occur only when:

- all providers return silence
- runtime context is invalid

---

## 7. Debug & Observability

### Debug Runtime

File:

```text
src/lib/greeting-engine/debug.ts
```

Purpose:

- contextual simulation
- narrative QA
- scenario validation
- screenshot/demo support

Rules:

- development-only
- no production impact
- no persistence
- no feature flags infrastructure

---

### Observability Runtime

File:

```text
src/lib/greeting-engine/observability.ts
```

Purpose:

- lightweight contextual debugging
- orchestration visibility
- narrative review

Rules:

- development-only
- structured logs only
- no telemetry
- no analytics
- no persistence

---

## 8. Implementation Phases

> **Roadmap v2:** A Greeting Engine foi revisada para o roadmap v2.0 (`greeting-engine-roadmap-v2.md`), substituindo as fases numeradas originais por uma estrutura letterada (A-G). A tabela abaixo mapeia as fases históricas para a nova estrutura.

| Histórico (SDD v1) | Fase v2 | Status |
|---|---|---|
| Phase 1 — Foundational Runtime | Pre-v2 infrastructure | Complete |
| Phase 1.1 — Architectural Alignment | Pre-v2 alignment | Complete |
| Phase 2 — Operational Narrative Layer | Pre-v2 layer | Complete |
| Phase 3 — Narrative Governance | Pre-v2 governance | Complete |
| Phase 4 — Observation & Narrative Maturation | **Phase A — Narrative Stabilization** (incl. governance docs) | **Active** |
| Phase 5 — Future Contextual Layers | Superseded by Phases C, D, E, F | Planned |

---

### Historical Phases (pre-v2)

The following phases are **complete** and represent the foundational evolution of the Greeting Engine. They are preserved as historical record.

---

### Phase 1 — Foundational Runtime

**Status:** Complete

**Rationale:** Estabeleceu o runtime determinístico básico, substituindo o antigo sistema de frases aleatórias.

**Delivered:** temporal provider, identity provider, seed runtime, composer, dashboard migration.

---

### Phase 1.1 — Architectural Alignment

**Status:** Complete

**Rationale:** Corrigiu desalinhamentos entre arquitetura documentada e implementação real.

**Delivered:** provider isolation, fragment pipeline, metadata correction, silence behavior.

---

### Phase 2 — Operational Narrative Layer

**Status:** Complete

**Rationale:** Validou a escalabilidade contextual da arquitetura com a primeira layer contextual real.

**Delivered:** operational provider, priority resolution, contextual orchestration.

---

### Phase 3 — Narrative Governance

**Status:** Complete

**Rationale:** Consolidou a identidade editorial, prevenindo deriva para chatbot/copilot behavior.

**Delivered:** tone guide, content cleanup, anti-pattern documentation.

---

### Active Phase — Phase A: Narrative Stabilization

**Status:** In progress

**Rationale:** Esta fase foca em observar o comportamento do sistema em uso real para refinar a qualidade narrativa antes de expandir capacidades. Arquitetura não é mais o gargalo — qualidade editorial é.

**Scope:**

- repetition analysis
- semantic fatigue
- contextual awkwardness
- subtlety refinement
- rhythm consistency
- operational atmosphere

**Deliverables:**

- narrative observation logs
- editorial refinements
- phrase pool cleanup
- contextual balance adjustments

#### Checklist

- [x] Minimal observability runtime
- [x] Contextual debug logs
- [ ] Real-world observation period
- [ ] Narrative repetition review
- [ ] Semantic fatigue review
- [ ] Contextual refinement pass
- [ ] Governance documentation
- [ ] Editorial review process defined
- [ ] Narrative validation checklist
- [ ] Pool classification standards
- [ ] Build validation

---

### Phase C: Content Externalization

**Status:** Planned

**Dependency:** Phase A (narrative quality baseline)

**Goal:** Decouple narrative content from runtime implementation, enabling non-developer content management.

**Deliverables:**

- content registry
- externalized pools (Supabase)
- runtime-safe loaders
- validation tooling
- content versioning

**Constraints:** Must NOT introduce runtime instability, compromise determinism, or create editorial chaos.

#### Checklist

- [ ] External content storage design
- [ ] Runtime-safe loaders
- [ ] Content versioning strategy
- [ ] Validation tooling
- [ ] Build validation

#### Implementation Log (Phase C)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase D: Contextual Expansion

**Status:** Planned

**Dependency:** Phase A + C

**Goal:** Expand contextual awareness carefully with new layers.

**Potential contexts:**

- onboarding stage
- lifecycle stage
- renewal proximity
- account maturity
- portfolio evolution
- activity rhythm

**Constraints:** New layers must remain subtle, avoid over-personalization, avoid behavioral creepiness, and preserve calm operational tone.

#### Checklist

- [ ] Contextual expansion strategy
- [ ] New layer architecture review
- [ ] First new layer implemented
- [ ] Second new layer implemented
- [ ] Build validation

#### Implementation Log (Phase D)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase E: Environmental Awareness

**Status:** Planned

**Dependency:** Phase A + D

**Goal:** Introduce environmental context carefully and minimally.

**Potential inputs:** weather, seasonal changes, regional holidays, workday patterns, time context refinement.

**Critical constraint:** Must NEVER feel gimmicky, assistant-like, or "smart for the sake of smart".

#### Checklist

- [ ] Environmental layer design
- [ ] External data integration (if any)
- [ ] Graceful fallback handling
- [ ] Build validation

#### Implementation Log (Phase E)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

### Phase F: Narrative Intelligence

**Status:** Planned

**Dependency:** Phase A through E

**Goal:** Introduce controlled narrative intelligence without transforming the system into a copiloto.

**Potential capabilities:** contextual summarization, semantic synthesis, narrative prioritization, adaptive orchestration.

**Constraints:** Must NEVER become conversational, agentic, generate operational recommendations, simulate personality, or behave like chat-based AI.

#### Checklist

- [ ] Narrative intelligence design
- [ ] Semantic synthesis implementation
- [ ] Adaptive orchestration
- [ ] Build validation

#### Implementation Log (Phase F)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |

---

> **Nota:** Phase G (Autonomous Context Systems) foi removida do roadmap por contradizer o princípio "MUST NEVER become agentic / behave like a copiloto". Orquestração autônoma de múltiplos sinais é comportamento de copiloto disfarçado. Se houver demanda futura, revisitar com design explícito que não viole os princípios do sistema.

---

## 9. Current Checkpoint

### Production state

The Greeting Engine is fully integrated into the dashboard.

Architecture is **mature** — the primary bottleneck is now **editorial quality**, not technical capability.

Current runtime includes:

- contextual orchestration
- deterministic runtime
- operational narrative layer
- contextual debug infrastructure
- lightweight observability
- narrative tone governance

Active phase:

```text
Phase A — Narrative Stabilization
```

Next phases (in order):

```text
A — Narrative Stabilization (active, incl. governance) → C — Content Externalization
→ D — Contextual Expansion → E — Environmental Awareness → F — Narrative Intelligence
```

### Architectural decisions

| Decision | Rationale |
|---|---|
| Greeting Engine must remain subtle | Evitar comportamento de copiloto/chatbot |
| Deterministic runtime only | Garantir consistência contextual |
| Silence is valid | Nem todo contexto precisa gerar narrativa |
| Dashboard hierarchy remains fixed | Preservar semântica visual da dashboard |
| No AI generation yet | O tom do produto ainda está maturando |
| Development-only observability | Evitar transformar narrativa em telemetry |
| Tone guide governs all content | Impedir deriva narrativa futura |
| Operational narratives avoid urgency | Produto deve transmitir calma operacional |
| Architecture is not the bottleneck | Foco em maturidade editorial, não expansão técnica |
| Observe before expanding | Real-world usage deve guiar próximas fases |

---

## 10. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`.
- **Greeting Engine file layout:** `temporal.ts`, `identity.ts`, `operational.ts` no nível raiz de `greeting-engine/` foram removidos na Fase 1 de refatoração. `compose.ts` importa direto de `content/*`. Não recriar os wrappers.
- **Greeting Engine:** never introduce chatbot tone, copiloto tone, or fake emotional intimacy.
- **Narrative tone:** avoid urgency, imperatives, motivational language, and gamification.
- **Determinism:** never use `Math.random()` in runtime composition.
- **Observability:** logs must remain development-only and lightweight.
- **Dashboard hierarchy:** contextual narrative never replaces primary greeting headline.
- **Debug infrastructure:** keep minimal; avoid feature-flag-system evolution.

---

## 11. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read **Section 8 (Phase Mapping)** — understand how v2 phases relate to historical work.
3. Identify the **active phase** via its checklist status (currently **Phase A — Narrative Stabilization**).
4. Respect phase dependencies — do NOT start Phase C before Phase A is complete unless explicitly authorized.
5. Implement item by item. Mark ✅ when done and verified.
6. After each significant item, run `npm run build` to ensure nothing broke.
7. At the end of the phase, fill in the **Implementation Log**.
8. Update the **Checkpoint** section with the new state.

### Technical Summary Template (fill at the end of each phase)

```text
### Technical Summary — Phase X

Commits: hash1, hash2
Files created: [list]
Files modified: [list]
Files deleted: [list]

Decisions:
- [decision and rationale]

Issues found:
- [problem and solution]

Pending items:
- [items not covered or deferred]
```

---

### Resume Guidance

Before implementing any future Greeting Engine work:

1. Read:
   - `greeting-engine-roadmap-v2.md` (strategic direction)
   - `greeting-engine-tone-guide.md`
   - `greeting-engine-runtime.md`
   - `greeting-engine-debug.md`

2. Review:
   - current providers
   - content pools
   - observability runtime
   - dashboard hierarchy
   - Phase A checklist for in-progress items

3. Verify:
   - tone consistency
   - deterministic behavior
   - contextual subtlety

4. Avoid:
   - feature creep
   - copiloto behavior
   - emotional AI tone
   - overengineering
   - skipping phase dependencies

The current priority is:

```text
Narrative stabilization before feature expansion
```

