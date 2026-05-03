-- Solicitações de acesso — sem FK para auth.users (usuário ainda não existe)
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'rejected')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer visitante pode submeter uma solicitação
CREATE POLICY "public insert access_requests" ON access_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Apenas admin/manager podem visualizar e gerenciar
CREATE POLICY "admin manage access_requests" ON access_requests
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager'))
  );
