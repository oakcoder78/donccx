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

### Module Logic Domain

Use when related to:

- feature logic
- UI behavior
- module changes
- hooks
- services
- layouts
- page behavior

Search:

docs/modules/

---

### Architecture Domain

Use when related to:

- architecture
- system structure
- data flow
- integration logic
- application lifecycle
- shared modules

Search:

docs/system/

---

### Attachment System Domain

Use when related to:

- file uploads
- activity attachments
- media handling
- storage flows
- preview/download logic

Search:

docs/activity-attachments/

---

### Email Template Domain

Use when related to:

- email rendering
- notifications
- authentication templates
- user messaging

Search:

docs/email-templates/

---

### Foundational Knowledge Domain

Use when:

- domain is unclear
- starting new implementation
- needing architectural context

Search:

docs/core-concepts.md
docs/platform-overview.md

---

# Index Strategy

Index documentation only when necessary.

Never index the entire docs directory blindly.

---

## Initial Index Targets (Primary)

On first use, index only:

docs/modules/
docs/system/
docs/core-concepts.md
docs/platform-overview.md

Reason:

These locations contain:

- architectural definitions
- module behavior
- integration rules
- reusable logic patterns

They provide maximum value with minimal noise.

---

## Deferred Index Targets (Secondary)

Index only when explicitly needed:

docs/activity-attachments/
docs/email-templates/

Reason:

These areas contain:

- procedural steps
- static content
- specialized workflows

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
