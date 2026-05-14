-- Allow CSM to reply to client questions (created_by is null for edge-function-inserted rows)
drop policy if exists "brief_csm_notes_update" on brief_csm_notes;
create policy "brief_csm_notes_update" on brief_csm_notes
  for update
  using (
    created_by = auth.uid()
    or (origin = 'client' and created_by is null)
  );
