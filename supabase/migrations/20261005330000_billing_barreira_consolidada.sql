-- ============================================================================
-- Barreira no banco: faturas de competencia nao consolidada nao podem ser lidas
-- nem alteradas. Vale para qualquer chamada, inclusive admin e chamada direta.
--
-- Cada funcao publica vira um envelope: checa a consolidacao da competencia da
-- fatura (ou do lancamento, ou das faturas do lote) e chama a funcao original,
-- renomeada para <nome>_motor. A logica de calculo e de escrita nao muda.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.billing_exige_consolidada(p_competencia text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_competencia IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.billing_competencia_consolidada(p_competencia) THEN
    RAISE EXCEPTION 'competencia_nao_consolidada: % ainda nao foi sincronizada', p_competencia
      USING errcode = '55000';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.billing_exige_consolidada(text) FROM public, anon, authenticated;

-- billing_cockpit_clientes
ALTER FUNCTION public.billing_cockpit_clientes(p_competencia text) RENAME TO billing_cockpit_clientes_motor;
REVOKE ALL ON FUNCTION public.billing_cockpit_clientes_motor(p_competencia text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.billing_cockpit_clientes(p_competencia text)
RETURNS TABLE(client_id integer, client_name text, series_ids uuid[], estado text, m_faturas integer, n_em_aberto integer, saldo_aberto numeric, tipo text, valor_unitario numeric, piso integer, uso bigint, mrr_minimo numeric, mrr_real numeric, excedente numeric, maior_atraso integer, faturado numeric, vencido_valor numeric, tem_regra boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada(p_competencia);
  RETURN QUERY SELECT * FROM public.billing_cockpit_clientes_motor(p_competencia);
END $$;
REVOKE ALL ON FUNCTION public.billing_cockpit_clientes(p_competencia text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_clientes(p_competencia text) TO authenticated, service_role;

-- billing_cockpit_faturas
ALTER FUNCTION public.billing_cockpit_faturas(p_client_id integer, p_competencia text) RENAME TO billing_cockpit_faturas_motor;
REVOKE ALL ON FUNCTION public.billing_cockpit_faturas_motor(p_client_id integer, p_competencia text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.billing_cockpit_faturas(p_client_id integer, p_competencia text)
RETURNS TABLE(invoice_id uuid, series_id uuid, number text, kind text, description text, amount numeric, due_date date, paid numeric, balance numeric, state text, overdue_days integer, last_settlement date, installment_no smallint, installments_total smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada(p_competencia);
  RETURN QUERY SELECT * FROM public.billing_cockpit_faturas_motor(p_client_id, p_competencia);
END $$;
REVOKE ALL ON FUNCTION public.billing_cockpit_faturas(p_client_id integer, p_competencia text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_faturas(p_client_id integer, p_competencia text) TO authenticated, service_role;

-- billing_cockpit_extrato
ALTER FUNCTION public.billing_cockpit_extrato(p_client_id integer, p_competencia text) RENAME TO billing_cockpit_extrato_motor;
REVOKE ALL ON FUNCTION public.billing_cockpit_extrato_motor(p_client_id integer, p_competencia text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.billing_cockpit_extrato(p_client_id integer, p_competencia text)
RETURNS TABLE(data date, descricao text, tipo text, valor numeric, saldo_acumulado numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada(p_competencia);
  RETURN QUERY SELECT * FROM public.billing_cockpit_extrato_motor(p_client_id, p_competencia);
END $$;
REVOKE ALL ON FUNCTION public.billing_cockpit_extrato(p_client_id integer, p_competencia text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_extrato(p_client_id integer, p_competencia text) TO authenticated, service_role;

-- billing_cockpit_motivos
ALTER FUNCTION public.billing_cockpit_motivos(p_competencia text) RENAME TO billing_cockpit_motivos_motor;
REVOKE ALL ON FUNCTION public.billing_cockpit_motivos_motor(p_competencia text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.billing_cockpit_motivos(p_competencia text)
RETURNS TABLE(client_id integer, series_id uuid, kind text, outcome text, reason text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada(p_competencia);
  RETURN QUERY SELECT * FROM public.billing_cockpit_motivos_motor(p_competencia);
END $$;
REVOKE ALL ON FUNCTION public.billing_cockpit_motivos(p_competencia text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_motivos(p_competencia text) TO authenticated, service_role;

-- billing_cockpit_composicao
ALTER FUNCTION public.billing_cockpit_composicao(p_invoice_id uuid) RENAME TO billing_cockpit_composicao_motor;
REVOKE ALL ON FUNCTION public.billing_cockpit_composicao_motor(p_invoice_id uuid) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.billing_cockpit_composicao(p_invoice_id uuid)
RETURNS TABLE(base numeric, excedente numeric, uso bigint, piso integer, unit numeric, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  RETURN QUERY SELECT * FROM public.billing_cockpit_composicao_motor(p_invoice_id);
END $$;
REVOKE ALL ON FUNCTION public.billing_cockpit_composicao(p_invoice_id uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_composicao(p_invoice_id uuid) TO authenticated, service_role;

-- billing_cockpit_lancamentos
ALTER FUNCTION public.billing_cockpit_lancamentos(p_invoice_id uuid) RENAME TO billing_cockpit_lancamentos_motor;
REVOKE ALL ON FUNCTION public.billing_cockpit_lancamentos_motor(p_invoice_id uuid) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.billing_cockpit_lancamentos(p_invoice_id uuid)
RETURNS TABLE(entry_id uuid, kind text, amount numeric, happened_at date, method text, reason text, reverses_id uuid, reversible boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  RETURN QUERY SELECT * FROM public.billing_cockpit_lancamentos_motor(p_invoice_id);
END $$;
REVOKE ALL ON FUNCTION public.billing_cockpit_lancamentos(p_invoice_id uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_cockpit_lancamentos(p_invoice_id uuid) TO authenticated, service_role;

-- adjust_invoice
ALTER FUNCTION public.adjust_invoice(p_invoice_id uuid, p_new_amount numeric, p_reason text) RENAME TO adjust_invoice_motor;
REVOKE ALL ON FUNCTION public.adjust_invoice_motor(p_invoice_id uuid, p_new_amount numeric, p_reason text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.adjust_invoice(p_invoice_id uuid, p_new_amount numeric, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  PERFORM public.adjust_invoice_motor(p_invoice_id, p_new_amount, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.adjust_invoice(p_invoice_id uuid, p_new_amount numeric, p_reason text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_invoice(p_invoice_id uuid, p_new_amount numeric, p_reason text) TO authenticated, service_role;

-- cancel_invoice
ALTER FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text) RENAME TO cancel_invoice_motor;
REVOKE ALL ON FUNCTION public.cancel_invoice_motor(p_invoice_id uuid, p_reason text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  PERFORM public.cancel_invoice_motor(p_invoice_id, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text) TO authenticated, service_role;

-- discount_invoice
ALTER FUNCTION public.discount_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_batch_id uuid) RENAME TO discount_invoice_motor;
REVOKE ALL ON FUNCTION public.discount_invoice_motor(p_invoice_id uuid, p_amount numeric, p_reason text, p_batch_id uuid) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.discount_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_batch_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  RETURN public.discount_invoice_motor(p_invoice_id, p_amount, p_reason, p_batch_id);
END $$;
REVOKE ALL ON FUNCTION public.discount_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_batch_id uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.discount_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_batch_id uuid) TO authenticated, service_role;

-- discount_batch
ALTER FUNCTION public.discount_batch(p_invoice_ids uuid[], p_total numeric, p_reason text) RENAME TO discount_batch_motor;
REVOKE ALL ON FUNCTION public.discount_batch_motor(p_invoice_ids uuid[], p_total numeric, p_reason text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.discount_batch(p_invoice_ids uuid[], p_total numeric, p_reason text)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada(x.c) FROM (SELECT DISTINCT i.competencia AS c FROM public.invoices i WHERE i.id = ANY(p_invoice_ids)) x;
  RETURN public.discount_batch_motor(p_invoice_ids, p_total, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.discount_batch(p_invoice_ids uuid[], p_total numeric, p_reason text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.discount_batch(p_invoice_ids uuid[], p_total numeric, p_reason text) TO authenticated, service_role;

-- settle_invoice
ALTER FUNCTION public.settle_invoice(p_invoice_id uuid, p_amount numeric, p_happened_at date, p_method text, p_external_ref text, p_note text, p_batch_id uuid) RENAME TO settle_invoice_motor;
REVOKE ALL ON FUNCTION public.settle_invoice_motor(p_invoice_id uuid, p_amount numeric, p_happened_at date, p_method text, p_external_ref text, p_note text, p_batch_id uuid) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.settle_invoice(p_invoice_id uuid, p_amount numeric, p_happened_at date, p_method text, p_external_ref text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_batch_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  RETURN public.settle_invoice_motor(p_invoice_id, p_amount, p_happened_at, p_method, p_external_ref, p_note, p_batch_id);
END $$;
REVOKE ALL ON FUNCTION public.settle_invoice(p_invoice_id uuid, p_amount numeric, p_happened_at date, p_method text, p_external_ref text, p_note text, p_batch_id uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.settle_invoice(p_invoice_id uuid, p_amount numeric, p_happened_at date, p_method text, p_external_ref text, p_note text, p_batch_id uuid) TO authenticated, service_role;

-- write_off_invoice
ALTER FUNCTION public.write_off_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_happened_at date) RENAME TO write_off_invoice_motor;
REVOKE ALL ON FUNCTION public.write_off_invoice_motor(p_invoice_id uuid, p_amount numeric, p_reason text, p_happened_at date) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.write_off_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_happened_at date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoices i WHERE i.id = p_invoice_id));
  RETURN public.write_off_invoice_motor(p_invoice_id, p_amount, p_reason, p_happened_at);
END $$;
REVOKE ALL ON FUNCTION public.write_off_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_happened_at date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.write_off_invoice(p_invoice_id uuid, p_amount numeric, p_reason text, p_happened_at date) TO authenticated, service_role;

-- reverse_entry
ALTER FUNCTION public.reverse_entry(p_entry_id uuid, p_reason text, p_amount numeric, p_happened_at date) RENAME TO reverse_entry_motor;
REVOKE ALL ON FUNCTION public.reverse_entry_motor(p_entry_id uuid, p_reason text, p_amount numeric, p_happened_at date) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.reverse_entry(p_entry_id uuid, p_reason text, p_amount numeric DEFAULT NULL::numeric, p_happened_at date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada((SELECT i.competencia FROM public.invoice_entries e JOIN public.invoices i ON i.id = e.invoice_id WHERE e.id = p_entry_id));
  RETURN public.reverse_entry_motor(p_entry_id, p_reason, p_amount, p_happened_at);
END $$;
REVOKE ALL ON FUNCTION public.reverse_entry(p_entry_id uuid, p_reason text, p_amount numeric, p_happened_at date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reverse_entry(p_entry_id uuid, p_reason text, p_amount numeric, p_happened_at date) TO authenticated, service_role;

-- cancelar_eventual_grupo
ALTER FUNCTION public.cancelar_eventual_grupo(p_installment_group uuid, p_reason text) RENAME TO cancelar_eventual_grupo_motor;
REVOKE ALL ON FUNCTION public.cancelar_eventual_grupo_motor(p_installment_group uuid, p_reason text) FROM public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.cancelar_eventual_grupo(p_installment_group uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_exige_consolidada(x.c) FROM (SELECT DISTINCT i.competencia AS c FROM public.invoices i WHERE i.installment_group = p_installment_group) x;
  RETURN public.cancelar_eventual_grupo_motor(p_installment_group, p_reason);
END $$;
REVOKE ALL ON FUNCTION public.cancelar_eventual_grupo(p_installment_group uuid, p_reason text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_eventual_grupo(p_installment_group uuid, p_reason text) TO authenticated, service_role;

