-- Empresas v2 Phase 4 — Adimplência (cobrança externa, health_financeiro)
-- Tabela por ref_month, trigger espelha delay_days para clients (compat healthScore)

CREATE TABLE IF NOT EXISTS public.billing_payments (
  client_id int NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ref_month text NOT NULL CHECK (ref_month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text NOT NULL CHECK (status IN ('adimplente','inadimplente')),
  delay_days int NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  paid_at date,
  note text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, ref_month)
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_ref_month ON public.billing_payments(ref_month);
CREATE INDEX IF NOT EXISTS idx_billing_payments_client ON public.billing_payments(client_id);

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_payments_select ON public.billing_payments;
CREATE POLICY billing_payments_select ON public.billing_payments FOR SELECT USING (
  public.get_user_role() IN ('admin','manager','finance','sales','csm')
);

DROP POLICY IF EXISTS billing_payments_write ON public.billing_payments;
CREATE POLICY billing_payments_write ON public.billing_payments FOR ALL USING (
  public.get_user_role() IN ('admin','finance')
) WITH CHECK (
  public.get_user_role() IN ('admin','finance')
);

REVOKE ALL ON TABLE public.billing_payments FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_payments TO authenticated;

-- Trigger: espelha delay_days do último ref_month para clients.delay_days (compat healthScore.js + client_subdados)
CREATE OR REPLACE FUNCTION public.sync_billing_payments_delay_days() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest_delay int;
BEGIN
  SELECT delay_days INTO latest_delay
  FROM public.billing_payments
  WHERE client_id = COALESCE(NEW.client_id, OLD.client_id)
  ORDER BY ref_month DESC
  LIMIT 1;

  UPDATE public.clients
  SET delay_days = COALESCE(latest_delay, 0)
  WHERE id = COALESCE(NEW.client_id, OLD.client_id);

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_sync_billing_payments_delay_days_ins ON public.billing_payments;
CREATE TRIGGER trg_sync_billing_payments_delay_days_ins
  AFTER INSERT OR UPDATE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_billing_payments_delay_days();

DROP TRIGGER IF EXISTS trg_sync_billing_payments_delay_days_del ON public.billing_payments;
CREATE TRIGGER trg_sync_billing_payments_delay_days_del
  AFTER DELETE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_billing_payments_delay_days();

-- Seed: backfill from clients.delay_days into current month (não sobrescreve se já existir)
INSERT INTO public.billing_payments (client_id, ref_month, status, delay_days)
SELECT id, to_char(now(), 'YYYY-MM'),
       CASE WHEN delay_days > 0 THEN 'inadimplente' ELSE 'adimplente' END,
       delay_days
FROM public.clients
WHERE delay_days IS NOT NULL
ON CONFLICT (client_id, ref_month) DO NOTHING;

-- Verify:
-- SELECT * FROM billing_payments ORDER BY ref_month DESC LIMIT 5;
-- SELECT get_user_role(); -- finance should pass RLS write
