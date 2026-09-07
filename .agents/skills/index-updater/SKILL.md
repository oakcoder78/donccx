---
name: index-updater
description: Maintain documentation index consistency after documentation changes
---

# Index Updater

## Purpose

Sole writer of `.agents/docs-index.md` (GENERATED — never edit by hand).

Maintain synchronization between:

docs/product/ docs/architecture/ docs/modules/ docs/operations/ docs/decisions/
docs/backlog.md docs/CHANGELOG*.md

and:

.agents/docs-index.md

Prevent outdated index references. Never index `docs/archive/`.

---

## When to Use

Use after:

- creating new documentation files
- adding new modules
- adding system documentation
- introducing new documentation domains

Do NOT use for:

- small content edits
- formatting changes
- minor section updates

---

## Update Workflow

Step 1 — Scan Documentation Structure

Check:

docs/product/ docs/architecture/ docs/modules/ docs/operations/ docs/decisions/
docs/backlog.md docs/CHANGELOG*.md docs/LEGACY.md

Detect:

- new files, new domains
- missing front-matter (`status` + `verified`) on live docs
- dead links (target moved to `docs/archive/`)

---

Step 2 — Compare With Index

Open:

.agents/docs-index.md

Detect:

- missing entries
- outdated references (target no longer exists)
- entries pointing into `docs/archive/` (remove — archive is not indexed)

---

Step 3 — Regenerate Index

Rewrite `.agents/docs-index.md` fully from the scan
(header `GENERATED — do not edit` + `last-verified` date).

Maintain:

- alphabetical ordering per section
- consistent naming
- minimal descriptions (1 line each)

Never:

- duplicate entries
- hand-edit around the generator
- index `docs/archive/`

---

## Output Requirements

Return:

- index updated: yes/no
- entries added / removed / fixed
- live docs missing front-matter
- affected documentation domains