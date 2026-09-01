-- Empresas v2 Phase 3 contract motor — eventuais + recorrência + tiers OS
-- Additive only, labs-safe

-- 1) contract_charges: one row per month/charge (eventuais parcelados + recorrência expandida)
CREATE TABLE IF NOT EXISTS public.contract_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id int NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('implantacao','recorrencia')),
  mode text NOT NULL CHECK (mode IN ('absolute','percent')),
  month_index smallint NOT NULL CHECK (month_index BETWEEN 1 AND 120),
  amount numeric(12,2) CHECK (amount > 0),
  percent numeric(5,2) CHECK (percent > 0 AND percent <= 100),
  installment_group uuid,
  installments_total smallint CHECK (installments_total BETWEEN 1 AND 120),
  label text,
  reason text CHECK (char_length(reason) >= 10 OR reason IS NULL),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_amount_xor_percent CHECK (
    (mode='absolute' AND amount IS NOT NULL AND percent IS NULL) OR
    (mode='percent'  AND percent IS NOT NULL AND amount IS NULL)
  ),
  UNIQUE (client_id, kind, month_index, installment_group)
);

CREATE INDEX IF NOT EXISTS idx_charges_client_month ON public.contract_charges(client_id, month_index);
CREATE INDEX IF NOT EXISTS idx_charges_group ON public.contract_charges(installment_group);
CREATE INDEX IF NOT EXISTS idx_charges_client_kind ON public.contract_charges(client_id, kind);

ALTER TABLE public.contract_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS charges_select ON public.contract_charges;
CREATE POLICY charges_select ON public.contract_charges FOR SELECT USING (
  public.get_user_role() IN ('admin','manager','finance','sales','csm')
);

DROP POLICY IF EXISTS charges_write ON public.contract_charges;
CREATE POLICY charges_write ON public.contract_charges FOR ALL USING (
  public.get_user_role() IN ('admin','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','finance','sales')
);

REVOKE ALL ON TABLE public.contract_charges FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contract_charges TO authenticated;

-- 2) billing_os_tiers: 1..5 tiers configuráveis, franquia = tier1.limit_to
CREATE TABLE IF NOT EXISTS public.billing_os_tiers (
  client_id int NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tier_order smallint NOT NULL CHECK (tier_order BETWEEN 1 AND 5),
  limit_to int NOT NULL CHECK (limit_to > 0),
  fixed_value numeric(12,2) NOT NULL CHECK (fixed_value > 0),
  excess_unit_price numeric(12,4) NOT NULL DEFAULT 0.95 CHECK (excess_unit_price >= 0),
  PRIMARY KEY (client_id, tier_order)
);

CREATE INDEX IF NOT EXISTS idx_os_tiers_client ON public.billing_os_tiers(client_id);
ALTER TABLE public.billing_os_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_tiers_select ON public.billing_os_tiers;
CREATE POLICY os_tiers_select ON public.billing_os_tiers FOR SELECT USING (
  public.get_user_role() IN ('admin','manager','finance','sales','csm')
);

DROP POLICY IF EXISTS os_tiers_write ON public.billing_os_tiers;
CREATE POLICY os_tiers_write ON public.billing_os_tiers FOR ALL USING (
  public.get_user_role() IN ('admin','finance','sales')
) WITH CHECK (
  public.get_user_role() IN ('admin','finance','sales')
);

REVOKE ALL ON TABLE public.billing_os_tiers FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_os_tiers TO authenticated;

-- Trigger to ensure limit_to strictly increasing per client
CREATE OR REPLACE FUNCTION public.check_os_tiers_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.billing_os_tiers
    WHERE client_id = NEW.client_id
      AND tier_order < NEW.tier_order
      AND limit_to >= NEW.limit_to
  ) THEN
    RAISE EXCEPTION 'tier limit_to must be strictly increasing' USING errcode='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.billing_os_tiers
    WHERE client_id = NEW.client_id
      AND tier_order > NEW.tier_order
      AND limit_to <= NEW.limit_to
  ) THEN
    RAISE EXCEPTION 'tier limit_to must be strictly increasing' USING errcode='23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_os_tiers_order ON public.billing_os_tiers;
CREATE TRIGGER trg_os_tiers_order BEFORE INSERT OR UPDATE ON public.billing_os_tiers FOR EACH ROW EXECUTE FUNCTION public.check_os_tiers_order();

-- Verify:
-- \d contract_charges
-- \d billing_os_tiers
