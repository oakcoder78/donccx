# Module — Services

## Purpose
Service layer groups server‑side operations that interact directly with Supabase storage and tables. Provides focused, reusable functions for activity‑attachment handling (upload, insert, fetch, soft‑delete) while abstracting raw Supabase calls from UI and hooks.

## Responsibilities
- Perform CRUD operations for `activity_attachments` table.
- Upload binary files to Supabase Storage bucket `activity-attachments`.
- Coordinate upload + DB insert with rollback on failure.
- Return consistent `{success, data?, error?}` payloads.
- Enforce simple business rules (max 5 files, required IDs).

## Module Structure
- `getActivityAttachments.js` — fetch non‑deleted attachments for given activity, ordered by creation.
- `insertActivityAttachments.js` — batch insert attachment metadata records.
- `uploadActivityAttachments.js` — upload raw files to storage, generate safe paths, enforce limits.
- `saveActivityAttachments.js` — orchestrates upload then DB insert; rolls back uploaded files if insert fails.
- `softDeleteActivityAttachment.js` — idempotent soft‑delete (set `is_deleted=true`) with existence check.

## Data Flow
1. **Upload**: `uploadActivityAttachments` receives File objects, builds storage path (`clientId/activityId/timestamp_safeName`), calls `supabase.storage.from('activity-attachments').upload`. Returns list of uploaded file descriptors.
2. **Insert**: `insertActivityAttachments` receives metadata (activityId, clientId, userId, file info) and inserts rows into `activity_attachments` table, returning inserted records.
3. **Save**: `saveActivityAttachments` calls upload → if success, calls insert. On insert failure, iterates uploaded files and removes them via `supabase.storage.from(...).remove([path])`.
4. **Fetch**: `getActivityAttachments` queries table where `activity_id` matches and `is_deleted` is false.
5. **Soft Delete**: `softDeleteActivityAttachment` verifies existence, then updates `is_deleted` flag.

## Dependencies
- `../../lib/supabaseClient` – central Supabase client instance.
- Native `File` API (files passed from frontend).
- No external libraries.

## Integration Points
- UI components (`ActivityDetailModal`, `AtendimentoPage`) call `saveActivityAttachments` when user adds files.
- Hooks (`useActivities`) may use `getActivityAttachments` to enrich activity data.
- Backend scripts or edge functions could reuse these services for batch processing.

## Main Usage Patterns
```js
import { saveActivityAttachments } from '../services/activityAttachments/saveActivityAttachments';

const result = await saveActivityAttachments({ activityId, clientId, userId, files });
if (!result.success) handleError(result.error);
else console.log('Attachments saved', result.attachments);
```
Each function returns `{success, data?, error?}` allowing straightforward error handling.

## State Management
Stateless functions; rely on Supabase client for network I/O. No internal React state. `saveActivityAttachments` maintains temporary `uploadResult` and performs rollback logic.

## Known Risks
- No transaction support: rollback manually deletes uploaded files, but DB insert may have partially succeeded leading to orphan records.
- Concurrency: multiple calls could race on same storage path; timestamp + random helps but not guaranteed uniqueness.
- Limited validation: only checks file count and presence, not type/size limits.
- Error messages directly propagated; callers must interpret.

## Future Improvements
- Wrap all steps in a Supabase RPC or server‑side transaction for atomicity.
- Add file type/size validation before upload.
- Centralize error handling and define a typed result interface.
- Implement pagination for `getActivityAttachments` if attachment count grows.
- Move path‑generation logic to a shared utility.

## File Reference Map
- `src/services/activityAttachments/getActivityAttachments.js`
- `src/services/activityAttachments/insertActivityAttachments.js`
- `src/services/activityAttachments/saveActivityAttachments.js`
- `src/services/activityAttachments/softDeleteActivityAttachment.js`
- `src/services/activityAttachments/uploadActivityAttachments.js`
