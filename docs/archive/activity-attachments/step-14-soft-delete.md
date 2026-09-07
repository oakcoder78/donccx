# Activity Attachments — Step 14 — Soft Delete Support

## Context

After implementing audio preview support,
the attachment lifecycle
still lacked
a safe removal mechanism.

Users frequently upload
files that may need
to be removed later,
such as:

- incorrect documents
- duplicate uploads
- outdated files

Previously,
attachments could not be removed
directly from the UI.

Removing files required
manual database operations,
which increased:

- operational risk
- user friction
- maintenance complexity

This step introduced
soft delete support
to allow safe removal
of attachments
directly from the interface.

---

## Purpose

This step enables:

- safe attachment removal
- permission-based deletion
- administrator override capability
- immediate UI update after deletion
- logical removal of files
- improved workflow control

This improves system reliability
while preventing
accidental data loss.

---

## Implementation

Soft delete functionality
was implemented
using a logical deletion flag.

Instead of removing records,
attachments are updated
using:

is_deleted = true

This behavior was added to:

src/services/activityAttachments/softDeleteActivityAttachment.js

User interface logic
was implemented inside:

src/components/activities/ActivityDetailModal.jsx

Deleted attachments
remain stored
but are excluded
from active queries.

---

## Soft Delete Behavior

When an attachment
is removed by the user:

The system updates
the attachment record
by setting:

is_deleted = true

The file:

- remains stored
- remains accessible internally
- becomes hidden from UI

This ensures:

- data safety
- traceability
- recovery capability

No physical deletion
occurs during this step.

---

## Permission Handling

Attachment removal
is restricted
using profile-based validation.

Deletion is allowed when:

uploaded_by matches profile.id

OR

profile.role equals "admin"

This allows:

- users to delete their own files
- administrators to delete any file

Correct profile resolution
is required
to ensure accurate permission control.

---

## Profile Resolution

Profile identity
is obtained
from the authenticated session.

The system avoids:

profiles[0]

Selecting the first profile
may result
in incorrect permission validation.

Instead,
the authenticated profile
must be used.

This ensures:

permission checks
remain accurate.

---

## Fetch Filtering

Deleted attachments
must remain hidden
from future queries.

Filtering logic
was added inside:

getActivityAttachments.js

Using:

is_deleted = false

This ensures:

soft-deleted files
do not reappear
after reload.

---

## UI Behavior

Delete action
is displayed as:

🗑 icon

Inside:

ActivityDetailModal

Delete button visibility
depends on permission validation.

Only authorized users
can see
the delete action.

Before deletion:

A confirmation dialog
is displayed.

This prevents:

accidental removals.

---

## Delete Flow

The deletion process
follows this sequence:

1 — Validate permission
2 — Request confirmation
3 — Execute soft delete
4 — Update UI state
5 — Display success feedback

If deletion fails:

An error message
is displayed.

UI state
remains unchanged.

---

## Immediate UI Update

After successful deletion:

The attachment
is immediately removed
from the local UI state.

No page reload
is required.

This improves:

responsiveness
and user confidence.

---

## Admin Override Behavior

Users with:

profile.role === "admin"

can delete:

any attachment.

Regardless of ownership.

This enables:

administrative control
and cleanup capability.

---

## Security Handling

Soft delete
does not remove files
from storage.

All files remain stored
inside:

activity-attachments bucket

This prevents:

irreversible data loss.

Future steps
may introduce:

permanent deletion policies.

---

## UX Improvements

This step improves:

- attachment control
- workflow flexibility
- correction capability
- operational safety

Users can now:

- remove incorrect uploads
- manage attachments safely
- maintain clean activity records

Without requiring:

manual intervention.

---

## Files Involved

- src/services/activityAttachments/softDeleteActivityAttachment.js
- src/services/activityAttachments/getActivityAttachments.js
- src/components/activities/ActivityDetailModal.jsx

---

## Architectural Impact

This step introduced:

- soft delete lifecycle control
- permission-aware UI behavior
- role-based deletion logic
- filtered attachment retrieval

This prepares the system
for future capabilities such as:

- permanent deletion workflows
- retention policies
- audit tracking
- recovery mechanisms

---

## Status

Completed and validated.

Soft delete functionality
is working correctly
for:

- attachment owners
- administrators

Deleted attachments
remain hidden
after reload.