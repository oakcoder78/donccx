-- Commercial owner for sales portfolio (dual ownership with csm_id)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS comercial_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_comercial_id ON public.clients(comercial_id);
CREATE INDEX IF NOT EXISTS idx_clients_lifecycle_stage ON public.clients(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_clients_lc_comercial ON public.clients(lifecycle_stage, comercial_id) WHERE lifecycle_stage = 'cliente';

COMMENT ON COLUMN public.clients.comercial_id IS 'Commercial owner — separate from csm_id. Dual ownership for sales portfolio. Sales sees where comercial_id = auth.uid() OR csm_id = auth.uid().';
