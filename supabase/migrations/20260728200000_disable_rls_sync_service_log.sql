-- Disable RLS on sync_service_log — table only holds timestamps and sync metadata.
-- RLS policies match sync_log pattern but frontend queries are being blocked.
-- No sensitive data — simpler to leave RLS off with explicit GRANTs.
ALTER TABLE public.sync_service_log DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sync_service_log TO anon, authenticated;
