-- Allow Edge Functions to insert logs using service_role or anon key
create policy "Allow insert ai_model_logs"
  on public.ai_model_logs for insert
  with check (true);
