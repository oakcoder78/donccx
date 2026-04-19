# Activity Attachments — Step 06 — Attachment Input UI

## Context

After implementing the backend logic for uploading
and saving attachments, the next step was to provide
a user interface that allows file selection.

This step introduced a reusable file input component
designed specifically for activity attachments.

The goal was to allow users to select files easily,
while maintaining UI consistency with the existing
modal layout.

---

## Purpose

This step enables:

- file selection from the user interface
- support for multiple attachments
- enforcement of file limits
- reusable component architecture
- UI consistency with modal controls

---

## Implementation

A reusable component was created:

src/components/activityAttachments/AttachmentInput.jsx

This component encapsulates:

- file input logic
- validation rules
- file state handling
- UI presentation

The component exposes:

onFilesChange(files)

This callback allows parent components
to receive selected files.

---

## File Selection Behavior

Users can:

- select multiple files
- view selected filenames
- replace previously selected files
- trigger file selection using a styled button

Native file input is hidden and replaced
with a custom styled button.

This ensures visual consistency
with existing UI controls.

---

## File Limit Enforcement

The component enforces:

Maximum allowed files:

5 files per activity

If the limit is exceeded:

- selection is blocked
- an alert message is shown
- no invalid files are stored

This prevents oversized payloads
and ensures predictable performance.

---

## UI Styling Improvements

The input layout was customized to match
the existing modal design.

Key UI behaviors:

- uses label-sm styling
- displays filenames below input
- uses styled button instead of native input
- applies rounded borders
- maintains spacing consistency

The visual structure aligns with:

existing modal button components.

---

## State Management

The component uses:

useState()

to store selected files locally.

Selected files are passed upward
through:

onFilesChange()

This allows parent components
to manage submission logic.

---

## Files Involved

- src/components/activityAttachments/AttachmentInput.jsx

---

## Architectural Impact

This step introduced:

- reusable UI pattern
- controlled file selection
- scalable attachment handling

It prepares the system for:

- modal integration
- multi-file submission
- UI-based validation

---

## Status

Completed and validated.

File selection working correctly.

Multiple file selection confirmed.