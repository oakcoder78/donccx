---
name: change-classifier
description: Classify implementation changes by impact level to control downstream workflows
---

# Change Classifier

## Purpose

Determine the significance of a change.

Control:

- documentation updates
- validation workflows
- processing overhead

---

## Classification Levels

### Minor Change

Examples:

- formatting updates
- comment edits
- minor styling tweaks
- variable renaming
- non-functional refactor

Action:

Do NOT invoke docs-writer.

---

### Moderate Change

Examples:

- UI logic updates
- workflow modifications
- service adjustments
- component behavior updates

Action:

Invoke docs-writer.

Update module documentation.

---

### Major Change

Examples:

- new module creation
- schema modification
- database migration
- integration changes
- architecture updates

Action:

Invoke:

docs-writer  
supabase-guard (if schema affected)

---

## Output

Return:

- change level: minor | moderate | major
- recommended downstream actions