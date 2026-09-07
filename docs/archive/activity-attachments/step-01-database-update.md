# Activity Attachments — Step 01 — Database Update

## Context

The existing `activity_attachments` table was minimal and lacked
fields required for secure attachment handling and structured storage usage.

This step expands the table to support:

- multi-client security
- structured file storage
- uploader auditing
- soft deletion

---

## Changes Applied

The following columns were added to the table:

- client_id (integer → references clients.id)
- uploaded_by (uuid → references profiles.id)
- file_type (text → MIME type of file)
- storage_path (text → path inside storage bucket)
- is_deleted (boolean → soft delete support)

Foreign keys were added:

- client_id → clients(id)
- uploaded_by → profiles(id)

Indexes were added:

- idx_activity_attachments_activity
- idx_activity_attachments_client

---

## Purpose

These changes prepare the system for:

- secure attachment storage
- multi-tenant isolation (RLS ready)
- audit tracking
- soft deletion lifecycle
- future AI-based processing of attachments

---

## Status

Completed and validated.