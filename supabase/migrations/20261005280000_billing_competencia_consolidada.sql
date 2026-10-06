-- ============================================================================
-- Competencia consolidada: so fecha (modo real) a competencia cuja sincronizacao
-- de uso foi concluida pelo cron do mes seguinte. Sincronizacao manual no meio do
-- mes traz uso parcial e nao conta.
--
-- O motor atual vira close_competencia_motor (mesmo corpo, sem alteracao). O novo
-- close_competencia checa a consolidacao no modo real e chama o motor. A previa
-- (preview) nao e bloqueada: serve para ver o que falta.
-- ============================================================================

-- Verdadeiro quando o cron (triggered_by = 'cron') concluiu a sincronizacao do
-- mes de referencia depois do fim dele. Execucao manual nao entra.
CREATE OR REPLACE FUNCTION public.billing_competencia_consolidada(p_competencia text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.sync_service_log l
    WHERE l.ref_month = p_competencia
      AND l.triggered_by = 'cron'
      AND l.status = 'success'
      -- O cron roda no dia 1 do mes seguinte. A folga de um dia cobre o fuso.
      AND l.started_at >= ((p_competencia || '-01')::date + interval '1 month' - interval '1 day')
  );
END $$;

REVOKE ALL ON FUNCTION public.billing_competencia_consolidada(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_competencia_consolidada(text) TO authenticated, service_role;

-- Leitura para a tela: consolidada ou nao, e quando o uso foi consolidado.
CREATE OR REPLACE FUNCTION public.billing_consolidacao(p_competencia text)
RETURNS TABLE(consolidada boolean, consolidada_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_billing() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  IF p_competencia IS NULL OR p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'competencia invalida (esperado YYYY-MM)' USING errcode = '22023';
  END IF;
  RETURN QUERY
  SELECT public.billing_competencia_consolidada(p_competencia),
         (SELECT max(l.finished_at) FROM public.sync_service_log l
           WHERE l.ref_month = p_competencia AND l.triggered_by = 'cron' AND l.status = 'success');
END $$;

REVOKE ALL ON FUNCTION public.billing_consolidacao(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_consolidacao(text) TO authenticated, service_role;

-- O motor deixa de ser chamado direto: so o envelope chega a ele.
ALTER FUNCTION public.close_competencia(text, text, boolean, uuid[]) RENAME TO close_competencia_motor;
REVOKE ALL ON FUNCTION public.close_competencia_motor(text, text, boolean, uuid[]) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_competencia(
  p_competencia text,
  p_mode        text    DEFAULT 'preview',
  p_force       boolean DEFAULT false,
  p_series_ids  uuid[]  DEFAULT NULL
)
RETURNS TABLE(
  series_id      uuid,
  client_id      integer,
  client_name    text,
  series_label   text,
  kind           text,
  outcome        text,
  reason         text,
  month_index    integer,
  uso            bigint,
  piso           integer,
  unit           numeric,
  base           numeric,
  excedente      numeric,
  amount         numeric,
  due_date       date,
  invoice_id     uuid,
  invoice_number text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_mode = 'real' AND NOT public.billing_competencia_consolidada(p_competencia) THEN
    RAISE EXCEPTION 'competencia_nao_consolidada: % ainda nao tem a sincronizacao de uso concluida (o cron do mes seguinte consolida)', p_competencia
      USING errcode = '55000';
  END IF;
  RETURN QUERY SELECT * FROM public.close_competencia_motor(p_competencia, p_mode, p_force, p_series_ids);
END $$;

REVOKE ALL ON FUNCTION public.close_competencia(text, text, boolean, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_competencia(text, text, boolean, uuid[]) TO authenticated, service_role;
