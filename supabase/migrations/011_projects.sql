-- ============================================================
-- 011 — Projects: tabela projects, FK em milestones, regras HS
-- ============================================================

-- 1. Tabela projects
CREATE TABLE IF NOT EXISTS projects (
  id             serial primary key,
  client_id      integer not null references clients(id) on delete cascade,
  title          text not null,
  description    text,
  responsible_id uuid references profiles(id),
  start_date     date,
  end_date       date,
  status         text not null default 'em_andamento'
                 check (status in ('planejado','em_andamento','concluido','suspenso')),
  created_at     timestamptz not null default now()
);

-- 2. FK nullable em milestones (não quebra dados existentes)
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS project_id integer references projects(id);

-- 3. due_date em milestone_tasks (nullable, sem breaking change)
ALTER TABLE milestone_tasks ADD COLUMN IF NOT EXISTS due_date date;

-- 4. RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'projects' AND policyname = 'Authenticated users'
  ) THEN
    CREATE POLICY "Authenticated users" ON projects
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Projeto padrão por cliente que já tem milestones
INSERT INTO projects (client_id, title, status, responsible_id)
SELECT DISTINCT ON (m.client_id)
  m.client_id,
  'Projeto Principal',
  'em_andamento',
  c.csm_id
FROM milestones m
JOIN clients c ON c.id = m.client_id;

-- 6. Vincular milestones existentes ao projeto padrão do cliente
UPDATE milestones m
SET project_id = p.id
FROM projects p
WHERE p.client_id = m.client_id
  AND m.project_id IS NULL;

-- 7. Novas regras de health score
INSERT INTO health_rules (dimension, label, rule_key, points)
SELECT 'projeto', 'Projeto com prazo estourado', 'projeto_atrasado', -5
WHERE NOT EXISTS (SELECT 1 FROM health_rules WHERE rule_key = 'projeto_atrasado');

INSERT INTO health_rules (dimension, label, rule_key, points)
SELECT 'projeto', 'Tarefa vencida em milestone ativo', 'tarefa_atrasada', -3
WHERE NOT EXISTS (SELECT 1 FROM health_rules WHERE rule_key = 'tarefa_atrasada');
