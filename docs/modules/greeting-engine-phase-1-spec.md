# Greeting Engine Phase 1 Technical Specification

## Purpose

This document defines the executable technical specification for Greeting Engine Phase 1.

Its purpose is to:
- guide implementation
- reduce ambiguity
- constrain scope
- preserve architectural integrity
- establish acceptance criteria

This specification translates the conceptual architecture into concrete implementation boundaries.

---

## Phase 1 Objective

Replace the current random greeting implementation with a deterministic, modular, and composable runtime engine without altering the existing dashboard visual structure.

Phase 1 focuses on:
- architectural foundation
- deterministic behavior
- modular composition
- separation of concerns

This phase is infrastructure-focused, not feature-maximization focused.

---

## Phase 1 Scope

### Included

#### Core Runtime

- deterministic greeting engine
- centralized composer
- lightweight runtime orchestration
- deterministic seed generation

#### Context Layers

- temporal layer
- identity layer

#### React Integration

- `useGreeting()` hook
- dashboard integration
- lightweight runtime caching

#### Developer Infrastructure

- typed contracts
- debug metadata
- fallback behavior
- deterministic testing support

---

### Explicitly Excluded

The following MUST NOT be implemented in Phase 1:

- operational layer
- weather integration
- geolocation
- Supabase phrase storage
- user preferences
- adaptive personalization
- AI-generated greetings
- async providers
- analytics systems
- notification systems
- contextual summaries
- astrology/superstition providers
- admin editing tools

Any implementation beyond the defined scope should be rejected.

---

## File Structure

The implementation must use the following structure:

```text
src/lib/greeting-engine/
├── compose.ts
├── seed.ts
├── temporal.ts
├── identity.ts
├── types.ts
├── content/
│   ├── temporal.ts
│   └── identity.ts
├── hooks/
│   └── useGreeting.ts
└── index.ts
```

### Responsibilities

| File | Responsibility |
|---|---|
| compose.ts | Fragment orchestration and assembly |
| seed.ts | Deterministic seed generation |
| temporal.ts | Temporal fragment provider |
| identity.ts | Identity-aware fragment provider |
| types.ts | Shared contracts |
| content/* | Static typed phrase definitions |
| useGreeting.ts | React integration wrapper |
| index.ts | Public engine exports |

UI components must not contain greeting logic.

---

## Runtime Behavior

### Runtime Model

Phase 1 uses:

```text
client-side deterministic runtime
```

### Rendering Requirements

- synchronous generation
- no loading state
- no async dependency
- no network requests
- immediate fallback availability

### Recalculation Triggers

Greeting recalculation should occur only on:

- login
- dashboard mount
- day change
- profile update
- manual refresh

Greeting generation must NOT occur on every render.

---

## Deterministic Seed Strategy

### Required Behavior

The engine must guarantee:

```text
same user + same day = same greeting
```

### Initial Seed Formula

```text
seed = userId + currentDate
```

### Goals

- prevent chaotic variation
- improve familiarity
- eliminate render instability
- preserve deterministic behavior

Direct `Math.random()` usage is prohibited.

---

## Layer Specifications

### Temporal Layer

Responsible for:
- morning greeting
- afternoon greeting
- evening greeting
- weekday-aware phrasing
- special date awareness

Must NOT:
- access operational data
- contain user-role logic
- contain async behavior

---

### Identity Layer

Responsible for:
- role-aware messaging
- birthday greetings
- tenure-aware acknowledgment
- gender-aware phrasing when applicable

Must NOT:
- access operational scoring
- access remote services
- perform persistence

---

## Composer Behavior

The composer acts as the single source of truth for greeting assembly.

### Responsibilities

- merge fragments
- resolve priority
- enforce determinism
- deduplicate phrases
- apply fallback logic

### Composition Rules

- layers MAY contribute fragments
- silence is valid behavior
- greeting length should remain concise
- subtlety is preferred over fullness

### Fallback Rule

If all contextual fragments fail:

```text
fallback → simple time greeting
```

Example:
- "Bom dia, Jorge."

---

## React Integration

### Required Hook

```ts
useGreeting(): GreetingResult
```

### Hook Responsibilities

- provide memoized greeting access
- orchestrate runtime generation
- expose metadata when debug enabled

### UI Constraints

UI components:
- consume greetings
- never compose greetings
- never contain provider logic

---

## Content Strategy Constraints

Phase 1 content must:

- remain static
- remain version-controlled
- use typed content definitions
- avoid inline UI strings

Phrase content must live under:

```text
src/lib/greeting-engine/content/
```

---

## Caching Behavior

Phase 1 may use lightweight in-memory caching.

### Requirements

- session-scoped
- non-persistent
- deterministic invalidation
- lightweight memory footprint

Persistent personalization is prohibited.

---

## Observability Requirements

The engine must expose lightweight debug metadata.

### Suggested Metadata

```ts
{
  seed: string
  activeLayers: string[]
  selectedFragments: string[]
  generatedAt: string
}
```

This metadata is intended for development and debugging only.

---

## Migration Plan

### Existing Implementation

Current greeting logic exists in:
- `DashboardPage.jsx`
- `DashboardHead.html`

### Required Migration

The implementation must:

- remove direct phrase arrays from UI components
- remove inline greeting generation
- remove `Math.random()` usage
- replace current logic with `useGreeting()`

### Important Constraint

The migration must preserve:
- current visual layout
- rendering performance
- greeting placement
- dashboard responsiveness

Phase 1 is architectural migration, not UI redesign.

---

## Acceptance Criteria

Phase 1 is considered complete when:

- greetings are deterministic
- no greeting logic exists in UI components
- no direct `Math.random()` usage remains
- dashboard rendering remains instantaneous
- runtime remains client-side
- greeting generation is modular
- layers are independently testable
- fallback behavior works correctly
- no visual regressions exist
- no async dependency is introduced

---

## Non-Goals

Phase 1 is NOT intended to:

- create a smart assistant
- generate AI narratives
- predict user behavior
- deeply personalize experience
- orchestrate operational workflows
- maximize engagement
- create gamification

The purpose of Phase 1 is establishing stable contextual infrastructure.

---

## Final Positioning

Phase 1 establishes the foundational architecture for contextual narrative systems inside doncCX Hub.

The immediate goal is not sophistication.

The immediate goal is:
- modularity
- determinism
- composability
- runtime stability
- extensibility

Future intelligence depends on the quality of this foundation.
