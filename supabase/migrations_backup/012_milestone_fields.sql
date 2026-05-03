-- 012 — Adiciona description e responsible_id em milestones
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS description    text;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS responsible_id uuid references profiles(id);
