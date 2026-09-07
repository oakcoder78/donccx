-- Série = folha de cobrança completa: plano, status, tiers e mods por série
-- clients.* mantido como espelho da série original (leitores legados intactos)

-- ============================================================================
-- 1) contract_series += envelope do plano (backfill a partir de clients)
-- ============================================================================
ALTER TABLE public.contract_series
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'por_licenca'
    CHECK (billing_type IN ('por_licenca','por_os')),
  ADD COLUMN IF NOT EXISTS billing_base_value numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_floor int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS billing_suspended_until date,
  ADD COLUMN IF NOT EXISTS correction_index text,
  ADD COLUMN IF NOT EXISTS contract_signed_date date,
  ADD COLUMN IF NOT EXISTS contract_renewal date;

UPDATE public.contract_series s SET
  billing_type = COALESCE(cl.billing_type, 'por_licenca'),
  billing_base_value = COALESCE(cl.billing_base_value, 0),
  billing_floor = COALESCE(cl.billing_floor, 0),
  billing_status = CASE WHEN cl.contract_active IS FALSE THEN 'nao_bilhetavel' ELSE 'ativo' END,
  correction_index = cl.correction_index,
  contract_signed_date = cl.contract_signed_date,
  contract_renewal = cl.contract_renewal
FROM public.clients cl
WHERE cl.id = s.client_id;

-- ============================================================================
-- 2) billing_os_tiers += series_id (tabela vazia hoje — troca de PK livre)
-- ============================================================================
ALTER TABLE public.billing_os_tiers ADD COLUMN IF NOT EXISTS series_id uuid;

-- Garante série original para eventual cliente com tiers mas sem série
INSERT INTO public.contract_series (client_id, label, kind, billing_start, due_day, status,
  billing_type, billing_base_value, billing_floor)
SELECT DISTINCT t.client_id, 'Contrato original', 'original',
       COALESCE(cl.contract_start, CURRENT_DATE),
       extract(day from COALESCE(cl.contract_start, CURRENT_DATE))::smallint, 'ativa',
       COALESCE(cl.billing_type, 'por_licenca'), COALESCE(cl.billing_base_value, 0), COALESCE(cl.billing_floor, 0)
FROM public.billing_os_tiers t
JOIN public.clients cl ON cl.id = t.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_series s
  WHERE s.client_id = t.client_id AND s.kind = 'original'
)
ON CONFLICT DO NOTHING;

UPDATE public.billing_os_tiers t SET series_id = s.id
FROM public.contract_series s
WHERE s.client_id = t.client_id AND s.kind = 'original' AND t.series_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.billing_os_tiers WHERE series_id IS NULL) THEN
    RAISE EXCEPTION 'backfill incompleto: tiers sem series_id';
  END IF;
END $$;

ALTER TABLE public.billing_os_tiers ALTER COLUMN series_id SET NOT NULL;
ALTER TABLE public.billing_os_tiers
  ADD CONSTRAINT billing_os_tiers_series_id_fkey
  FOREIGN KEY (series_id) REFERENCES public.contract_series(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.billing_os_tiers VALIDATE CONSTRAINT billing_os_tiers_series_id_fkey;

ALTER TABLE public.billing_os_tiers DROP CONSTRAINT IF EXISTS billing_os_tiers_pkey;
ALTER TABLE public.billing_os_tiers ADD PRIMARY KEY (client_id, series_id, tier_order);
CREATE INDEX IF NOT EXISTS idx_os_tiers_series ON public.billing_os_tiers(series_id, tier_order);

-- ============================================================================
-- 3) module_pricing += series_id (NULLABLE — form legado escreve sem série)
-- ============================================================================
ALTER TABLE public.module_pricing ADD COLUMN IF NOT EXISTS series_id uuid;

INSERT INTO public.contract_series (client_id, label, kind, billing_start, due_day, status,
  billing_type, billing_base_value, billing_floor)
SELECT DISTINCT m.client_id, 'Contrato original', 'original',
       COALESCE(cl.contract_start, CURRENT_DATE),
       extract(day from COALESCE(cl.contract_start, CURRENT_DATE))::smallint, 'ativa',
       COALESCE(cl.billing_type, 'por_licenca'), COALESCE(cl.billing_base_value, 0), COALESCE(cl.billing_floor, 0)
FROM public.module_pricing m
JOIN public.clients cl ON cl.id = m.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.contract_series s
  WHERE s.client_id = m.client_id AND s.kind = 'original'
)
ON CONFLICT DO NOTHING;

UPDATE public.module_pricing m SET series_id = s.id
FROM public.contract_series s
WHERE s.client_id = m.client_id AND s.kind = 'original' AND m.series_id IS NULL;

ALTER TABLE public.module_pricing
  ADD CONSTRAINT module_pricing_series_id_fkey
  FOREIGN KEY (series_id) REFERENCES public.contract_series(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.module_pricing VALIDATE CONSTRAINT module_pricing_series_id_fkey;
CREATE INDEX IF NOT EXISTS idx_module_pricing_series ON public.module_pricing(series_id, catalog_item_id);
