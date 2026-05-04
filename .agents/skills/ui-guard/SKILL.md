---
name: ui-guard
description: Validate UI changes and preserve layout, hierarchy, and UX patterns (advisory)
---

# UI Guard (v1)

## Purpose

Provide lightweight validation for UI changes to prevent layout regressions and preserve UX patterns.

This skill is **advisory (non-blocking)**:
- It flags potential issues
- It suggests improvements
- It does NOT prevent execution

---

## When to Use

Use when:

- modifying UI components (React/Vue/etc.)
- changing layout (grid, flex, spacing)
- adding/removing fields in forms
- altering modals, drawers, panels
- adjusting typography, spacing, or hierarchy

---

## Validation Workflow

### Step 1 — Detect Scope

Identify:

- affected component(s)
- type of change:
  - layout (grid, flex, width)
  - structure (fields, sections)
  - visual (spacing, typography)
  - interaction (toggle, drawer)

---

### Step 2 — Check Layout Integrity

Validate:

- panels alignment (left/right or top/bottom)
- no excessive compression of content
- no text truncation or overlap
- consistent grid usage (no “empty columns” patterns)

Flag if:

- content becomes unreadable
- layout breaks responsiveness
- panel proportions become unbalanced

---

### Step 3 — Check Visual Hierarchy

Validate:

- primary vs secondary fields are preserved
- main content (e.g., description) remains dominant
- metadata fields remain visually lighter

Flag if:

- secondary content competes with primary
- field prominence becomes inconsistent

---

### Step 4 — Check Consistency

Validate:

- no duplicated labels
- consistent spacing (no mixed gap scales)
- consistent grouping of fields
- alignment between related elements

Flag if:

- duplicated UI elements appear
- spacing feels irregular
- elements feel visually detached

---

### Step 5 — Check Against UI Spec (if exists)

If documentation exists (e.g., docs/modules/activity-modal.md):

- compare layout and behavior against spec
- ensure key rules are preserved

Flag if:

- spec rules are violated
- interaction model changes unintentionally

---

## Output Format

Return:

### UI Validation Summary

- layout integrity: ok / warning
- hierarchy: ok / warning
- consistency: ok / warning
- spec alignment: ok / warning / not_checked

### Findings

List specific issues, e.g.:

- "Right panel is misaligned with left panel"
- "Duplicate label detected in attachments section"
- "Main content area is compressed"

### Suggestions

Provide clear, minimal fixes:

- "Align panel start positions"
- "Remove duplicated label"
- "Adjust grid columns to maintain proportion"

---

## Rules

### Do

- provide actionable feedback
- focus on readability and UX
- keep suggestions minimal and precise

### Do Not

- block execution
- rewrite entire components
- enforce rigid or subjective design preferences
- introduce new patterns unless necessary

---

## Goal

Ensure UI changes remain:

- readable
- consistent
- aligned with defined UX patterns

without slowing down development.