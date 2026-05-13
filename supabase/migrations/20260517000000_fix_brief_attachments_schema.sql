-- Migration: fix brief_attachments schema for public upload
-- Adds missing columns: file_type (add if not exists), uploaded_by (uuid), 
-- and ensures signed URL access via service role RLS bypass.

-- 1. Add file_type column (covers BriefResponsesModal inserts which use file_type)
ALTER TABLE brief_attachments ADD COLUMN IF NOT EXISTS file_type text;

-- 2. Add uploaded_by column (uuid, matches brief-public edge function inserts)
ALTER TABLE brief_attachments ADD COLUMN IF NOT EXISTS uploaded_by uuid;

-- 3. Backfill uploaded_by from uploaded_by_email if needed
-- (already done during upload via service role, only needed for legacy rows)

-- 4. Ensure storage bucket policies allow service role (already fine, service bypasses RLS)
-- Signed URLs are generated on-demand by edge function using service role — no RLS needed.