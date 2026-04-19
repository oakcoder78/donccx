# Activity Attachments — Step 08 — Fetch Attachments Service

## Context

After integrating attachment uploads into the Activity Modal,
the next step was to retrieve stored attachments
for display inside the Activity Detail modal.

This step introduced the read layer responsible
for fetching attachment metadata
based on the activity identifier.

The goal was to enable the UI to display
previously uploaded files.

---

## Purpose

This step enables:

- attachment retrieval by activity_id
- display of existing attachments
- support for multiple attachments
- filtering of deleted files
- preparation for preview and download features

---

## Implementation

A new service was created:

src/services/activityAttachments/getActivityAttachments.js

This service is responsible for:

- querying the activity_attachments table
- filtering attachments by activity_id
- excluding soft-deleted records
- ordering attachments chronologically
- returning structured results

---

## Query Behavior

The query retrieves:

All attachments linked to:

activity_id

Filtering conditions:

- activity_id equals selected activity
- is_deleted equals false

Sorting behavior:

Attachments are ordered by:

created_at ascending

This ensures files are displayed
in the correct chronological order.

---

## Data Handling

Returned records include:

- id
- activity_id
- file_name
- file_size
- file_type
- storage_path
- created_at

These fields provide all necessary
metadata for UI rendering
and file operations.

---

## Error Handling

The service includes:

- activity_id validation
- Supabase query error detection
- structured response format

If activity_id is missing:

- execution stops safely
- an error response is returned

If query fails:

- error message is returned
- UI can handle failure gracefully

---

## Files Involved

- src/services/activityAttachments/getActivityAttachments.js

---

## Architectural Impact

This step introduced
the attachment read layer.

It enables:

- UI rendering of attachments
- future preview capabilities
- download functionality
- attachment lifecycle visibility

This layer is essential
for complete attachment management.

---

## Status

Completed and validated.

Attachment retrieval confirmed
for multiple activities.