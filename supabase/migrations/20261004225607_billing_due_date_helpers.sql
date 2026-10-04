-- ============================================================================
-- Billing rebuild — Phase 1, migration 4: helpers de competencia e vencimento
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §1.4, §3.3
--
-- Duas funcoes puras que o motor de emissao (Fase 2) usa para derivar o
-- vencimento de cada competencia. Ficam aqui porque a grade de datas e
-- verificacao da Fase 1 — o clamp e a armadilha 22008 conhecida.
--
-- O clamp e NATIVO do Postgres: `date + interval 'N months'` ja capa no ultimo
-- dia do mes. O que NAO pode acontecer e encadear somas (`+1 month +1 month`),
-- porque a primeira soma capa o dia e a segunda parte do dia errado:
--   '2024-01-31' + 1 month + 1 month = 2024-03-29   <- errado
--   '2024-01-31' + 2 months          = 2024-03-31   <- certo
-- Por isso a ancora e sempre first_due_date, numa soma unica.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- competencia_index — quantos meses da primeira competencia ate esta (1-based)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.competencia_index(p_first_competencia text, p_competencia text)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    (extract(year  from age((p_competencia || '-01')::date, (p_first_competencia || '-01')::date)) * 12
   + extract(month from age((p_competencia || '-01')::date, (p_first_competencia || '-01')::date)))::int + 1;
$$;

REVOKE ALL ON FUNCTION public.competencia_index(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.competencia_index(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- billing_due_date — vencimento do month_index N, ancorado no primeiro
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_due_date(p_first_due date, p_month_index integer)
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_first_due + make_interval(months => greatest(0, p_month_index - 1)))::date;
$$;

REVOKE ALL ON FUNCTION public.billing_due_date(date, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_due_date(date, integer) TO authenticated, service_role;
