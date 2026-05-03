-- ============================================================
-- 019_freshdesk_config — Tabela de configuração Freshdesk
-- Armazena grupos, agentes e campos de ticket sincronizados
-- ============================================================

CREATE TABLE IF NOT EXISTS freshdesk_config (
  id         serial primary key,
  key        text unique not null,
  data       jsonb not null,
  updated_at timestamptz default now()
);

ALTER TABLE freshdesk_config ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
CREATE POLICY "freshdesk_config_select"
  ON freshdesk_config FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: apenas admin
CREATE POLICY "freshdesk_config_insert"
  ON freshdesk_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "freshdesk_config_update"
  ON freshdesk_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed inicial
INSERT INTO freshdesk_config (key, data)
  VALUES ('last_sync', '{}')
  ON CONFLICT (key) DO NOTHING;
