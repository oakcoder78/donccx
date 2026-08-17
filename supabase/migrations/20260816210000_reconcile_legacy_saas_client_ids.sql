-- Track legacy client rows whose IDs were populated from external SaaS contract IDs.
-- These rows are preserved for now and are not deleted by this migration.
CREATE TABLE IF NOT EXISTS public.client_id_reconciliation (
  legacy_client_id integer PRIMARY KEY,
  canonical_client_id integer NOT NULL REFERENCES public.clients(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'migrated', 'archived', 'deleted')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.client_id_reconciliation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_id_reconciliation_admin_manager" ON public.client_id_reconciliation;
CREATE POLICY "client_id_reconciliation_admin_manager"
  ON public.client_id_reconciliation
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ));

INSERT INTO public.client_id_reconciliation (legacy_client_id, canonical_client_id, reason, notes)
VALUES
  (1050, 15, 'saas_id_used_as_client_id', 'Legacy row matches contrato_saas_id 1050; canonical owner is client 15.'),
  (1067, 3,  'saas_id_used_as_client_id', 'Legacy row matches contrato_saas_id 1067; canonical owner is client 3, instance Atacado.'),
  (1074, 3,  'saas_id_used_as_client_id', 'Legacy row matches contrato_saas_id 1074; canonical owner is client 3, instance Lojas Físicas.'),
  (1081, 24, 'saas_id_used_as_client_id', 'Legacy row matches contrato_saas_id 1081; canonical owner is client 24.'),
  (1084, 27, 'saas_id_used_as_client_id', 'Legacy row matches contrato_saas_id 1084; canonical owner is client 27.'),
  (1087, 28, 'saas_id_used_as_client_id', 'Legacy row matches contrato_saas_id 1087; canonical owner is client 28.')
ON CONFLICT (legacy_client_id) DO NOTHING;

-- A SaaS contract belongs to one CRM client. Keep the existing composite index
-- for upserts, but also prevent the same external contract being assigned to
-- two different clients.
CREATE UNIQUE INDEX IF NOT EXISTS client_donc_instances_contrato_saas_unique
  ON public.client_donc_instances (contrato_saas_id)
  WHERE contrato_saas_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_donc_instances_contrato_saas_positive'
  ) THEN
    ALTER TABLE public.client_donc_instances
      ADD CONSTRAINT client_donc_instances_contrato_saas_positive
      CHECK (contrato_saas_id > 0);
  END IF;
END $$;
