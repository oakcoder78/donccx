-- ============================================================================
-- Billing rebuild — Phase 2, validacao: issue_invoice vira primitivo interno
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2.10, §4.2
--
-- Achado da validacao: issue_invoice era executavel por authenticated. Um
-- usuario de financeiro podia emitir fatura de valor arbitrario chamando a RPC
-- direto, pulando o gate do F0, o gate de completude do uso e a formula do
-- §3.2. Confirmado por sonda, revertida.
--
-- Os gates existem contra ERRO, nao contra ma-fe — e um caminho que os pula por
-- acidente e um footgun. O motor (close_competencia) e quem emite; ele e
-- SECURITY DEFINER e roda como dono, entao nao depende deste grant. Nada no
-- frontend nem nas Edge Functions chama issue_invoice (verificado por varredura).
--
-- Fatura avulsa deixa de ser possivel pelo usuario. Se virar necessidade, ela
-- merece RPC propria com regra, nao o primitivo cru.
--
-- Junto: search_path fixado nos dois helpers da Fase 1 que nao tinham. Sao
-- IMMUTABLE e nao leem tabela, entao o risco era baixo; e higiene.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.issue_invoice(
  integer, uuid, text, text, numeric, date, text, uuid, smallint, smallint, uuid
) FROM authenticated;

CREATE OR REPLACE FUNCTION public.competencia_index(p_first_competencia text, p_competencia text)
RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT
    (extract(year  from age((p_competencia || '-01')::date, (p_first_competencia || '-01')::date)) * 12
   + extract(month from age((p_competencia || '-01')::date, (p_first_competencia || '-01')::date)))::int + 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_due_date(p_first_due date, p_month_index integer)
RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (p_first_due + make_interval(months => greatest(0, p_month_index - 1)))::date;
$$;
