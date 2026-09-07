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

Update module documentation (`docs/modules/<domain>.md`,
matching section — never a new file for an existing domain).

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

`moderate/major` writes require front-matter
(`status` + `verified`) on the touched live doc.

---

## Output

Return:

- change level: minor | moderate | major
- docs target (file + section, or "none")
- `index-updater`: yes (new domain/file) | no
- recommended downstream actions