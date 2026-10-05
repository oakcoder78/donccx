-- ============================================================================
-- Suite: privilegios de execucao de funcoes sensiveis
--
-- Nasceu do achado da validacao da Fase 2: manage_cron_job era SECURITY DEFINER,
-- sem guard interno, e executavel por anon. A acao 'schedule' aceita URL
-- arbitraria e agenda um job que envia o x-webhook-secret do vault para ela.
--
-- Nao e uma suite de billing — vive separada porque o dominio e outro (sync,
-- impersonation). O mesmo padrao das outras: transacao que termina em excecao.
--
-- Como rodar: psql "$DATABASE_URL" -f supabase/tests/security_function_grants.sql
--             ou pelo MCP execute_sql.
-- Resultado esperado: "SUITE OK — N passed, 0 failed".
--
-- Regra que ela guarda: funcao SECURITY DEFINER sem guard interno proprio nao
-- pode ser executavel por anon nem por authenticated.
-- ============================================================================

DO $$
DECLARE
  v_passed integer := 0;
  v_failed text := '';
BEGIN
  -- ==========================================================================
  -- 1. manage_cron_job: so o service_role (as Edge Functions de sync)
  -- ==========================================================================
  IF NOT has_function_privilege('anon', 'public.manage_cron_job(text,text,text,text,jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.manage_cron_job(text,text,text,text,jsonb)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.manage_cron_job(text,text,text,text,jsonb)', 'EXECUTE')
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 1 manage_cron_job executavel fora do service_role'; END IF;

  -- ==========================================================================
  -- 2. Impersonation: guard interno existe, mas anon nao precisa
  -- ==========================================================================
  IF NOT has_function_privilege('anon', 'public.set_impersonation(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.clear_impersonation()', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.set_impersonation(text)', 'EXECUTE')
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 2 impersonation acessivel por anon'; END IF;

  -- ==========================================================================
  -- 3. create_default_fases: dead code que ESCREVE (onboarding_fases,
  --    onboardings.fase_atual_id) e era executavel por anon. Nao e chamada por
  --    ninguem: frontend, Edge Functions, trigger ou cron.
  -- ==========================================================================
  IF NOT has_function_privilege('anon', 'public.create_default_fases(integer)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.create_default_fases(integer)', 'EXECUTE')
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 3 create_default_fases executavel por anon/authenticated'; END IF;

  -- ==========================================================================
  -- 4. As tres que PRECISAM de anon, de proposito
  -- ==========================================================================
  -- get_user_role e chamada pelas policies de RLS para qualquer papel; revogar
  -- transformaria "nega" em "erro de permissao". register_report_view e
  -- check_report_access sao chamadas pelo ReportPublicPage, que roda como anon.
  -- get_effective_role e so um wrapper de get_user_role.
  IF has_function_privilege('anon', 'public.get_user_role()', 'EXECUTE')
     AND has_function_privilege('anon', 'public.register_report_view(uuid,text,text)', 'EXECUTE')
     AND has_function_privilege('anon', 'public.check_report_access(uuid,text)', 'EXECUTE')
  THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed || E'\n  FAIL 4 funcao publica perdeu acesso de anon'; END IF;

  IF coalesce(v_failed, '') = '' THEN
    RAISE EXCEPTION 'SUITE OK — % passed, 0 failed', v_passed;
  ELSE
    RAISE EXCEPTION 'SUITE FALHOU — % passed%', v_passed, v_failed;
  END IF;
END $$;
