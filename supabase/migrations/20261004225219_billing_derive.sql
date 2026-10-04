-- ============================================================================
-- Billing rebuild — Phase 1, migration 2/3: derivacao
-- SDD: docs/sdd/financeiro-faturamento-sdd.md §2.8, §2.9, §3.6
--
-- O estado da fatura e DERIVADO do saldo, nunca gravado. E `clients.delay_days`
-- passa a ter um escritor no modelo novo — hoje quem escreve e o trigger de
-- billing_payments, que a Fase 7 derruba.
--
-- DESVIO DELIBERADO do SDD §6 Fase 1: `get_financeiro_pendencias` NAO e
-- reescrito aqui. Ele e consumidor do cockpit (a pagina le os campos antigos:
-- mrr_real, ref_month, series_label), e reescreve-lo agora mexeria na pagina
-- viva sem beneficio — ele devolve 0 linhas hoje. Vai para a Fase 4, junto com
-- o render que o consome.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) invoice_balance — o saldo, derivado dos lancamentos
-- ---------------------------------------------------------------------------
-- A reversao e atribuida ao TIPO DO ALVO: estornar um desconto nao pode inflar
-- o "recebido". E por isso que o join com o alvo existe.
--
-- O estorno de um estorno e impossivel (trigger trg_validate_invoice_entry),
-- entao nao ha recursao a tratar.

CREATE OR REPLACE VIEW public.invoice_balance AS
SELECT
  i.id,
  i.number,
  i.client_id,
  i.series_id,
  i.kind,
  i.competencia,
  i.amount,
  i.due_date,
  i.status,
  i.description,
  i.installment_group,
  i.installment_no,
  i.installments_total,
  i.replaces_invoice_id,
  i.nf_ref,
  i.adjusted_from,
  i.adjust_reason,
  i.adjusted_by,
  i.adjusted_at,
  i.cancelled_by,
  i.cancelled_at,
  i.cancel_reason,
  i.issued_at,
  i.issued_by,
  coalesce(e.paid, 0)::numeric        AS paid,
  coalesce(e.discounted, 0)::numeric  AS discounted,
  coalesce(e.written_off, 0)::numeric AS written_off,
  (i.amount - coalesce(e.paid, 0) - coalesce(e.discounted, 0) - coalesce(e.written_off, 0))::numeric AS balance,
  e.last_settlement,
  CASE
    WHEN i.status = 'cancelada' THEN 'cancelada'
    WHEN (i.amount - coalesce(e.paid, 0) - coalesce(e.discounted, 0) - coalesce(e.written_off, 0)) <= 0 THEN 'quitada'
    WHEN i.due_date < current_date THEN 'vencida'
    WHEN coalesce(e.paid, 0) + coalesce(e.discounted, 0) + coalesce(e.written_off, 0) = 0 THEN 'aberta'
    ELSE 'parcial'
  END AS state,
  CASE
    WHEN i.status = 'emitida'
     AND (i.amount - coalesce(e.paid, 0) - coalesce(e.discounted, 0) - coalesce(e.written_off, 0)) > 0
    THEN greatest(0, current_date - i.due_date)
    WHEN i.status = 'emitida'
     AND (i.amount - coalesce(e.paid, 0) - coalesce(e.discounted, 0) - coalesce(e.written_off, 0)) <= 0
    THEN greatest(0, e.last_settlement - i.due_date)
    ELSE 0
  END::int AS overdue_days,
  CASE
    WHEN i.status = 'emitida'
    THEN greatest(0, i.amount - coalesce(e.paid, 0) - coalesce(e.discounted, 0) - coalesce(e.written_off, 0))
    ELSE 0
  END::numeric AS overdue_amount
FROM public.invoices i
LEFT JOIN (
  SELECT
    en.invoice_id,
    sum(CASE WHEN en.kind = 'pagamento' THEN en.amount
             WHEN en.kind = 'estorno' AND tgt.kind = 'pagamento' THEN -en.amount
             ELSE 0 END) AS paid,
    sum(CASE WHEN en.kind = 'desconto' THEN en.amount
             WHEN en.kind = 'estorno' AND tgt.kind = 'desconto' THEN -en.amount
             ELSE 0 END) AS discounted,
    sum(CASE WHEN en.kind = 'baixa' THEN en.amount
             WHEN en.kind = 'estorno' AND tgt.kind = 'baixa' THEN -en.amount
             ELSE 0 END) AS written_off,
    max(CASE WHEN en.kind IN ('pagamento','desconto','baixa') THEN en.happened_at END) AS last_settlement
  FROM public.invoice_entries en
  LEFT JOIN public.invoice_entries tgt ON tgt.id = en.reverses_id
  GROUP BY en.invoice_id
) e ON e.invoice_id = i.id;

-- A view roda com as permissoes de quem consulta; a RLS de invoices/entries ja
-- restringe. Nao e SECURITY DEFINER de proposito.
REVOKE ALL ON public.invoice_balance FROM anon, public;
GRANT SELECT ON public.invoice_balance TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) invoice_state(id) — o estado de uma fatura
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_state(p_invoice_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT state FROM public.invoice_balance WHERE id = p_invoice_id;
$$;

REVOKE ALL ON FUNCTION public.invoice_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invoice_state(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) refresh_client_delay_days — o escritor de clients.delay_days
-- ---------------------------------------------------------------------------
-- Pior atraso entre as faturas com saldo > 0. O trigger antigo copiava o atraso
-- do mes MAIS RECENTE: quem pagava o mes novo zerava o indicador mesmo devendo
-- os antigos. Isso alimenta dashboard, health score, scoring e Gravity.
--
-- Dias sozinhos enganam (um residuo de R$ 10 vencido ha 90 dias domina um
-- default de R$ 15.000 recente), por isso o cockpit tambem mostra
-- overdue_amount e buckets — mas clients.delay_days continua sendo dias, para
-- nao quebrar os consumidores existentes.

CREATE OR REPLACE FUNCTION public.refresh_client_delay_days(p_client_id integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_worst integer;
BEGIN
  SELECT coalesce(max(v.overdue_days), 0) INTO v_worst
  FROM public.invoice_balance v
  WHERE v.client_id = p_client_id
    AND v.status = 'emitida'
    AND v.balance > 0;

  UPDATE public.clients SET delay_days = v_worst WHERE id = p_client_id;
  RETURN v_worst;
END $$;

REVOKE ALL ON FUNCTION public.refresh_client_delay_days(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_client_delay_days(integer) TO authenticated, service_role;

-- Trigger nos lancamentos: uma baixa muda o saldo e portanto o atraso.
CREATE OR REPLACE FUNCTION public.trg_entries_refresh_delay() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client integer;
BEGIN
  SELECT client_id INTO v_client FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_client IS NOT NULL THEN
    PERFORM public.refresh_client_delay_days(v_client);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_entries_refresh_delay ON public.invoice_entries;
CREATE TRIGGER trg_entries_refresh_delay
  AFTER INSERT ON public.invoice_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_entries_refresh_delay();

-- Trigger na fatura: emitir, cancelar, ajustar ou reemitir muda o atraso.
CREATE OR REPLACE FUNCTION public.trg_invoices_refresh_delay() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_client_delay_days(coalesce(NEW.client_id, OLD.client_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_refresh_delay ON public.invoices;
CREATE TRIGGER trg_invoices_refresh_delay
  AFTER INSERT OR UPDATE OF status, amount, due_date ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_refresh_delay();

-- ---------------------------------------------------------------------------
-- 4) Recomputation — apenas para clientes que TEM fatura
-- ---------------------------------------------------------------------------
-- DESVIO DELIBERADO do SDD §6: o SDD pedia um recompute para todos os clientes.
-- Fazer isso agora zeraria o delay de todo mundo, porque nao existe fatura
-- nenhuma ainda — e clients.delay_days alimenta dashboard, health score,
-- scoring e Gravity. O trigger antigo (billing_payments) continua sendo o
-- escritor durante a transicao; o novo assume conforme as faturas aparecem.
-- Ambos morrem na Fase 7.
--
-- Hoje este bloco e no-op (invoices vazia) e correto quando houver faturas.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT client_id FROM public.invoices LOOP
    PERFORM public.refresh_client_delay_days(r.client_id);
  END LOOP;
END $$;
