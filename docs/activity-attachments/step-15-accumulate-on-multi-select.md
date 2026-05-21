# Activity Attachments — Step 15 — Accumulate Files on Multi-Select

## Objective

Fix the file selection behavior in `AttachmentInput` so users can select files across multiple dialog openings instead of the previous selection being replaced.

---

## Problem

The `handleFileChange` handler used `setSelectedFiles(files)` which **replaced** the existing selection with the newly selected files. Users could only select multiple files in a **single** dialog action (using Ctrl+click or Shift+click). Opening the dialog again discarded the previous selection.

This forced a poor UX: users had to save attachments one at a time (select → save → open modal → select → save).

---

## Implementation

**File**: `src/components/activityAttachments/AttachmentInput.jsx`

### Before

```
function handleFileChange(event) {
  const files = Array.from(event.target.files)
  if (files.length > 5) { alert('...'); return }
  setSelectedFiles(files)
  onFilesChange(files)
}
```

### After

```
function handleFileChange(event) {
  const newFiles = Array.from(event.target.files)
  event.target.value = ''

  const total = selectedFiles.length + newFiles.length
  if (total > 5) { alert('...'); return }

  const updated = [...selectedFiles, ...newFiles]
  setSelectedFiles(updated)
  onFilesChange?.(updated)
}
```

### Key Changes

1. **Accumulate** — `[...selectedFiles, ...newFiles]` appends new files instead of replacing.
2. **Reset input value** — `event.target.value = ''` ensures re-selecting the same file triggers `onChange` again (browser skips `change` event if value unchanged).
3. **Total validation** — checks `selectedFiles.length + newFiles.length <= 5` instead of just `newFiles.length <= 5`.

---

## Validation

- Open dialog, select file A → displays "1 arquivo(s)".
- Open dialog again, select file B → displays "2 arquivo(s)".
- Open dialog, select 5 files when 2 already selected → alert "Máximo de 5 arquivos".
- Select the same file twice → allowed (storage path includes unique timestamp).

---

## Files Involved

- `src/components/activityAttachments/AttachmentInput.jsx`

---

## Related

- Step 06 — Attachment Input UI (initial implementation)
- Step 07 — Activity Modal Integration (where attachment upload executes)
