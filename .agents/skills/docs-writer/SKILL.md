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

Determine documentation location based on change type.

If change affects:

src/modules/<module-name>/

Write to:

docs/modules/<module-name>.md

---

If change affects:

system architecture
integration logic
core workflows

Write to:

docs/system/

---

If change affects:

file upload
activity attachments
step-based workflows

Write to:

docs/activity-attachments/

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

After creating new module documentation:

Target:

.agents/docs-index.md

---

## Mandatory Safe Update Procedure

Before writing:

1 — Read full existing index file

2 — Locate section:

## Module Documentation

3 — Validate:

- Section exists
- Existing modules preserved
- Module not already listed

If module already exists:

Do nothing.

---

## Update Rules

When updating:

- Insert only missing module name
- Maintain alphabetical order
- Preserve all existing content
- Keep section structure intact

Never:

- overwrite entire file
- recreate full index
- duplicate sections
- remove existing modules
- create new "Module Documentation" section if one already exists

---

## Expected Result

After update:

- Module appears exactly once
- Existing modules remain unchanged
- File structure preserved