# SDD Specification — doncCX Hub

## What is this document

This is the **meta-document** that defines how Spec-Driven Development (SDD) artifacts must be written in the doncCX Hub project. Any human or LLM agent creating a new SDD must read and follow this specification.

An SDD is the single source of truth for a feature or workstream. Its primary goal is **context continuity**: someone who has never seen the work before — a new developer, a new LLM session, a returning team member — must be able to pick up exactly where the last session left off without asking questions.

---

## When to create an SDD

Create an SDD when the work:

- spans **multiple sessions** or multiple agents
- involves **more than one file** being created or modified
- has **phases** that will be executed at different times
- carries **architectural decisions** that future implementors must respect
- is likely to be **resumed after an interruption**

Do not create an SDD for one-off tasks, single-file fixes, or work that will be completed in a single session.

---

## Language rules

SDDs in this project use a **mixed-language convention**:

| Content type | Language |
|---|---|
| Section titles, checklist items, data contracts, component trees, code blocks, gotchas, LLM instructions | **English** |
| Architectural rationale, business context, product decisions, notes about trade-offs | **Portuguese** |

The rule: **English for what the LLM consumes as instruction; Portuguese for what humans reason about.**

Never write the same content twice in both languages. Choose the appropriate language and use it once.

---

## Required sections

Every SDD must contain these sections, in this order:

### 1. Title + Purpose block

```markdown
# SDD — [Feature or Workstream Name]

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for [feature description]. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully...
2. **During implementation:** Follow the checklist for the active phase...
3. **After implementation:** Fill the Implementation Log...
```

The Purpose block is **always in English** and always includes the three-step "How to use" list. Do not shorten or paraphrase it — its repetition across SDDs is intentional, creating a consistent entry point for any agent.

---

### 2. Section 0 — Current System State

This is the most critical section. It must answer three questions without requiring any external lookup:

1. **Where are we?** — active branch, last deploy, active phase
2. **What already exists?** — files, tables, hooks, flags relevant to this work
3. **What does not exist yet?** — what needs to be created

It must also include a **"Files to be touched"** table listing every file that will be created or modified, with the type of change.

```markdown
## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** Phase X — [status]

**What already exists related to this work:**
- ...

**What does NOT exist and needs to be created:**
- ...

### Files to be touched

| File | Change type |
|---|---|
| `src/...` | **Create** |
| `src/...` | Modify — [what changes] |
```

> **Rule:** Section 0 must be updated at the end of every work session. An outdated Section 0 is worse than no Section 0 — it actively misleads the next agent.

---

### 3. Numbered content sections (1, 2, 3…)

Content sections vary by SDD type. Use the appropriate sections for the work:

**For feature SDDs** (new UI, new module):
- Global Definitions (constants, enums, color tokens, feature flags)
- Design System Reference (which existing components and files to follow as templates)
- Component Tree (visual structure of the feature, using inline text diagram)
- Data Contracts (queries, calculations, field tables, navigation)
- Implementation-specific sections (e.g., Navbar Implementation, Route Implementation)

**For refactoring SDDs** (cleanup, architecture work):
- Context and motivation (why this refactoring, what was diagnosed)
- Execution order table (phases and their sequencing rationale)
- Per-phase scope and checklist

---

### 4. Implementation Phases

Every SDD must define work in **phases**. Each phase has:

```markdown
### Phase N — [Name]

**Status:** [Not started | In progress | Partially complete | Complete]

**Rationale:** [Why this phase exists and why it comes in this order — in Portuguese]

**Scope:**
- [brief bullet list of what this phase covers]

#### Checklist

- [ ] **[Item group]:** [description]
  - [ ] Sub-item
  - [ ] Sub-item
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase N)

| Date | Commit | Files | Summary |
|---|---|---|---|
| — | — | — | — |
```

Rules for phases:
- **One active phase at a time.** Mark status clearly. A reader should immediately know which phase to work on.
- **Checklist items are actionable.** Each item maps to a concrete file change or verification step.
- **Every phase ends with a build check.** `npm run build` is mandatory before marking a phase complete.
- **Implementation Log is filled after work, not before.** Date, commit hash, files changed, one-line summary.
- **Planned phases are documented even if not yet specified.** Write the name, status "Planned", and any known pre-requisites.

---

### 5. Current Checkpoint

A summary of production state and all architectural decisions made. Updated after every session.

```markdown
## N. Current Checkpoint

### Production state

- [What is live in production right now, relevant to this SDD]
- [Any known gaps between spec and production]

### Architectural decisions

| Decision | Rationale |
|---|---|
| [Decision] | [Why — in Portuguese] |
```

The decisions table is the institutional memory of the SDD. Every non-obvious choice must be recorded here so future implementors don't reverse it unknowingly.

---

### 6. Project Gotchas

A mandatory section listing known traps specific to the doncCX Hub codebase. **Always include this section**, even if the feature being built seems unrelated — the gotchas apply project-wide.

```markdown
## N. Project Gotchas — do not skip

- **Icons:** never import directly from `lucide-react`. Always use `src/lib/icons.js`.
- **Supabase deploy:** after `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable it manually in the Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy.
- **Branch:** worktree disabled. All work goes directly to `main`.
- **[Feature-specific gotcha]:** [description]
```

Add feature-specific gotchas relevant to the SDD below the project-wide ones.

---

### 7. LLM Instructions

The last section. Tells any LLM agent how to resume work from this document.

```markdown
## N. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read the relevant content sections before writing any code.
3. Identify the **active phase** via its checklist status.
4. Implement item by item. Mark ✅ when done and verified.
5. After each significant item, run `npm run build` to ensure nothing broke.
6. At the end of the phase, fill in the **Implementation Log**.
7. Update the **Checkpoint** section with the new state.

### Technical Summary Template (fill at the end of each phase)

\```
### Technical Summary — Phase X

**Commits:** hash1, hash2
**Files created:** [list]
**Files modified:** [list]
**Files deleted:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered or deferred]
\```
```

---

## Validation checklist — before publishing an SDD

Before using an SDD to drive implementation, verify:

- [ ] Section 0 reflects the **actual current state** of the codebase — not assumptions
- [ ] Every file listed in "Files to be touched" was **verified to exist** (or confirmed not to exist)
- [ ] Data contracts reference **real column names** — not assumed ones (run a query or check the schema)
- [ ] Color tokens, icon names, and component APIs were **verified in the codebase** — not copied from memory
- [ ] The active phase is clearly identified — no ambiguity about where to start
- [ ] Gotchas section includes **project-wide traps** (icons, Supabase deploy, branch)
- [ ] Language convention is followed throughout

---

## What makes an SDD fail

An SDD fails — causes the next agent to produce wrong output or waste time — when:

- **Section 0 is outdated.** The agent starts from a false premise.
- **Data contracts contain phantom fields.** The agent queries columns that don't exist (e.g., `health_trend`).
- **Component names reference non-existent components.** The agent tries to import `KpiCard` and fails.
- **Color tokens diverge from the codebase.** The agent implements a visually inconsistent feature.
- **Helpers are listed as importable when they aren't exported.** The agent tries `import { scoreBand } from '../DashboardPage'` and gets an error.
- **The active phase is unclear.** The agent re-implements completed work.
- **Rationale is missing.** The agent reverses a deliberate architectural decision without knowing it was deliberate.

---

## SDD lifecycle

```
Draft → Validated → Active → Complete → Archived
```

| Stage | Description |
|---|---|
| **Draft** | Being written; not yet used for implementation |
| **Validated** | Section 0 verified against real codebase; ready to use |
| **Active** | Implementation in progress; being updated after each session |
| **Complete** | All phases done; Implementation Log filled |
| **Archived** | Feature stable; SDD kept for historical reference only |

The current stage should be visible in Section 0 or the document title.

---

## File naming convention

```
[feature-or-workstream]-sdd.md
```

Examples:
- `health-score-dashboard-sdd.md`
- `refactoring-sdd.md`
- `onboarding-module-sdd.md`
- `email-messaging-sdd.md`

Store all SDDs in the same location as this specification file, or in a dedicated `/docs/sdd/` directory in the repository.

---

## Existing SDDs in this project

| File | Feature | Status |
|---|---|---|
| `health-score-dashboard-sdd.md` | `/health` page — scorecard + ranking | Validated — Phase 0 not started |
| `refactoring-sdd.md` | Codebase refactoring — 5 phases | Active — Phase 1 partially complete |
