---
name: donccx-core
description: Core operational rules for doncCX Hub agents
---

# doncCX Core Skill

## When to use

Always active when working inside the doncCX Hub repository.

This skill defines:

- project workflow
- documentation workflow
- migration workflow
- coding consistency

---

## Instructions

Before coding:

1. Read docs/ related to the feature
2. Follow existing patterns
3. Avoid creating new patterns unless necessary

After coding:

1. Update docs/
2. Generate missing documentation
3. Validate migrations if database changed

---

## Priority Rules

Always prefer:

1. Existing components
2. Existing patterns
3. Existing migrations

Avoid:

- Creating duplicate logic
- Creating undocumented features
- Changing schema without migration