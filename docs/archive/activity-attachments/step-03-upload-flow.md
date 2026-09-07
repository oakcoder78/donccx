# Activity Attachments — Step 03 — Upload Flow Definition

## Context

This document defines the official upload flow for activity attachments.

Activities support multiple attachments, allowing users to upload
images, documents, audio files, and other materials related to an activity.

The system supports up to 5 files per upload operation.

---

## Upload Constraints

Maximum files per upload:

5 files

Maximum file size:

Default Supabase configuration

Supported file types:

Any (validated dynamically)

---

## Storage Path Pattern

Files must be stored using the following structure:

client_id/activity_id/timestamp_filename.ext

Example:

12/845/1713382212345_contract.pdf  
12/845/1713382216789_screenshot.png  
12/845/1713382220000_meeting.mp3  

Timestamp is required to ensure unique file names.

---

## Upload Flow

The upload process follows this sequence:

1. User selects one or more files (up to 5)
2. System validates file metadata
3. Files are uploaded to Supabase Storage
4. Storage returns the file path
5. Database record is created in activity_attachments
6. Upload operation completes successfully

---

## Error Handling Rules

The system must handle failures safely.

If file upload fails:

- No database record must be created

If database insert fails:

- The uploaded file must be removed from storage

These rules prevent orphan files and inconsistent data.

---

## Database Fields Used

Each uploaded file generates a record with:

- activity_id
- client_id
- file_name
- file_size
- file_type
- storage_path
- uploaded_by
- created_at

Field:

file_url

Will be generated dynamically using signed URLs when files are accessed.

---

## Purpose

This upload flow ensures:

- data integrity
- storage consistency
- predictable file organization
- safe handling of multi-file uploads
- compatibility with future file processing workflows

---

## Status

Defined and approved.