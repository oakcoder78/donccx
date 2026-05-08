# Module — Activity Attachments

## Purpose
The Activity Attachments service layer handles file management for **activity** records. It provides functions to upload files to Supabase storage, insert corresponding metadata records into the `activity_attachments` table, retrieve attachments for a given activity, and soft‑delete attachments. This module isolates storage and database operations from UI components, ensuring a consistent API for attachment handling.

The **Client Attachments** variant (`getClientAttachments`) provides a unified view of all attachments for a client — merging records from activities and onboarding evidences.

## Sub‑Modules

### Activity Attachments (per activity)
Traditional attachment handling tied to individual activity records.

### Client Attachments (per client)
Unified attachment query for use in client detail views.

## Responsibilities
- Upload files to Supabase storage (`uploadActivityAttachments`).
- Insert attachment metadata into the `activity_attachments` table (`insertActivityAttachments`).
- Orchestrate the full save workflow: upload then insert, with rollback on failure (`saveActivityAttachments`).
- Retrieve non‑deleted attachments for a specific activity (`getActivityAttachments`).
- Soft‑delete an attachment by marking `is_deleted = true` (`softDeleteActivityAttachment`).
- Enforce limits (max 5 files per upload) and safe filename sanitization.

## Module Structure
| File | Responsibility |
|------|----------------|
| `getActivityAttachments.js` | Fetches all non‑deleted attachments for a given `activityId`, ordered by creation date. |
| `getClientAttachments.js` | Fetches all attachments for a client (activities + evidencias de onboarding), merged and sorted by date. |
| `insertActivityAttachments.js` | Inserts one or more attachment metadata rows into the database after files have been uploaded. |
| `uploadActivityAttachments.js` | Uploads raw `File` objects to Supabase storage under a path `<clientId>/<activityId>/<timestamp>_<sanitizedName>`. Enforces file count limit and returns an array of stored file descriptors. |
| `saveActivityAttachments.js` | High‑level orchestrator: calls `uploadActivityAttachments` then `insertActivityAttachments`. If the DB insert fails, it removes any uploaded files (rollback). |
| `softDeleteActivityAttachment.js` | Marks an attachment record as deleted (`is_deleted: true`). Performs an existence check and is idempotent. |

## UI Architecture
- **Activities** UI components (`ActivityModal`, `ActivityDetailModal`) import `saveActivityAttachments` and `getActivityAttachments`.
- When creating or editing an activity, the modal collects files via `AttachmentInput` and passes them to `saveActivityAttachments`.
- The detail modal calls `getActivityAttachments` to list existing files and uses `softDeleteActivityAttachment` when a user requests deletion.
- The service functions are pure JavaScript utilities; they do not render UI.

## Data Flow

### Activity Attachments
1. **Upload** – `uploadActivityAttachments` receives an array of `File` objects, sanitizes filenames, builds a storage path, and uploads each file to Supabase storage. Returns `{ success, files }` where `files` contain metadata needed for DB insertion.
2. **Insert** – `insertActivityAttachments` receives `activityId`, `clientId`, `userId`, and the list of uploaded file descriptors, builds DB records, and inserts them into `activity_attachments`.
3. **Save (Orchestrator)** – `saveActivityAttachments` first calls the upload function. If upload succeeds, it calls the insert function. If the insert fails, it iterates over the uploaded files and removes them from storage to avoid orphaned files.
4. **Retrieve** – `getActivityAttachments(activityId)` queries the `activity_attachments` table filtering on `activity_id` and `is_deleted = false`, returning ordered results.
5. **Soft Delete** – `softDeleteActivityAttachment(attachmentId)` checks for existence, then updates `is_deleted` to `true`. Returns success status.

### Client Attachments (unified view)
1. **Fetch** – `getClientAttachments(clientId)` runs two parallel queries:
   - `activity_attachments` for the client (linked via activities)
   - `onboarding_evidencias` for the client
2. **Enrich** – Fetches fase names and project titles to populate `_faseInfo` on evidencia records.
3. **Merge** – Combines both sources into a single array sorted by `created_at` descending.
4. **Annotate** – Adds `_source` field ('activity' or 'evidencia') for UI rendering.

## Dependencies
- **Supabase client** (`supabase` from `../../lib/supabaseClient`). All functions interact with Supabase storage and database.
- No external libraries beyond Supabase.

## Integration Points
- **Activities UI** – uses `saveActivityAttachments` (create/edit) and `getActivityAttachments`/`softDeleteActivityAttachment` (detail view).
- **Activity mutations** (`useActivityMutations`) trigger these services after activity records are created/updated.
- **Authentication** – `uploadActivityAttachments` expects a valid `userId` (passed from UI based on current profile).
- **Client Operacional Tab** – Uses `getClientAttachments` in `ClientSubAnexos` to display unified attachment list for a client.

## Main User Flows
### Flow: Upload attachments (create activity)
1. User selects files in the activity modal (via `AttachmentInput`).
2. On form submit, `saveActivityAttachments` is called with `activityId` (new or existing), `clientId`, `userId`, and the selected `files`.
3. Files are uploaded to Supabase storage; metadata array is returned.
4. Metadata is inserted into `activity_attachments`.
5. If insertion fails, uploaded files are removed (rollback).
6. UI receives success and closes the modal.

### Flow: List attachments (detail view)
1. `ActivityDetailModal` calls `getActivityAttachments(activityId)` on mount.
2. Service returns a list of non‑deleted attachments ordered by creation date.
3. UI renders each entry with preview/download/delete actions.

### Flow: Soft‑delete an attachment
1. User clicks the delete icon on an attachment.
2. UI checks current profile permissions, then calls `softDeleteActivityAttachment(attachmentId)`.
3. Service verifies the attachment exists, updates `is_deleted` to `true`, and returns success.
4. UI removes the attachment from local state.

## State Management
- No internal state; functions are pure and return `{ success, data?, error? }` objects.
- Caller is responsible for handling loading flags and errors (e.g., UI components use React state).

## Error Handling
- Each function validates required parameters and returns `{ success: false, error: 'message' }` on failure.
- `uploadActivityAttachments` caps file count at 5 and sanitizes filenames; returns a specific error message if limits are exceeded.
- `saveActivityAttachments` performs rollback on DB insert failure and propagates the error result.
- `softDeleteActivityAttachment` handles missing IDs, missing records, and catches unexpected exceptions, always returning a success flag.

## Performance Considerations
- Uploads are performed sequentially (`for…of` loop). Parallel uploads could speed up large batches but would require additional error handling.
- Retrieval (`getActivityAttachments`) orders by `created_at` and filters `is_deleted = false`, which is efficient if appropriate indexes exist.
- Rollback removal loops over each uploaded file individually; this could be optimized with bulk delete if supported.

## Known Risks
- Sequential upload may cause slower UI response for multiple files.
- Rollback only removes files when DB insert fails; if the insert succeeds but later UI operations fail, orphaned files could remain.
- No size validation – large files could consume storage without restriction.
- Soft delete does not physically remove storage objects; storage bucket may accumulate unused files.
- Permission checks are performed in UI; the service itself trusts caller‑provided IDs.

## Future Improvements
- Add parallel upload with `Promise.allSettled` and aggregate error handling.
- Enforce file size limits before upload.
- Implement hard delete (actual storage removal) when an attachment is permanently removed.
- Add pagination support for `getActivityAttachments` if activity can have many files.
- Expose a bulk delete API for rollback to reduce multiple storage calls.
- Centralize permission validation within the service layer.

## File Reference Map
- `src/services/activityAttachments/getActivityAttachments.js`
- `src/services/activityAttachments/getClientAttachments.js`
- `src/services/activityAttachments/insertActivityAttachments.js`
- `src/services/activityAttachments/saveActivityAttachments.js`
- `src/services/activityAttachments/softDeleteActivityAttachment.js`
- `src/services/activityAttachments/uploadActivityAttachments.js`
- `src/components/clients/tabs/operacional/ClientSubAnexos.jsx`
