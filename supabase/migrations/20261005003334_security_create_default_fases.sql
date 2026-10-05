-- ============================================================================
-- Security — create_default_fases: dead code que escreve, executavel por anon
--
-- Achado na mesma varredura que pegou manage_cron_job: funcoes SECURITY DEFINER
-- executaveis por anon. Esta e a segunda.
--
-- create_default_fases(p_onboarding_id integer) insere linhas em
-- onboarding_fases e muda onboardings.fase_atual_id — ou seja, ESCREVE. E nao e
-- chamada por ninguem: nao esta no frontend, nas Edge Functions, em trigger nem
-- em cron. Confirmado por varredura.
--
-- Com anon executando, qualquer pessoa com a chave publica pode enumerar
-- onboardings (id inteiro sequencial) e reescrever o fase_atual_id, jogando o
-- onboarding de volta para a primeira fase.
--
-- Revogado em vez de dropado: a remocao de codigo morto e decisao a parte, e
-- revogar e reversivel. Fica no backlog como candidata.
--
-- check_report_access NAO entra: e chamada por ReportPublicPage.jsx, que roda
-- como anon. E por desenho, como register_report_view.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.create_default_fases(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_default_fases(integer) TO service_role;
