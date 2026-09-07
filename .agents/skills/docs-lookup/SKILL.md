---
name: docs-lookup
description: Retrieve relevant documentation using indexed search without loading entire files into context
---

# Docs Lookup

## When to Use

Use this skill when:

- Working on existing modules
- Modifying UI components
- Updating workflows
- Changing database logic
- Reviewing existing behavior
- Unsure about current implementation patterns

Use before:

- Writing new features
- Refactoring existing logic
- Creating new UI elements
- Modifying integrations
- Implementing data changes

---

# Core Objective

Retrieve only the minimum relevant documentation required to:

- understand existing patterns
- avoid duplication
- maintain consistency
- preserve architectural integrity

Never load full documentation unnecessarily.

---

# Instructions

Before searching raw documentation:

Always consult:

.agents/docs-index.md

Use index metadata to:

- determine correct domain
- identify relevant files
- avoid unnecessary scanning

Never:

scan full documentation directories
without consulting index first.

## Step 1 — Determine Domain

Before searching documentation:

Classify the request into one of the following domains.

---

### Product Domain (porquê / o quê)

Use when related to:

- product vision, glossary, roadmap
- backlog state (TD-/IDEA-), changelog
- legacy map (what was retired, where it lives now)

Search:

docs/product/ (vision.md, glossary.md, roadmap.md)
docs/backlog.md, docs/CHANGELOG*.md, docs/LEGACY.md

---

### Architecture Domain (como o sistema funciona)

Use when related to:

- architecture, system structure, data flow
- integration logic, application lifecycle
- auth, feature flags, backend, Supabase, RLS
- operations (deploy, env, testing, security)

Search:

docs/architecture/ (overview.md, data-flow.md, integrations.md, frontend.md, backend.md, auth-flags.md)
docs/operations/ (deploy.md, env-secrets.md, testing.md, security.md)

---

### Module Domain (estado vivo por domínio de negócio)

Use when related to:

- feature logic, UI behavior, module changes
- hooks, services, layouts, page behavior

Search:

docs/modules/ (one file per business domain, ~10 files)

---

### Decisions Domain (decisões congeladas)

Use when related to:

- why a past decision was made, rejected alternatives
- pre-code context, SDD/BRD history

Search:

docs/decisions/ (ADR index README-index.md + NNN-<slug>.md)
`docs/archive/` for superseded material (read-only history)

---

### Foundational Knowledge Domain

Use when:

- domain is unclear
- starting new implementation
- needing architectural context

Search:

docs/product/vision.md
docs/product/glossary.md

---

# Index Strategy

Index documentation only when necessary.

Never index the entire docs directory blindly.
Never index `docs/archive/` (history only, excluded from lookup).

---

## Initial Index Targets (Primary)

On first use, index only:

docs/product/
docs/architecture/
docs/modules/
docs/backlog.md

Reason:

These locations contain:

- product definitions and backlog state
- architectural definitions
- module behavior
- integration rules
- reusable logic patterns

They provide maximum value with minimal noise.

---

## Deferred Index Targets (Secondary)

Index only when explicitly needed:

docs/operations/
docs/decisions/

Reason:

These areas contain:

- runbooks and procedures
- frozen decision history

Indexing prematurely increases noise.

---

# Retrieval Rules

Always:

- Search first
- Retrieve minimal sections
- Summarize findings
- Extract only actionable patterns

Return:

- existing pattern
- expected behavior
- constraints
- warnings (if present)

Never:

- load entire files into context
- retrieve unrelated sections
- return full documents
- duplicate existing logic without verification

---

# Output Format

When returning results:

Provide structured summaries containing:

## Existing Pattern

Describe how the feature is currently implemented.

## Expected Behavior

Describe how the system is intended to behave.

## Constraints

List architectural or logical restrictions.

## Warnings

Highlight known risks or sensitive areas.

Keep responses minimal and precise.

Avoid verbosity.

---

# Safety Rules

Never:

- assume behavior without searching
- create new patterns when existing ones exist
- modify logic without verifying documentation
- bypass lookup when working on known modules

Always:

- confirm patterns before implementation
- reuse known structures
- preserve architectural consistency

---

# Performance Guidelines

Prefer:

- targeted searches
- minimal retrieval
- incremental indexing

Avoid:

- full-directory reads
- repeated re-indexing
- unnecessary documentation expansion

Goal:

Maintain small context footprint with high accuracy.

---

# Long-Term Behavior

As documentation grows:

- maintain domain routing discipline
- avoid broad indexing
- refine search precision

Documentation is treated as:

operational memory
not static reference

Efficient retrieval is mandatory for scalability.
