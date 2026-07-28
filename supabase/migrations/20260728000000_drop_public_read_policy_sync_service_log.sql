-- Drop overly-permissive SELECT policy on sync_service_log
-- "Enable read access for all users" applied to PUBLIC (anon + authenticated)
-- Replaced by sync_service_log_select_authenticated (authenticated only)
-- Frontend uses authenticated session, so access is preserved
-- Anon key loses read access — surface reduction

DROP POLICY IF EXISTS "Enable read access for all users" ON public.sync_service_log;
