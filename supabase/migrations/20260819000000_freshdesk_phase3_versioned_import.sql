-- Phase 3 — Versioned import and independent review (MVP)
-- Extends client_support with run_id, independent statuses, revision and staging
-- Keeps UNIQUE(client_id, ref_month) for MVP; previous_snapshot preserves published data on reimport
-- See docs/sdd/2026-08-16-freshdesk-operations-center-sdd.md Phase 3

-- 1. Add columns (idempotent)
ALTER TABLE public.client_support
  ADD COLUMN IF NOT EXISTS run_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS metrics_status text DEFAULT 'pending' CHECK (metrics_status IN ('pending','approved','published','rejected','error')),
  ADD COLUMN IF NOT EXISTS contacts_status text DEFAULT 'pending' CHECK (contacts_status IN ('pending','approved','published','rejected','error')),
  ADD COLUMN IF NOT EXISTS revision integer DEFAULT 1 CHECK (revision >= 1),
  ADD COLUMN IF NOT EXISTS previous_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'freshdesk' CHECK (source IN ('freshdesk','manual','cron','n8n'));

-- 2. Backfill existing rows from current pending flag
UPDATE public.client_support
SET
  metrics_status = CASE WHEN pending THEN 'pending' ELSE 'published' END,
  contacts_status = CASE WHEN pending THEN 'pending' ELSE 'published' END,
  published_at = CASE WHEN NOT pending THEN now() ELSE NULL END,
  run_id = COALESCE(run_id, gen_random_uuid())
WHERE metrics_status IS NULL OR contacts_status IS NULL;

-- 3. Ensure run_id is not null after backfill
ALTER TABLE public.client_support ALTER COLUMN run_id SET NOT NULL;
ALTER TABLE public.client_support ALTER COLUMN run_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.client_support ALTER COLUMN revision SET DEFAULT 1;
ALTER TABLE public.client_support ALTER COLUMN metrics_status SET DEFAULT 'pending';
ALTER TABLE public.client_support ALTER COLUMN contacts_status SET DEFAULT 'pending';

-- 4. Index for pending review queries (already used) and for run_id idempotency
CREATE INDEX IF NOT EXISTS idx_client_support_pending ON public.client_support(pending) WHERE pending = true;
CREATE INDEX IF NOT EXISTS idx_client_support_metrics_status ON public.client_support(metrics_status);
CREATE INDEX IF NOT EXISTS idx_client_support_contacts_status ON public.client_support(contacts_status);
CREATE INDEX IF NOT EXISTS idx_client_support_run_id ON public.client_support(run_id);

COMMENT ON COLUMN public.client_support.run_id IS 'Phase 3: idempotency key per import execution';
COMMENT ON COLUMN public.client_support.metrics_status IS 'Phase 3: pending|approved|published|rejected|error — independent from contacts_status';
COMMENT ON COLUMN public.client_support.contacts_status IS 'Phase 3: pending|approved|published|rejected|error — independent from metrics_status';
COMMENT ON COLUMN public.client_support.revision IS 'Phase 3: revision number for same (client_id, ref_month); incremented on reimport of published month';
COMMENT ON COLUMN public.client_support.previous_snapshot IS 'Phase 3: previous published snapshot for rollback/comparison when reimporting a published month';
COMMENT ON COLUMN public.client_support.published_at IS 'Phase 3: when current revision was published';
