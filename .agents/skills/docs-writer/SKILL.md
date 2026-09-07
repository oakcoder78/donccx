---
name: docs-writer
description: Generate structured technical documentation following the project documentation style guide
---

# Docs Writer

## Purpose

Generate documentation updates that strictly follow
the project documentation standard.

All generated documentation must match
the structure defined in:

docs/docs-style-guide.md

This ensures consistency across the documentation base.

---

## Mandatory Pre-Check

Before generating documentation:

Always read:

docs/docs-style-guide.md

Extract:

- documentation structure
- section naming
- formatting rules
- expected content layout

Never:

- invent documentation structure
- create custom formats
- deviate from defined style guide

---

## When to Use

Use after:

- creating new modules
- modifying module behavior
- updating workflows
- adding services
- updating UI flows
- modifying database schema
- creating migrations
- implementing new integrations

Do NOT use for:

- formatting-only changes
- minor bug fixes
- trivial edits

---

## Target Resolution

Determine documentation location by change type (`change-classifier` levels).
Never create `step-NN-*.md`, `roadmap-v2`, or one-off `*-spec.md` files —
append a section to the live doc, or write a 1-page ADR in `docs/decisions/`.

If `moderate` (UI/workflow/service logic in an existing domain):

Update the matching section in:

docs/modules/<domain>.md

---

If `major/schema` (table/column/RLS/migration/Edge Function):

Update:

docs/architecture/backend.md

Plus one line in:

docs/modules/<domain>.md##Data Interaction

---

If `major/cross-cutting` (auth, flags, integrations, deploy, env):

Update:

docs/architecture/{overview,integrations,auth-flags}.md
or docs/operations/* (runbooks)

---

If new decision / rejected alternative / pre-code context:

Write 1-page ADR:

docs/decisions/NNN-<slug>.md (status Proposed→Accepted)

Link it from `docs/backlog.md`. Never rewrite a shipped ADR —
a correction is a new ADR.

---

If pre-prioritization debt/idea:

Add to `docs/backlog.md` (TD-/IDEA-). No docs-writer output
beyond the backlog entry; `index-updater=no`.

---

If genuinely new business domain (new file under `docs/modules/`):

Create it, then run `index-updater` (`index-updater=yes`).
Otherwise `index-updater=no`.

---

## Writing Behavior

Always:

- follow docs-style-guide.md structure
- append new sections when appropriate
- preserve existing content
- maintain historical continuity

Never:

- overwrite full files blindly
- duplicate existing sections
- remove documented history
- create conflicting descriptions

---

## Documentation Update Rules

When updating existing documentation:

1 — Locate existing section

2 — Append new structured content

3 — Preserve formatting

4 — Maintain naming consistency

---

## Schema Change Handling

If change includes:

- new tables
- column changes
- index changes

Then include:

- migration name
- affected tables
- relationship updates

---

## Output Requirements

Return:

- documentation file updated
- sections added or modified
- summary of documented changes

Keep documentation:

- structured
- minimal
- consistent

---

## Incremental Update Strategy

When updating documentation:

Step 1 — Detect Existing File

If file exists:

docs/modules/<module-name>.md

Then:

- Read existing structure
- Identify matching sections

---

Step 2 — Update or Append

If matching section exists:

Update content inside the section.

If section does not exist:

Append new section at correct structural position.

---

Step 3 — Preserve Structure

Always:

- Keep section order
- Maintain existing formatting
- Avoid duplicate headings

Never:

- recreate full document unnecessarily
- duplicate section titles
- break formatting hierarchy

---

## Section Matching Rules

When updating documentation:

Match sections by:

- heading name
- structural position
- semantic similarity

Example:

If section exists:

## Data Interaction

Then:

Update inside that section.

Do NOT create:

## Data Interaction (New)

---

## Change Sensitivity Rules

Apply documentation update when:

- module logic changes
- data flow changes
- schema changes
- UI behavior changes

Skip documentation update when:

- formatting-only change
- comment-only change
- trivial refactor without behavior change

---

## Index Registration Workflow

`.agents/docs-index.md` is GENERATED — never edit it by hand.
`index-updater` is its sole writer. This skill only reports
`index-updater=yes/no` in its output (see Target Resolution).

## Living-Doc Front-Matter

Every live doc (`docs/product/`, `docs/architecture/`, `docs/modules/`,
`docs/operations/`) carries:

```md
---
status: vivo | congelado | arquivado
owner: <domain/team>
verified: YYYY-MM-DD
expires: YYYY-MM-DD
supersedes: []
---
```

Update `verified`/`expires` on every write. No doc without
`status + verified` — unowned content goes to `docs/backlog.md`,
not to `docs/`.