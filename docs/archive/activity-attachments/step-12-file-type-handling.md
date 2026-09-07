# Activity Attachments — Step 12 — File Type Handling

## Context

After implementing preview and download functionality,
the next step focused on improving how different
file types are handled inside the UI.

The system needed a structured way
to detect file types
and define behavior
based on MIME type.

This step introduced
file-type-aware logic
to support scalable attachment rendering.

---

## Purpose

This step enables:

- detection of file types
- conditional rendering logic
- support for image preview
- preparation for audio preview
- improved extensibility

---

## Implementation

File type handling logic
was added to:

src/components/activities/ActivityDetailModal.jsx

The system now reads:

file.file_type

to determine how each file
should be processed.

This enables dynamic behavior
based on MIME type.

---

## File Type Detection

The following detection rules
were introduced:

Image detection:

file_type.startsWith("image/")

Audio detection:

file_type.startsWith("audio/")

Other file types:

default download behavior

This allows consistent handling
of multiple formats.

---

## Supported Image Types

Current supported image formats:

- image/jpeg
- image/png
- image/webp
- image/jpg

These formats support:

- preview
- download

Preview is triggered
using signed URLs.

---

## Audio Detection Support

Audio detection logic
is now actively used
to support inline audio playback.

Detected formats include:

- audio/mpeg
- audio/mp3
- audio/ogg
- audio/webm
- audio/mp4

These formats are now handled
using dynamic rendering logic.

When detected:

file_type.startsWith("audio/")

The system routes
the attachment
to the audio preview component.

This enables:

- inline playback
- secure audio access
- integration with signed URLs

Audio playback is implemented
in the next step
(Audio Preview Support).

---

## Default Behavior for Other Files

Files that do not match:

image/*
or
audio/*

are handled using:

download-only mode.

This ensures compatibility
with:

- PDF files
- Documents
- ZIP archives
- Other binary formats

---

## Architectural Impact

This step introduced:

- file-type-aware rendering
- scalable attachment handling
- extensible UI behavior

It enables future support for:

- audio playback
- video preview
- document preview

without major structural changes.

---

## Files Involved

- src/components/activities/ActivityDetailModal.jsx

---

## Status

Completed and validated.

File type detection
working correctly
for image and audio formats.