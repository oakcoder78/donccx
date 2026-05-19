# Greeting Engine Implementation Roadmap

> [!IMPORTANT]
> Historical roadmap.
>
> The Greeting Engine evolved significantly after runtime maturation and narrative governance phases.
>
> The original roadmap below documents the foundational vision and early architectural assumptions of the subsystem.
>
> For the current strategic direction, contextual maturity model, and long-term evolution strategy, see:
>
> ```text
> docs/modules/greeting-engine-roadmap-v2.md
> ```
>
> The v2 roadmap reflects the current understanding of the Greeting Engine as:
>
> ```text
> contextual narrative infrastructure
> ```
>
> rather than a simple greeting feature.

---

## Purpose

This document defines the incremental implementation roadmap for the Greeting Engine inside doncCX Hub.

Its purpose is to:
- guide implementation sequencing
- prevent premature complexity
- protect architectural integrity
- establish delivery boundaries
- align technical evolution with product maturity

The Greeting Engine must evolve intentionally as contextual infrastructure — not as an isolated UI feature.

---

## Roadmap Philosophy

The Greeting Engine should evolve in layers of maturity.

Each phase must:
- solve a real product need
- preserve deterministic behavior
- avoid architectural shortcuts
- maintain runtime simplicity
- prepare future contextual capabilities

The roadmap intentionally delays:
- AI integration
- real-time APIs
- heavy personalization
- dynamic orchestration
- persistent behavioral systems

The system must first become:
- stable
- modular
- observable
- extensible

before becoming sophisticated.

---

# Phase 1 — Foundation

## Objective

Replace the current random greeting implementation with a deterministic and modular contextual engine.

This phase establishes:
- architectural structure
- runtime stability
- deterministic composition
- provider isolation

This is infrastructure work.

---

## Deliverables

### Core Engine

- composer implementation
- deterministic composition rules
- fragment assembly pipeline
- fallback handling

### Initial Layers

- temporal layer
- identity layer

### Runtime

- deterministic seed generation
- lightweight runtime hook
- client-side execution model

### Dashboard Integration

- migrate greeting logic out of UI components
- remove direct `Math.random()` usage
- centralize greeting generation

### Developer Infrastructure

- debug metadata support
- lightweight observability
- typed interfaces

---

## Explicitly Out of Scope

The following MUST NOT be implemented in Phase 1:

- weather APIs
- geolocation
- AI-generated greetings
- Supabase phrase storage
- adaptive personalization
- astrology systems
- user preference persistence
- operational scoring integration
- dashboard summaries
- async contextual providers

Phase 1 prioritizes architectural stability over sophistication.

---

# Phase 2 — Operational Context

## Objective

Introduce lightweight operational awareness into greeting composition.

The Greeting Engine begins reacting to meaningful system state.

---

## Deliverables

### Operational Layer

- operational provider implementation
- health-aware fragments
- contextual operational messaging

### Context Signals

Possible signals:
- critical clients
- delayed tasks
- renewal windows
- onboarding risks
- portfolio changes

### Contextual Prioritization

- operational severity weighting
- soft cautionary messaging
- contextual suppression rules

---

## Explicitly Out of Scope

The following remain excluded:

- predictive AI
- automated recommendations
- behavioral profiling
- persistent user adaptation
- external APIs
- notification orchestration

The engine should acknowledge operational state — not yet interpret it deeply.

---

# Phase 3 — Content Externalization

## Objective

Move greeting content out of static source code into manageable content infrastructure.

This phase focuses on governance and scalability.

---

## Deliverables

### Content Infrastructure

- Supabase greeting tables
- structured content taxonomy
- category metadata
- localization-ready structure

### Editorial Controls

- admin editing workflows
- versionable content management
- feature-flag support
- activation controls

### Runtime Enhancements

- content loading abstraction
- provider-safe content retrieval
- fallback phrase caching

---

## Explicitly Out of Scope

The following remain excluded:

- generative AI
- autonomous content creation
- user-generated greetings
- machine learning ranking
- adaptive emotional systems

Content governance must mature before personalization expands.

---

# Phase 4 — Environmental Context

## Objective

Introduce lightweight environmental awareness to increase contextual richness.

The system becomes more situationally aware while preserving subtlety.

---

## Deliverables

### Environmental Layer

- weather-aware fragments
- seasonal context
- timezone sensitivity
- locale-aware messaging

### Context Providers

Possible integrations:
- weather services
- localization utilities
- seasonal calendars

### Runtime Enhancements

- async provider handling
- graceful environmental fallbacks
- provider timeout protection

---

## Explicitly Out of Scope

The following remain excluded:

- invasive tracking
- precise geolocation dependency
- emotional inference
- predictive mood systems
- surveillance-style personalization

Environmental context should enhance atmosphere, not profile users.

---

# Phase 5 — Narrative Intelligence

## Objective

Evolve the Greeting Engine into the first layer of contextual narrative intelligence inside doncCX Hub.

The system begins acting as:
- contextual narrator
- operational atmosphere layer
- lightweight copiloting interface

---

## Deliverables

### Narrative Systems

- contextual summaries
- operational nudges
- adaptive narrative composition
- proactive contextual messaging

### Contextual Intelligence

Possible future capabilities:
- trend-aware narratives
- portfolio evolution messaging
- contextual prioritization
- proactive focus suggestions

### Infrastructure Evolution

- narrative orchestration
- multi-context composition
- advanced observability
- intelligent suppression systems

---

## Explicitly Out of Scope

Even at this stage, the system must avoid:

- manipulative engagement patterns
- excessive behavioral profiling
- attention-maximization tactics
- theatrical AI personalities
- uncontrolled autonomous behavior

The Greeting Engine must remain operationally respectful.

---

# Cross-Phase Architectural Rules

The following rules apply to all phases:

| Rule | Purpose |
|---|---|
| Determinism-first | Preserve stability and predictability |
| Composition-first | Centralize contextual assembly |
| Extensibility-first | Allow additive evolution |
| Graceful degradation | Never block dashboard rendering |
| Subtlety-first | Avoid noisy or performative behavior |
| Runtime lightweightness | Preserve dashboard responsiveness |
| Editorial governance | Maintain narrative consistency |

---

# Roadmap Success Criteria

The Greeting Engine roadmap succeeds when:

- contextual behavior feels intentional
- greetings remain lightweight
- architecture stays modular
- evolution remains additive
- operational context feels natural
- narrative consistency is preserved

The goal is not to build a talking dashboard.

The goal is to create a subtle contextual layer that gradually evolves into intelligent operational narrative infrastructure.

---

# Final Positioning

The Greeting Engine is foundational infrastructure for future contextual systems across doncCX Hub.

Its long-term value is not greeting generation itself.

Its long-term value is establishing:
- contextual composition
- narrative governance
- operational subtlety
- deterministic personalization
- modular contextual intelligence

# Phase Status Update

## Phase 1 — Foundational Runtime

Status:

```text
COMPLETED
```

Delivered:

- deterministic greeting runtime
- temporal provider
- identity provider
- fragment pipeline
- centralized composer
- deterministic seed generation
- dashboard migration
- contextual narrative structure

---

## Phase 1.1 — Architectural Alignment Refactor

Status:

```text
COMPLETED
```

Delivered:

- provider isolation
- real fragment orchestration
- modular composer behavior
- silence-as-valid implementation
- metadata accuracy
- contextual hierarchy correction

---

## Phase 2.0 — Operational Layer Validation

Status:

```text
COMPLETED
```

Delivered:

- operational provider
- operational fragment orchestration
- priority-based contextual selection
- contextual narrative validation
- operational tone refinement
- contextual debug infrastructure

Validated:

- multi-layer orchestration
- contextual scalability
- deterministic narrative composition
- provider extensibility
- narrative hierarchy preservation

---

# Current Architectural State

The Greeting Engine is now considered:

```text
solid foundational contextual infrastructure
```

The system now supports:

- modular contextual providers
- deterministic orchestration
- operational narratives
- contextual debugging
- scalable narrative composition

---

# Recommended Next Step

Before expanding feature scope:

```text
Content Refinement Sprint
```

Focus areas:

- operational tone refinement
- semantic consistency
- contextual subtlety
- enterprise narrative quality
- narrative atmosphere

---

# Explicitly Deferred

The following remain intentionally deferred:

- AI-generated narratives
- copiloting
- predictive orchestration
- environmental intelligence
- weather integration
- astrology/superstition systems
- contextual summaries
- autonomous recommendations

The current priority remains:

```text
narrative quality and contextual maturity
```


This roadmap exists to ensure that evolution happens intentionally rather than reactively.
