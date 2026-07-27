-- Create sync_service_log: per-service sync execution tracking
-- See docs/superpowers/specs/2026-07-27-sync-service-log-design.md
-- Backlog: TD-006

CREATE TABLE public.sync_service_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_name  text NOT NULL
                CHECK (service_name IN ('donc-api', 'freshdesk', 'health-recalc')),
  status        text NOT NULL
                CHECK (status IN ('running', 'success', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  triggered_by  text NOT NULL DEFAULT 'manual'
                CHECK (triggered_by IN ('manual', 'cron', 'client-sync')),
  ref_month     text,                              -- YYYY-MM, matches client_usage.ref_month format
  instance_id   integer REFERENCES public.client_donc_instances(id) ON DELETE SET NULL,
  summary       jsonb,                             -- { synced: N, failed: N }
  error_message text
);

-- Cockpit: MAX(finished_at) filtered by service + month + status
CREATE INDEX idx_sync_service_lookup
  ON sync_service_log (service_name, ref_month, status);

-- Settings UI / useSyncStatus: latest run per service
CREATE INDEX idx_sync_service_latest
  ON sync_service_log (service_name, started_at DESC);

-- Operational: detect hung "running" jobs
CREATE INDEX idx_sync_service_stuck
  ON sync_service_log (status, started_at)
  WHERE status = 'running';

-- RLS: reads open to authenticated, writes restricted to service_role
ALTER TABLE sync_service_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_service_log_select_authenticated"
  ON sync_service_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sync_service_log_insert_service_role"
  ON sync_service_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "sync_service_log_update_service_role"
  ON sync_service_log FOR UPDATE
  TO service_role
  USING (true);
