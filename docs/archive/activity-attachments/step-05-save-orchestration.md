# Activity Attachments — Step 05 — Save Orchestration

## Context

After implementing both file upload and database insert,
a centralized orchestration layer was required to ensure
safe execution of the full attachment workflow.

This step introduced the main service responsible for
coordinating the upload and database persistence steps.

The goal was to guarantee consistency between storage
and database records.

---

## Purpose

This step enables:

- coordinated upload and database insertion
- centralized attachment handling
- rollback safety
- atomic-like execution behavior
- protection against orphaned files

---

## Implementation

A new orchestration service was created:

src/services/activityAttachments/saveActivityAttachments.js

This service coordinates:

1 — File Upload  
2 — Database Insert  
3 — Rollback (if insert fails)

Execution flow:

Upload → Insert → Validate → Return result

---

## Upload Execution

The service first calls:

uploadActivityAttachments()

This step:

- uploads files to Supabase Storage
- returns structured metadata
- includes storage_path references
- stops execution if upload fails

If upload fails:

- no database insert occurs
- error is returned immediately

---

## Database Insert Execution

After successful upload:

insertActivityAttachments()

is executed.

This step:

- inserts metadata into activity_attachments
- persists file references
- returns inserted records

If insert succeeds:

- attachments are confirmed
- operation completes successfully

---

## Rollback Strategy

If database insertion fails:

the system triggers a rollback process.

Rollback behavior:

- previously uploaded files are deleted
- storage is cleaned
- orphaned files are prevented

Rollback is executed using:

supabase.storage.remove()

Each uploaded file path is removed
individually.

---

## Error Handling Improvements

Rollback execution includes:

- try/catch blocks
- Supabase error detection
- safe continuation if one deletion fails
- logging of rollback failures

This ensures resilience
even during partial rollback failures.

---

## Files Involved

- src/services/activityAttachments/saveActivityAttachments.js
- src/services/activityAttachments/uploadActivityAttachments.js
- src/services/activityAttachments/insertActivityAttachments.js

---

## Architectural Importance

This step represents the core execution layer
of the attachment system.

It ensures:

- data consistency
- storage reliability
- operational safety

This layer behaves similarly to
a transactional workflow.

---

## Status

Completed and validated.

Upload + insert + rollback flow
working correctly under normal and failure conditions.