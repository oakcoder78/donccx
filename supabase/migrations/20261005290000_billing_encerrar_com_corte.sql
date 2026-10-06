-- ============================================================================
-- Encerrar com corte: cobra a competencia corrente da serie (base integral +
-- excedente do uso ate hoje) e so depois encerra a serie. Tudo numa transacao.
--
-- Diferente do fechamento de competencia, nao passa pela trava de consolidacao:
-- e uma decisao deliberada sobre um cliente. Mesmo assim, recusa se o uso da
-- serie tiver linhas pendentes ou nao tiver snapshot, e se o motor nao emitir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.encerrar_com_corte(
  p_series_id       uuid,
  p_motivo          text,
  p_confirmo_uso    boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_series   public.contract_series%ROWTYPE;
  v_comp     text := to_char(current_date, 'YYYY-MM');
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_uso      record;
  v_linha    record;
  v_emitida  numeric := 0;
  v_faturas  integer := 0;
BEGIN
  IF coalesce(public.get_user_role(), '') NOT IN ('admin','manager','finance','sales') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF v_motivo IS NULL OR char_length(v_motivo) < 10 THEN
    RAISE EXCEPTION 'O motivo do corte precisa de ao menos 10 caracteres.' USING errcode = '22023';
  END IF;
  IF NOT coalesce(p_confirmo_uso, false) THEN
    RAISE EXCEPTION 'Confirme que o uso até hoje foi conferido antes de cobrar o corte.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_series FROM public.contract_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'série não encontrada' USING errcode = 'P0002';
  END IF;
  IF v_series.status <> 'ativa' THEN
    RAISE EXCEPTION 'Só séries ativas podem ser encerradas com corte.' USING errcode = '22023';
  END IF;

  -- Uso: para contrato por uso, precisa de snapshot e nenhuma linha pendente.
  IF v_series.billing_type <> 'fixo' THEN
    SELECT u.tem_snapshot, u.tem_pending INTO v_uso
    FROM public.billing_client_usage(v_comp) u
    WHERE u.client_id = v_series.client_id;

    IF NOT coalesce(v_uso.tem_snapshot, false) THEN
      RAISE EXCEPTION 'Sem sincronização de uso deste cliente em %. Sincronize antes de cobrar o corte.', v_comp
        USING errcode = '55000';
    END IF;
    IF coalesce(v_uso.tem_pending, false) THEN
      RAISE EXCEPTION 'O uso deste cliente tem linhas pendentes de aprovação. Aprove antes de cobrar o corte.'
        USING errcode = '55000';
    END IF;
  END IF;

  -- Emite a competencia corrente so para esta serie. O motor e o unico que calcula.
  FOR v_linha IN
    SELECT * FROM public.close_competencia_motor(v_comp, 'real', false, ARRAY[p_series_id])
  LOOP
    IF v_linha.series_id IS DISTINCT FROM p_series_id THEN
      CONTINUE;
    END IF;
    IF v_linha.outcome NOT IN ('emitida', 'ja_emitida') THEN
      RAISE EXCEPTION 'O corte não foi emitido: % (%).', v_linha.outcome, coalesce(v_linha.reason, 'sem motivo')
        USING errcode = '22023';
    END IF;
    IF v_linha.outcome = 'emitida' THEN
      v_faturas := v_faturas + 1;
      v_emitida := v_emitida + coalesce(v_linha.amount, 0);
    END IF;
  END LOOP;

  -- So encerra depois que a emissao deu certo; mesma transacao.
  PERFORM public.encerrar_series(p_series_id, false, NULL, v_motivo, false, false);

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'faturas_emitidas', v_faturas,
    'valor_emitido', v_emitida
  );
END $$;

REVOKE ALL ON FUNCTION public.encerrar_com_corte(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_com_corte(uuid, text, boolean) TO authenticated, service_role;
