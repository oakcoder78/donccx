# Greeting Engine Runtime Architecture

## Purpose

This document defines the runtime architecture of the Greeting Engine inside doncCX Hub.

Its purpose is to establish:
- execution model
- lifecycle behavior
- rendering strategy
- stability guarantees
- integration patterns
- extensibility boundaries

This document complements:
- `greeting-engine.md`
- `greeting-engine-content.md`

While those documents define conceptual and editorial architecture, this document defines how the engine behaves operationally inside the application runtime.

---

## Runtime Philosophy

The Greeting Engine runtime should be:

- deterministic
- lightweight
- resilient
- composable
- observable
- non-blocking

The system must enhance the user experience without introducing instability, rendering delays, or operational coupling.

Greetings are contextual enhancements — never critical-path infrastructure.

---

## Runtime Model

### Initial Runtime Strategy

Phase 1 adopts a:

```text
client-side deterministic runtime
```

The engine executes locally in the frontend application without requiring server-side generation.

### Why Client-Side?

This strategy provides:

- low implementation complexity
- zero backend dependency
- instant rendering
- easier debugging
- isolated rollout capability
- lower operational overhead

The Greeting Engine must not introduce blocking network requests during dashboard rendering.

---

## Engine Lifecycle

The engine recalculates greetings only during meaningful contextual changes.

### Recalculation Triggers

| Trigger | Description |
|---|---|
| Login | Initial greeting generation |
| Dashboard mount | Primary rendering event |
| Day change | New deterministic seed cycle |
| Profile update | Identity context changes |
| Manual refresh | Explicit invalidation |

### Non-Triggers

The engine should NOT recalculate on:

- every render
- route changes unrelated to dashboard context
- minor UI state changes
- animation cycles
- polling updates

Stability is preferred over excessive reactivity.

---

## State Model

The Greeting Engine should behave as a:

```text
stateless deterministic engine
```

The runtime may cache generated results temporarily for performance optimization, but the engine itself should not persist behavioral state internally.

### Recommended Characteristics

- pure input → output behavior
- reproducible generation
- no hidden mutable state
- no behavioral drift during session

---

## Deterministic Seed Strategy

The runtime must guarantee stable contextual output.

### Recommended Seed Structure

```text
seed = userId + currentDate
```

### Goals

- same user + same day = same greeting
- avoid chaotic phrase rotation
- reduce perceptual instability
- preserve familiarity

### Future Expansion

Future versions may incorporate:

- locale
- role
- operational severity
- seasonal context

The seed system must remain deterministic.

---

## Rendering Strategy

Greeting rendering should be:

```text
synchronous and lightweight
```

### Requirements

- no loading states
- no async blocking
- no suspense dependency
- immediate fallback availability

### Fallback Philosophy

If contextual layers fail, the engine should gracefully degrade to:

```text
time-based greeting only
```

The dashboard must never depend on the engine to render successfully.

---

## Failure Model

The Greeting Engine must tolerate partial failure.

### Failure Handling Rules

| Failure Scenario | Expected Behavior |
|---|---|
| Layer failure | Ignore layer and continue composition |
| Missing context | Skip dependent fragments |
| Invalid content | Discard fragment |
| Empty composition | Fallback greeting |
| Provider error | Silent degradation |

The engine must fail gracefully and invisibly whenever possible.

---

## React Integration Model

### Recommended Pattern

```text
pure engine + lightweight hook wrapper
```

### Recommended Architecture

```text
UI Component
    ↓
useGreeting()
    ↓
Greeting Engine
    ↓
Layer Providers
    ↓
Composer
```

### Architectural Rules

- UI components should never contain greeting logic
- the engine must remain framework-light
- business logic must stay outside presentation layers
- hooks should only orchestrate runtime access

---

## Runtime Caching Strategy

The runtime may use lightweight in-memory caching.

### Goals

- prevent unnecessary recomposition
- maintain greeting stability
- reduce repeated provider execution

### Cache Characteristics

- session-scoped
- non-persistent
- deterministic invalidation
- lightweight memory footprint

Persistent personalization is explicitly out of scope for Phase 1.

---

## Observability

The Greeting Engine should support lightweight observability for debugging and validation.

### Recommended Debug Metadata

| Metadata | Purpose |
|---|---|
| Active layers | Visibility into composition |
| Selected fragments | Debug contextual output |
| Seed value | Deterministic verification |
| Composition duration | Performance validation |
| Fallback usage | Failure visibility |

### Debug Philosophy

Observability should assist development without polluting runtime behavior.

---

## Performance Constraints

The Greeting Engine must remain operationally inexpensive.

### Runtime Constraints

- no blocking network calls
- no heavy computation
- no large content parsing
- no unnecessary rerenders
- minimal memory allocation

### Rendering Expectations

Greeting generation should feel effectively instantaneous.

The engine must never become a measurable dashboard bottleneck.

---

## Extensibility Model

New contextual capabilities should integrate through isolated providers.

### Preferred Extension Pattern

```text
new context
    ↓
new provider
    ↓
composer integration
```

### Architectural Goals

- additive evolution
- minimal coupling
- isolated testing
- independent rollout
- feature-flag compatibility

New layers should not require rewriting existing composition logic.

---

## Future Runtime Evolution

Future runtime capabilities may include:

- server-assisted contextual generation
- cached operational summaries
- async environmental providers
- AI-assisted narrative composition
- user preference persistence
- adaptive personalization

These capabilities must preserve:

- deterministic behavior
- graceful degradation
- compositional modularity
- performance guarantees

---

## Runtime Governance Rules

All runtime changes must preserve:

- deterministic output
- centralized composition
- layer isolation
- graceful failure behavior
- runtime lightweightness
- architectural observability

## New Section — Debug Runtime Context

### Overview

The Greeting Engine includes a lightweight contextual debug infrastructure used exclusively during development.

The purpose of this layer is to allow deterministic contextual simulation without depending on real operational states.

---

### File

```text
src/lib/greeting-engine/debug.ts
```

---

### Runtime Flow

```text
Dashboard Runtime
        ↓
Debug Context Override (development only)
        ↓
Greeting Providers
        ↓
Fragment Pipeline
        ↓
Composer
        ↓
Narrative Output
```

---

### Behavior

When debug is enabled:

```ts
GREETING_DEBUG.enabled === true
```

runtime contextual values may be overridden.

Example:

```ts
criticalClients:
  GREETING_DEBUG?.enabled
    ? GREETING_DEBUG.operational?.criticalClients
    : criticalClients
```

---

### Production Safety

The debug runtime is automatically disabled in production environments.

This guarantees:

- no production contamination
- no runtime overhead
- no contextual leakage

---

### Architectural Role

The debug runtime is considered:

- development infrastructure
- contextual QA support
- narrative validation tooling

It is NOT considered:

- product functionality
- operational logic
- feature flag infrastructure


The Greeting Engine runtime is considered foundational infrastructure for future contextual systems inside doncCX Hub.
