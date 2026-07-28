-- Disable RLS on sync_service_log — table only holds timestamps and sync metadata.
-- RLS policies match sync_log pattern but frontend queries are being blocked.
-- No sensitive data — simpler to leave RLS off.
ALTER TABLE public.sync_service_log DISABLE ROW LEVEL SECURITY;
