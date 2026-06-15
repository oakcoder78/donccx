-- Brief responses: allow CSM and admin/manager to insert/update via client-side

create policy "brief_responses_insert" on brief_responses
  for insert to authenticated
  with check (
    exists (
      select 1 from brief_instances bi
      join clients c on c.id = bi.client_id
      join profiles p on p.id = auth.uid()
      where bi.id = brief_responses.instance_id
      and (p.role in ('admin','manager') or c.csm_id = auth.uid())
    )
  );

create policy "brief_responses_update" on brief_responses
  for update to authenticated
  using (
    exists (
      select 1 from brief_instances bi
      join clients c on c.id = bi.client_id
      join profiles p on p.id = auth.uid()
      where bi.id = brief_responses.instance_id
      and (p.role in ('admin','manager') or c.csm_id = auth.uid())
    )
  );
