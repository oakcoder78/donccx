-- ============================================================
-- 004 — Freshdesk integration
-- ============================================================

-- Etapa 1: coluna de mapeamento na tabela clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS freshdesk_company_id integer;

-- Etapa 3: suporte a revisão de dados importados do Freshdesk
ALTER TABLE client_support ADD COLUMN IF NOT EXISTS pending boolean DEFAULT false;
ALTER TABLE client_support ADD COLUMN IF NOT EXISTS freshdesk_snapshot jsonb;

-- Adiciona papel "Técnico" ao check constraint de contact_links
DO $$
DECLARE
  cname text;
BEGIN
  SELECT constraint_name INTO cname
  FROM information_schema.table_constraints
  WHERE table_name = 'contact_links'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%papel%';

  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE contact_links DROP CONSTRAINT ' || quote_ident(cname);
  END IF;

  ALTER TABLE contact_links ADD CONSTRAINT contact_links_papel_check
    CHECK (papel IN ('Decisor', 'Influenciador', 'Usuário', 'Técnico'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
