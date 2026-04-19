# Activity Attachments — Step 04 — Database Insert

## Context

After successfully uploading files to Supabase Storage,
the next step was to persist metadata in the database.

This step introduced the logic responsible for
registering uploaded files inside the activity_attachments table.

The system now stores structured information about
each uploaded file.

---

## Purpose

This step enables:

- attachment persistence
- file tracking
- multi-file support
- relational linking to activities
- audit-ready storage metadata

---

## Implementation

A dedicated service was created:

src/services/activityAttachments/insertActivityAttachments.js

This service:

- receives uploaded file metadata
- maps files into database records
- inserts multiple records in a single operation
- returns inserted records
- handles database errors safely

---

## Database Fields Used

Each inserted record includes:

- activity_id
- client_id
- uploaded_by
- file_name
- file_size
- file_type
- storage_path

These fields ensure full traceability
between files and activities.

---

## Multi-file Support

The insert operation supports:

- multiple attachments
- batch inserts
- consistent data mapping

Files are transformed into:

records[]

before insertion.

---

## Error Handling

If database insertion fails:

- the error is captured
- the process returns failure status
- rollback logic is triggered later
  in the orchestration layer

This prevents orphaned files.

---

## Files Involved

- src/services/activityAttachments/insertActivityAttachments.js

---

## Status

Completed and validated.

Multiple records insertion working correctly.