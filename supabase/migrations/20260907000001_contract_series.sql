-- Séries contratuais: cada série = régua 1..N própria + billing_start próprio = 1 fatura por (série, ref_month)
-- Resolve: (1) data de início de pagamento por período, (2) aditivo = nova série/fatura, (3) renegociação = série desconto
-- supabase-guard: migration required yes | tables: contract_series (new), contract_charges, billing_payments

-- ============================================================================
-- 1) contract_series
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contract_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id int NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Contrato original',
  kind text NOT NULL CHECK (kind IN ('original','aditivo','renegociacao')),
  billing_start date NOT NULL,
  billing_end date NULL CHECK (billing_end IS NULL OR billing_end >= billing_start),
  due_day smallint NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  auto_renew boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','encerrada')),
  reason text,
  CONSTRAINT chk_series_reason CHECK (
    kind != 'renegociacao'
    OR (reason IS NOT NULL AND char_length(nullif(trim(reason), '')) >= 10)
  ),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 1 série 'original' por cliente (aditivo/renegociacao podem repetir)
CREATE UNIQUE INDEX IF NOT EXISTS uq_series_client_original
  ON public.contract_series(client_id) WHERE kind = 'original';
CREATE INDEX IF NOT EXISTS idx_series_client_status
  ON public.contract_series(client_id, status, billing_start);
CREATE INDEX IF NOT EXISTS idx_series_active
  ON public.contract_series(status, billing_start) WHERE status = 'ativa';

ALTER TABLE public.contract_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_select ON public.contract_series;
CREATE POLICY series_select ON public.contract_series FOR SELECT USING (
  public.get_user_role() IN ('admin','manager','finance','sales','csm')
);

DROP POLICY IF EXISTS series_write ON public.contract_series;
CREATE POLICY series_write ON public.contract_series FOR ALL USING (
  public.get_user_role() IN ('admin','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','finance','sales')
);

REVOKE ALL ON TABLE public.contract_series FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contract_series TO authenticated;

-- ============================================================================
-- 2) contract_charges: series_id + ref_month
-- ============================================================================
ALTER TABLE public.contract_charges ADD COLUMN IF NOT EXISTS series_id uuid;
ALTER TABLE public.contract_charges ADD COLUMN IF NOT EXISTS ref_month text;

-- Backfill: 1 série original por cliente com charges (só com contract_start — sem inventar data)
INSERT INTO public.contract_series (client_id, label, kind, billing_start, due_day, status)
SELECT DISTINCT ch.client_id, 'Contrato original', 'original',
       cl.contract_start, extract(day from cl.contract_start)::smallint, 'ativa'
FROM public.contract_charges ch
JOIN public.clients cl ON cl.id = ch.client_id
WHERE cl.contract_start IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: série original também para clientes com payments mas sem charges
INSERT INTO public.contract_series (client_id, label, kind, billing_start, due_day, status)
SELECT p.client_id, 'Contrato original', 'original',
       COALESCE(cl.contract_start, (MIN(p.ref_month) || '-01')::date),
       extract(day from COALESCE(cl.contract_start, (MIN(p.ref_month) || '-01')::date))::smallint,
       'ativa'
FROM public.billing_payments p
JOIN public.clients cl ON cl.id = p.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_series s
  WHERE s.client_id = p.client_id AND s.kind = 'original'
)
GROUP BY p.client_id, cl.contract_start
ON CONFLICT DO NOTHING;

-- Backfill charges → série original + ref_month derivado
UPDATE public.contract_charges ch SET
  series_id = s.id,
  ref_month = to_char(s.billing_start + make_interval(months => ch.month_index - 1), 'YYYY-MM')
FROM public.contract_series s
WHERE s.client_id = ch.client_id AND s.kind = 'original';

-- Constraints (só após backfill)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.contract_charges WHERE series_id IS NULL OR ref_month IS NULL) THEN
    RAISE EXCEPTION 'backfill incompleto: existem charges sem series_id/ref_month';
  END IF;
END $$;

ALTER TABLE public.contract_charges ALTER COLUMN series_id SET NOT NULL;
ALTER TABLE public.contract_charges ALTER COLUMN ref_month SET NOT NULL;
ALTER TABLE public.contract_charges
  ADD CONSTRAINT chk_charges_ref_month CHECK (ref_month ~ '^[0-9]{4}-[0-9]{2}$') NOT VALID;
ALTER TABLE public.contract_charges VALIDATE CONSTRAINT chk_charges_ref_month;

ALTER TABLE public.contract_charges
  ADD CONSTRAINT contract_charges_series_id_fkey
  FOREIGN KEY (series_id) REFERENCES public.contract_series(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.contract_charges VALIDATE CONSTRAINT contract_charges_series_id_fkey;

-- UNIQUE agora por série (série implica cliente)
ALTER TABLE public.contract_charges
  DROP CONSTRAINT IF EXISTS contract_charges_client_id_kind_month_index_installment_gro_key;
ALTER TABLE public.contract_charges
  ADD CONSTRAINT uq_charges_series_kind_month_group
  UNIQUE (series_id, kind, month_index, installment_group);

CREATE INDEX IF NOT EXISTS idx_charges_series_month ON public.contract_charges(series_id, month_index);
CREATE INDEX IF NOT EXISTS idx_charges_series_kind ON public.contract_charges(series_id, kind, month_index);
CREATE INDEX IF NOT EXISTS idx_charges_ref_month ON public.contract_charges(series_id, ref_month);

-- Consistência: charges.client_id deve bater com series.client_id
CREATE OR REPLACE FUNCTION public.check_charge_series_client() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_id != (SELECT client_id FROM public.contract_series WHERE id = NEW.series_id) THEN
    RAISE EXCEPTION 'contract_charges.client_id (%) diverge da series.client_id', NEW.client_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_check_charge_series_client ON public.contract_charges;
CREATE TRIGGER trg_check_charge_series_client
  BEFORE INSERT OR UPDATE OF client_id, series_id ON public.contract_charges
  FOR EACH ROW EXECUTE FUNCTION public.check_charge_series_client();

-- ============================================================================
-- 3) billing_payments: series_id (faturas separadas por série)
-- ============================================================================
ALTER TABLE public.billing_payments ADD COLUMN IF NOT EXISTS series_id uuid;

UPDATE public.billing_payments p SET series_id = s.id
FROM public.contract_series s
WHERE s.client_id = p.client_id AND s.kind = 'original' AND p.series_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.billing_payments WHERE series_id IS NULL) THEN
    RAISE EXCEPTION 'backfill incompleto: existem payments sem series_id';
  END IF;
END $$;

ALTER TABLE public.billing_payments ALTER COLUMN series_id SET NOT NULL;
ALTER TABLE public.billing_payments
  ADD CONSTRAINT billing_payments_series_id_fkey
  FOREIGN KEY (series_id) REFERENCES public.contract_series(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.billing_payments VALIDATE CONSTRAINT billing_payments_series_id_fkey;

-- PK passa a permitir 2 faturas no mesmo mês (séries distintas)
ALTER TABLE public.billing_payments DROP CONSTRAINT IF EXISTS billing_payments_pkey;
ALTER TABLE public.billing_payments ADD PRIMARY KEY (client_id, series_id, ref_month);

CREATE INDEX IF NOT EXISTS idx_payments_series_month ON public.billing_payments(series_id, ref_month DESC);
CREATE INDEX IF NOT EXISTS idx_payments_client_month ON public.billing_payments(client_id, ref_month DESC);

-- Trigger delay_days continua válido (não referencia PK; pega último mês do cliente entre séries)
