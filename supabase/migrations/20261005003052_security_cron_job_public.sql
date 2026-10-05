-- ============================================================================
-- Security — manage_cron_job: revogar tambem de PUBLIC
--
-- A migration anterior (security_cron_job_grants) revogou de anon e
-- authenticated, mas nao pegou: o ACL das funcoes tem `=X/postgres`, que e o
-- grant para PUBLIC. anon herda de PUBLIC, entao continuava executando.
--
-- Correcao: revogar de PUBLIC e reconceder explicitamente a quem precisa.
-- ============================================================================

-- manage_cron_job: so o motor de sync (Edge Function com service role) chama.
REVOKE EXECUTE ON FUNCTION public.manage_cron_job(text, text, text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manage_cron_job(text, text, text, text, jsonb) TO service_role;

-- set_impersonation e clear_impersonation: o app chama como usuario logado.
REVOKE EXECUTE ON FUNCTION public.set_impersonation(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_impersonation(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.clear_impersonation() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_impersonation() TO authenticated, service_role;

-- get_user_role e register_report_view ficam com PUBLIC de proposito: a
-- primeira e chamada pelas policies de RLS para qualquer papel (inclusive anon),
-- e a segunda pelo ReportPublicPage, que roda como anon.
