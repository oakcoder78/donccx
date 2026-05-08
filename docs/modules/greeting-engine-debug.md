# Greeting Engine Debug Infrastructure

## Overview

The Greeting Engine debug infrastructure exists to provide deterministic and controlled contextual simulation during development.

This infrastructure allows engineers, designers, QA, and product stakeholders to validate contextual narrative behavior without depending on:

- real customer operational states
- real timing conditions
- production scenarios
- seeded databases
- manipulated runtime data

The debug layer is intentionally minimal.

It is not a feature flag system.
It is not an admin panel.
It is not a runtime experimentation platform.

Its sole purpose is contextual validation.

---

# Philosophy

The Greeting Engine depends heavily on contextual consistency.

Narrative systems become extremely difficult to validate when they depend exclusively on real operational conditions.

The debug infrastructure exists to:

- simulate contextual states
- validate provider behavior
- validate narrative tone
- support QA workflows
- support screenshot/demo generation
- reduce architectural friction during contextual evolution

The infrastructure is intentionally:

- lightweight
- development-only
- synchronous
- deterministic
- centralized

---

# File Structure

```text
src/lib/greeting-engine/debug.ts
```

---

# Current Structure

```ts
export interface GreetingDebugContext {
  enabled: boolean

  operational?: {
    criticalClients?: number
  }

  identity?: {
    isBirthday?: boolean
    isAnniversary?: boolean
  }

  temporal?: {
    hour?: number
    dayOfWeek?: number
  }
}

export const GREETING_DEBUG =
  process.env.NODE_ENV === 'development'
    ? {
        enabled: false,
        operational: {
          criticalClients: 0,
        },
      }
    : null
```

---

# Runtime Behavior

## Development

When:

```text
NODE_ENV === 'development'
```

The debug context may override runtime contextual signals.

Example:

```ts
criticalClients:
  GREETING_DEBUG?.enabled
    ? GREETING_DEBUG.operational?.criticalClients
    : criticalClients
```

---

## Production

When:

```text
NODE_ENV === 'production'
```

The debug infrastructure resolves to:

```ts
null
```

This guarantees:

- zero production behavioral impact
- zero runtime overhead
- zero contextual leakage

---

# Supported Scenarios

## Operational Validation

```ts
operational: {
  criticalClients: 0
}
```

Used for:

- clean operational state
- low-risk narratives
- stability validation

---

```ts
operational: {
  criticalClients: 4
}
```

Used for:

- attention narratives
- contextual escalation
- provider priority validation

---

# Future-Compatible Scenarios

These are NOT implemented yet.

The structure merely prepares future evolution.

## Identity Validation

```ts
identity: {
  isBirthday: true
}
```

---

## Temporal Validation

```ts
temporal: {
  hour: 9
}
```

---

## Environmental Validation

Potential future support:

```ts
environmental: {
  weather: 'rain'
}
```

---

# Constraints

The debug infrastructure MUST NOT evolve into:

- feature flag infrastructure
- experimentation platform
- persistence layer
- admin tooling
- remote configuration
- async orchestration

The architecture intentionally prioritizes simplicity.

---

# Architectural Benefits

## Centralized Context Simulation

Removes inline debug logic from UI components.

---

## Cleaner Runtime Integration

Prevents contextual hacks from spreading across the application.

---

## Narrative Validation

Allows testing contextual orchestration independently from operational reality.

---

## Future Scalability

Creates a stable foundation for validating:

- operational layers
- environmental layers
- identity layers
- AI-assisted narratives
- contextual summaries

---

# Best Practices

## Recommended

- keep debug disabled by default
- enable only during active validation
- use deterministic values
- test one contextual dimension at a time

---

## Avoid

- permanent debug activation
- production overrides
- complex nested configurations
- runtime mutations
- coupling debug to business logic

---

# Summary

The Greeting Engine debug infrastructure exists to support contextual evolution safely and predictably.

It is intentionally minimal.

Its value is not feature richness.

Its value is reducing the cost of validating narrative systems.
