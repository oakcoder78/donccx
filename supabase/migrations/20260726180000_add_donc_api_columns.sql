ALTER TABLE public.client_usage
  ADD COLUMN IF NOT EXISTS estabelecimentos jsonb,
  ADD COLUMN IF NOT EXISTS profissionais_versao jsonb;
