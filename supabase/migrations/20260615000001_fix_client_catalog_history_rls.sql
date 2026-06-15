-- Allow trigger fn_client_catalog_history to insert on behalf of authenticated users

create policy "client_catalog_history_insert" on client_catalog_history
  for insert to authenticated
  with check (true);
