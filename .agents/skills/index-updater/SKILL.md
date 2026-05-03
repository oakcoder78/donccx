---
name: index-updater
description: Maintain documentation index consistency after documentation changes
---

# Index Updater

## Purpose

Maintain synchronization between:

docs/

and:

.agents/docs-index.md

Prevent outdated index references.

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

docs/modules/
docs/system/

Detect:

- new module files
- new system topics
- new documentation categories

---

Step 2 — Compare With Index

Open:

.agents/docs-index.md

Check:

- existing module entries
- existing system topics

Detect:

- missing entries
- outdated references

---

Step 3 — Update Index

If new documentation detected:

Add entry under:

Module Documentation  
or  
System Documentation

Maintain:

- alphabetical ordering
- consistent naming
- minimal descriptions

Never:

- duplicate entries
- rewrite entire index
- remove existing entries

---

## Output Requirements

Return:

- index updated: yes/no
- new entries added
- affected documentation domains