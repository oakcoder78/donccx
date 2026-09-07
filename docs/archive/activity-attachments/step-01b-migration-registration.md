# Activity Attachments — Step 01B — Migration Registration

## Context

Structural updates were applied to the `activity_attachments` table
to support secure attachment handling and storage integration.

These changes were initially executed directly in the database
and are now officially registered as a migration.

---

## Migration Created

File:

024_activity_attachments_fields.sql

---

## Changes Registered

New columns added:

- client_id → references clients(id)
- uploaded_by → references profiles(id)
- file_type → MIME type of the uploaded file
- storage_path → path inside storage bucket
- is_deleted → logical deletion flag

Indexes added:

- idx_activity_attachments_activity
- idx_activity_attachments_client
- idx_activity_attachments_active (activity_id, is_deleted)

---

## Purpose

This migration ensures:

- schema reproducibility across environments
- performance optimization for attachment queries
- alignment between database and source code
- support for secure multi-client attachment handling

---

## Status

Completed and validated.