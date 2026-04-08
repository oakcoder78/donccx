-- 014 — Suporte a múltiplos IDs Freshdesk por cliente
ALTER TABLE clients ADD COLUMN IF NOT EXISTS freshdesk_company_ids integer[];

-- Lojas Solar: dois IDs Freshdesk
UPDATE clients SET freshdesk_company_ids = ARRAY[70000732163, 70000732200] WHERE id = 17;

-- Lojão Rio do Peixe: corrige ID errado (era 70000732242 = Feirão Magazine) e adiciona ao array
UPDATE clients SET freshdesk_company_id  = 70000732245,
                   freshdesk_company_ids = ARRAY[70000732245]
WHERE id = 15;
