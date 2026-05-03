-- ============================================================
-- 020_donc_api_integration — Integração API DONC
-- Tabela client_donc_instances, colunas em client_usage,
-- pg_cron job mensal, e seed de instâncias conhecidas
-- ============================================================

-- ── Tabela de instâncias DONC por cliente ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_donc_instances (
  id                serial PRIMARY KEY,
  client_id         integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contrato_saas_id  integer NOT NULL,
  label             text NOT NULL,
  url_donc          text,
  app_code          text,
  weight            decimal(4,3) DEFAULT 1.0,
  active            boolean DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instances_client_contrato
  ON client_donc_instances(client_id, contrato_saas_id);

ALTER TABLE client_donc_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read instances"
  ON client_donc_instances FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin write instances"
  ON client_donc_instances FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- ── Novas colunas em client_usage ─────────────────────────────────────────────
ALTER TABLE client_usage
  ADD COLUMN IF NOT EXISTS instance_id           integer REFERENCES client_donc_instances(id),
  ADD COLUMN IF NOT EXISTS os_finalizadas        integer,
  ADD COLUMN IF NOT EXISTS os_abertas            integer,
  ADD COLUMN IF NOT EXISTS os_canceladas         integer,
  ADD COLUMN IF NOT EXISTS profissionais_inativos integer,
  ADD COLUMN IF NOT EXISTS unidades              integer,
  ADD COLUMN IF NOT EXISTS os_por_tipo           jsonb,
  ADD COLUMN IF NOT EXISTS pending               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS donc_snapshot         jsonb;

-- ── pg_cron ───────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job mensal: dia 1 de cada mês às 09:00 UTC
SELECT cron.schedule(
  'donc-api-monthly-sync',
  '0 9 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/donc-api-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{"trigger":"cron","month":"previous"}'::jsonb
  )
  $$
);

-- ── Seed de instâncias conhecidas ─────────────────────────────────────────────
INSERT INTO client_donc_instances (client_id, contrato_saas_id, label, weight)
VALUES
  (16, 1004, 'Principal', 1.0),
  (2,  1028, 'Principal', 1.0),
  (5,  1042, 'Principal', 1.0)
ON CONFLICT (client_id, contrato_saas_id) DO NOTHING;
