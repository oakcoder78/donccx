---
name: module-detector
description: Detect active module from file path and guide documentation and lookup workflows
---

# Module Detector

## Purpose

Identify the active module based on file path.

Guide:

- documentation lookup
- documentation updates
- workflow targeting

---

## Detection Rules

If working inside:

src/modules/<module-name>/

Then:

Active module:

<module-name>

Documentation target:

docs/modules/<module-name>.md

---

If working inside:

src/services/

Documentation target:

docs/modules/services.md

---

If working inside:

src/hooks/

Documentation target:

docs/modules/hooks.md

---

If working inside:

src/pages/

Documentation target:

docs/modules/pages.md

---

If working inside:

src/components/

Check related module usage.

If module cannot be determined:

Fallback:

docs/core-concepts.md  
docs/platform-overview.md

---

## Output

Return:

- active module name
- documentation file target
- related documentation path