-- ============================================================================
-- Security — revogar EXECUTE de anon/authenticated em manage_cron_job
--
-- Achado na validacao da Fase 2 do rebuild de faturamento, mas de outro dominio
-- (sync, nao billing) — por isso migration e commit separados: se algo der
-- errado no billing, a correcao de seguranca nao fica presa junto.
--
-- manage_cron_job e SECURITY DEFINER, NAO tem guard nenhum, e anon tinha
-- EXECUTE. A acao 'schedule' aceita p_url arbitrario e agenda um job que faz
-- net.http_post para essa URL com o header x-webhook-secret lido de
-- vault.decrypted_secrets. Com a chave anon — que e publica, esta no bundle do
-- frontend — qualquer pessoa exfiltra o segredo do webhook de sync no primeiro
-- minuto, e ainda pode dar unschedule nos jobs reais, parando o sync.
--
-- Quem chama: monthly-sync e sync-schedule, sempre com service role (admin.rpc).
-- Revogar de anon e authenticated nao quebra nada.
--
-- set_impersonation e clear_impersonation entram como higiene: a primeira exige
-- role='admin' internamente e levanta com anon (auth.uid() e NULL), a segunda e
-- no-op sem usuario. Nao precisam de anon.
--
-- NAO tocadas de proposito:
--   get_user_role          — as policies de RLS a chamam, inclusive para anon;
--                            revogar transformaria "nega" em "erro de permissao"
--   register_report_view   — ReportPublicPage roda como anon; e por desenho
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.manage_cron_job(text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_impersonation(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_impersonation() FROM anon;
