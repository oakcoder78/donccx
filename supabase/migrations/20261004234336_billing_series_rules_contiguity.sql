-- ============================================================================
-- Billing rebuild — Phase 1, follow-up: contiguidade das faixas de recorrencia
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2.2
--
-- Ultimo item pendente da Fase 1, e bloqueante da Fase 2: o motor le
-- series_rules para calcular o valor de cada competencia. Um buraco silencioso
-- (1-12 e depois 14-36) significa competencia sem regra — fatura nao emitida
-- sem aviso, que e exatamente a classe de defeito que o rebuild existe para
-- eliminar.
--
-- A validacao e DEFERIDA de proposito. O form do contrato escreve as faixas em
-- varias linhas, e o estado intermediario e invalido: inserir 14-36 antes de
-- 1-12 tem buraco. Validar linha a linha rejeitaria um conjunto que e valido no
-- fim. Constraint trigger DEFERRABLE INITIALLY DEFERRED valida no COMMIT, com o
-- conjunto inteiro visivel.
--
-- Regras:
--   * a primeira faixa (menor month_from) comeca no mes 1
--   * cada faixa seguinte comeca em (month_to anterior + 1)
--   * no maximo uma faixa aberta (month_to NULL), e ela e a ultima
--   * serie sem faixa nenhuma e valida — significa recorrencia nao configurada
--     (o motor a trata como `sem_regra`)
--
-- month_to >= month_from e o pareamento mode/amount/percent ja sao CHECKs da
-- tabela e nao sao repetidos aqui.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- assert_series_rules_contiguous — validacao pura, testavel direto
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_series_rules_contiguous(p_series_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev_to smallint;
  v_first   boolean := true;
  r         record;
BEGIN
  FOR r IN
    SELECT month_from, month_to
    FROM public.series_rules
    WHERE series_id = p_series_id
    ORDER BY month_from
  LOOP
    IF v_first THEN
      IF r.month_from <> 1 THEN
        RAISE EXCEPTION 'series_rules: a serie % comeca no mes %, deveria comecar no mes 1',
          p_series_id, r.month_from USING errcode = '23514';
      END IF;
      v_first := false;
    ELSE
      IF v_prev_to IS NULL THEN
        RAISE EXCEPTION 'series_rules: a serie % tem faixa depois de uma faixa aberta (mes %)',
          p_series_id, r.month_from USING errcode = '23514';
      END IF;
      IF r.month_from <> v_prev_to + 1 THEN
        RAISE EXCEPTION 'series_rules: buraco ou sobreposicao na serie % — mes % apos o mes %',
          p_series_id, r.month_from, v_prev_to USING errcode = '23514';
      END IF;
    END IF;
    v_prev_to := r.month_to;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.assert_series_rules_contiguous(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_series_rules_contiguous(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger deferido
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_series_rules_contiguity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.assert_series_rules_contiguous(NEW.series_id);
  END IF;
  -- UPDATE que troca a serie deixa a antiga para tras: valida as duas.
  IF TG_OP = 'UPDATE' AND OLD.series_id <> NEW.series_id THEN
    PERFORM public.assert_series_rules_contiguous(OLD.series_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.assert_series_rules_contiguous(OLD.series_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_series_rules_contiguity ON public.series_rules;
CREATE CONSTRAINT TRIGGER trg_series_rules_contiguity
  AFTER INSERT OR UPDATE OR DELETE ON public.series_rules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_series_rules_contiguity();
