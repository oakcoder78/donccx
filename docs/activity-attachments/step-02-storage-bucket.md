# Activity Attachments — Step 02 — Storage Bucket

## Context

A dedicated private storage bucket was created to store activity attachments.

This bucket will be used to store files related to activities, including:

- images
- PDF documents
- audio files
- other supporting materials

The bucket is configured as private to ensure secure access control.

---

## Bucket Configuration

Name:

activity-attachments

Visibility:

Private

File Size Limit:

50 MB (default Supabase limit currently in use)

Allowed MIME Types:

Any

---

## Storage Path Pattern

Files stored in this bucket will follow the structure:

client_id/activity_id/file.ext

Examples:

12/845/contract.pdf  
12/845/screenshot-error.png  
12/845/meeting-audio.mp3  

---

## Purpose

This bucket supports:

- secure storage of activity attachments
- logical organization by client and activity
- compatibility with Row Level Security (RLS)
- controlled file access using signed URLs
- future support for file processing workflows

---

## Notes

The bucket was initially created as public and later adjusted to private
to ensure proper security configuration before usage.

No files were uploaded before the visibility change.

---

## Status

Completed and validated.