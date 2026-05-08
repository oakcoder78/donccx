# Greeting Engine Content Strategy

## Purpose

The Greeting Engine Content Strategy defines the editorial, tonal, and linguistic framework used by the Greeting Engine inside doncCX Hub.

Its purpose is to ensure that all contextual messaging:

- remains coherent across the platform
- reinforces product identity
- scales safely over time
- avoids tonal degradation as new layers and providers are added

This document governs the content layer, not the engine logic itself.

The engine decides:
- when
- why
- and how

The content layer defines:
- what is said
- how it sounds
- what emotional atmosphere it creates

---

## Strategic Positioning

The Greeting Engine is not a motivational widget or entertainment feature.

It is the first implementation of a broader contextual narrative layer that may eventually support:

- operational summaries
- contextual nudges
- proactive copiloting
- adaptive dashboard narratives
- intelligent system feedback

The content strategy must therefore support long-term narrative consistency across the platform.

---

## Content Philosophy

The Greeting Engine content system follows these principles:

| Principle | Description |
|---|---|
| Contextual | Messages should reflect meaningful context whenever possible |
| Lightweight | Greetings must remain short and unobtrusive |
| Humanized | Warm and attentive without artificial friendliness |
| Intelligent | Signals awareness of operational and temporal context |
| Subtle | Enhances atmosphere without competing with workflow |
| Deterministic | Variation should feel intentional, not chaotic |
| Professional | Compatible with enterprise environments |

The engine must prefer:

- restraint over verbosity
- clarity over cleverness
- atmosphere over performance

---

## Tone System

### Allowed Tone Characteristics

- calm
- observant
- subtle
- concise
- professional
- warm
- lightly motivational
- emotionally intelligent

### Forbidden Tone Characteristics

The Greeting Engine must never sound:

- theatrical
- exaggerated
- excessively motivational
- sarcastic
- childish
- meme-driven
- emotionally manipulative
- hyper-energetic
- attention-seeking
- like a chatbot persona

The system should never compete with the user's workflow for attention.

---

## Content Taxonomy

All greeting content must belong to an official category.

| Category | Purpose |
|---|---|
| temporal | Time/day contextual greetings |
| birthday | Birthday recognition |
| anniversary | Tenure or milestone recognition |
| role_based | Greetings adapted to role or responsibility |
| operational | Contextual operational awareness |
| celebration | Positive milestone acknowledgment |
| critical | Soft cautionary or attention-aware messaging |
| seasonal | Holidays or seasonal periods |
| weather | Environmental context (future) |
| playful | Optional lightweight personality |
| reflective | Calm observational phrasing |
| onboarding | Early-stage onboarding messaging |

Every new category must define:

- purpose
- expected tone
- layer ownership
- activation conditions
- fallback behavior

---

## Content Ownership

All greeting content must be:

- version controlled
- categorized
- reviewable
- traceable

No phrase should exist without:
- taxonomy classification
- tone alignment
- ownership responsibility

Content additions should follow the same review standards as product copy.

---

## Phrase Structure

Greeting content should remain modular and composable.

Conceptual structure:

```ts
type GreetingContent = {
  id: string
  category: string
  text: string
  tone?: string[]
  roles?: string[]
  conditions?: string[]
  weight?: number
}
```

This structure is conceptual only and may evolve during implementation.

---

## Deterministic Variation Strategy

The Greeting Engine must avoid chaotic or excessive randomness.

Variation should feel:
- stable
- intentional
- contextual

The same user should not experience radically different greetings during the same session or day.

Preferred strategy:
- deterministic seed rotation
- controlled phrase pools
- low-frequency variation
- contextual priority overrides

Repetition is acceptable when it improves familiarity and consistency.

---

## Context Safety Rules

The Greeting Engine must always respect operational context.

### The system should avoid playful or celebratory messaging when:

- critical operational alerts exist
- major health deterioration is detected
- onboarding is blocked
- escalation states are active
- high-risk signals are present

The engine must never:
- trivialize operational problems
- celebrate negative events
- use humor during critical contexts
- infer sensitive emotional states

Subtlety and contextual awareness always take precedence over personality.

---

## Localization Strategy

All greeting strings should be externalized from the beginning.

Even if Phase 1 only supports PT-BR, the architecture should remain localization-ready.

Content should avoid:
- region-specific slang
- culture-specific jokes
- highly localized idioms
- ambiguous expressions

Future support may include:
- multilingual greetings
- regional seasonal messaging
- locale-aware formatting

---

## Future Content Evolution

Future versions of the Greeting Engine may introduce:

- weather-aware greetings
- contextual operational summaries
- optional astrology/superstition layers
- adaptive personalization
- AI-assisted narrative generation
- user preference tuning

These capabilities must remain:
- modular
- opt-in when sensitive
- operationally respectful
- governed by the same editorial principles

---

## Governance Rules

All new greeting content must:

- belong to a category
- define activation conditions
- follow tone constraints
- remain concise
- avoid semantic duplication
- be documented before release

The Greeting Engine content system should evolve intentionally rather than organically.

Narrative consistency is considered part of the product architecture.
