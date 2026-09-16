-- Harden 20260916120000: trigger functions must not be directly callable via RPC.
-- (Trigger firing does not require EXECUTE privilege.)
REVOKE ALL ON FUNCTION public.sync_billing_payments_delay_days() FROM anon, public, authenticated;
