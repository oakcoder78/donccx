# Greeting Engine

## Purpose

The Greeting Engine is a contextual experience layer responsible for generating personalized, multi-dimensional greetings across the doncCX Hub interface. It transforms simple time-based salutations into a strategic engagement tool that acknowledges user identity, operational state, and temporal context.

The engine exists to humanize the platform experience without crossing into gamification. It signals attentiveness to the user's current situation—acknowledging milestones, recognizing roles, and adapting tone—while remaining lightweight and non-intrusive.

Strategically, the Greeting Engine positions doncCX Hub as a proactive Customer Success copilot rather than a passive dashboard. By contextualizing greetings, the platform demonstrates awareness of the user's mission: driving client health, managing portfolios, and closing gaps.

---

## Product Philosophy

The Greeting Engine embodies five core principles:

- **Contextual** — Greetings reflect real operational state, not arbitrary text.
- **Lightweight** — Minimal computation, fast rendering, no external deps.
- **Humanized** — Warm without being artificial; professional without being cold.
- **Intelligent** — Aware of time, role, milestones, and operational context.
- **Non-intrusive** — Present but never demanding attention.

The system must never feel like a game, a reward mechanism, or an AI personality. It should register as thoughtful, not flashy.

---

## Current State

The existing implementation lives in `DashboardPage.jsx`:

```
PHRASES_MALE   = ['Pronto para mais um dia?', 'Seu portfólio espera por você!', ...]
PHRASES_FEMALE = ['Pronta para mais um dia?', 'Seu portfólio espera por você!', ...]
PHRASES_NEUTRAL = ['Seu portfólio espera por você!', ...]
```

**Current behavior:**
- Three static phrase pools keyed by gender
- Random selection on mount via `Math.random()`
- Time-based morning/afternoon/night prefix via `greeting()`

**Limitations:**
- No state awareness (operational context unknown)
- No persistent personalization
- Randomness is uncontrolled (not deterministic)
- Phrases live in UI components (no separation)
- Cannot prioritize or weight fragments
- Duplicated across DashboardPage.jsx and DashboardHead.html
- No extensibility mechanism

---

## Conceptual Architecture

The Greeting Engine operates as a layered composition system. Each layer contributes a fragment; the composer assembles them into a final greting.

### Layer Overview

| Layer | Responsibility |
|-------|---------------|
| **Temporal** | Time of day, day of week, month, season, holidays |
| **Identity** | User role, name, gender, tenure, birth date |
| **Operational** | Active clients, pending tasks, health gaps, renewal windows |
| **Environmental** | Timezone, locale context (future) |
| **Personality** | Tone variation: formal, casual, motivational (future) |

Each layer is independent and can be enabled or disabled via feature flag without affecting other layers.

---

## Initial Scope (Phase 1)

Phase 1 establishes the modular architecture and core deterministic behavior.

### Included in Phase 1

- Modular file structure (layer separation)
- Deterministic composition (seeded random, not arbitrary)
- Birthday greeting awareness (age acknowledgment, not explicit birth year)
- Role-aware greetings (CSM vs Manager vs Admin context)
- Temporal greetings (morning/afternoon/night + special dates)

### Explicitly Excluded from Phase 1

- Weather API integration (no external real-time data)
- Astrology-based greetings (avoid superstition)
- AI-generated text (no LLM integration)
- Geolocation awareness (no GPS or IP-based context)
- Persistent personalization (no tracking across sessions)

---

## Technical Direction

The recommended structure separates concerns by domain:

```
src/lib/greeting-engine/
├── temporal.ts      # time-aware fragment generation
├── identity.ts    # user-aware fragment generation
├── operational.ts # context-aware fragment generation
├── environmental.ts  # placeholder for future locale/timezone
├── personality.ts   # placeholder for tone variation
└── compose.ts     # deterministic assembly logic
```

**Why modularity?**

- Each layer can be developed, tested, and validated independently
- Feature flags can toggle individual layers
- New contexts (e.g., onboarding status) plug in without rewriting composition logic
- No layer has business logic inside UI components

The composer acts as a single source of truth for fragment assembly, ensuring consistency and enabling centralized fallback strategies.

---

## Data Contracts (Conceptual)

Preliminary TypeScript contracts defining the interface between layers:

```typescript
// Context provided by the application
interface GreetingContext {
  profile: {
    id: string
    name: string
    role: 'admin' | 'manager' | 'csm' | 'analyst'
    gender?: 'male' | 'female' | 'other'
    birth_date?: string // ISO date
    created_at: string // for tenure calculation
  }
  operational?: {
    activeClients: number
    pendingTasks: number
    healthGaps: number
  }
  temporal: {
    hour: number // 0-23
    dayOfWeek: number // 0-6
    month: number // 0-11
    isBirthday: boolean
    isAnniversary: boolean // tenure milestone
  }
}

// Result returned by the engine
interface GreetingResult {
  fragments: GreetingFragment[]
  metadata: {
    generatedAt: string
    seed: string // for deterministic reproduction
    layers: string[] // layers that contributed
  }
}

// Individual greeting fragment
interface GreetingFragment {
  text: string
  layer: 'temporal' | 'identity' | 'operational' | 'environmental' | 'personality'
  weight: number // 0-100, for priority assembly
  deterministic: boolean // true if non-random
}
```

These contracts are illustrative. Implementation may evolve as layers are added.

---

## Composition Rules

The composer follows five high-level rules:

1. **Deterministic generation** — All randomness is seeded by user + date. Same user, same day always produces the same greeting. No `Math.random()`.

2. **Priority handling** — Fragments with higher weight render last (prominent position). Time-based prefixes (e.g., "Bom dia") weight lowest.

3. **Fallback strategy** — If a layer produces no fragment (e.g., no birthday), the composer continues with remaining layers. A greeting must always render.

4. **Deduplication** — The composer ensures no repeated words or phrases within a single greeting.

5. **Lightweight output** — Total greeting length ≤ 20 words. More is noise.

---

## Future Evolution

Phase 1 establishes infrastructure for these future capabilities:

- **Weather integration** — Light contextual touches ("Parece que o dia vai ser longo lá fora") without real-time API calls
- **Operational insights** — "Você tem 3 renewals essa semana" as contextual hooks
- **Astrology layer** (optional, off by default) — Zodiac-sign-based playful tones for users who opt in
- **AI copiloting** — Reactive greetings based on recent user actions (future integration point)
- **Adaptive personalization** — Remembering greeting preferences across sessions via Supabase (opt-in)

---

## Architectural Constraints

The following constraints guide all Layer 2+ development:

| Constraint | Rationale |
|------------|-----------|
| No business logic in UI components | Greetings must be centrally composed, not scattered |
| No uncontrolled randomness | User experience must be reproducible |
| Centralized composition | Single composer enables fallback policies |
| Extensibility-first | New layers add without rewriting existing code |
| Localization-ready | Strings externalized from day one |
| Feature-flag friendly | Each layer can be toggled independently |

---

## Implementation Guidelines

Future implementations should:

- Maintain separation of concerns—each layer in its own module
- Never import UI components—keep the engine pure logic
- Prefer composition providers over conditional rendering—consume `useGreeting()` hook
- Document new layers before implementation—this document is the source of truth
- Keep phrases externalized—enable non-developer editing via Supabase tables
- Test determinism—verify same input produces same output

---

## Open Questions

These architectural questions remain open until Phase 1 implementation clarifies requirements:

- Will phrase storage live in code or Supabase?
- Should the engine expose a hook, a context, or a pure function?
- How do users control greeting preferences (tone, verbosity)?
- Should the platform support greeting templates per client segment?

These questions do not block Phase 1 and can be resolved as the modular foundation takes shape.