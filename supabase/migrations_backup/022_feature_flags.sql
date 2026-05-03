CREATE TABLE IF NOT EXISTS feature_flags (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  enabled boolean DEFAULT false,
  allowed_roles text[] DEFAULT ARRAY['admin','manager','csm','analyst'],
  description text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read feature_flags" ON feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write feature_flags" ON feature_flags FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

INSERT INTO feature_flags (key, enabled, allowed_roles, description) VALUES
  ('donkie', false, ARRAY['admin','manager','csm'], 'Módulo Donkie — assistente de IA integrado'),
  ('whatsapp_atendimento', true, ARRAY['admin','manager','csm','analyst'], 'Módulo de Atendimento WhatsApp'),
  ('api_donc', true, ARRAY['admin','manager'], 'Integração com API DONC — sincronização de dados operacionais')
ON CONFLICT (key) DO NOTHING;
