-- ============================================================
-- 037 — Clients lifecycle stage
-- ============================================================

-- Etapa 1: adicionar coluna lifecycle_stage na tabela clients
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS lifecycle_stage text DEFAULT 'lead' NOT NULL;

-- Etapa 2: recriar constraint de valores permitidos
DO $$
DECLARE
  cname text;
BEGIN
  -- Localiza constraint existente (se houver)
  SELECT constraint_name INTO cname
  FROM information_schema.table_constraints
  WHERE table_name = 'clients'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%lifecycle_stage%';

  -- Remove constraint antiga se existir
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE clients DROP CONSTRAINT ' || quote_ident(cname);
  END IF;

  -- Cria nova constraint com valores permitidos
  ALTER TABLE clients
  ADD CONSTRAINT clients_lifecycle_stage_check
  CHECK (
    lifecycle_stage IN (
      'lead',
      'prospect',
      'cliente',
      'parceiro',
      'teste'
    )
  );

EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Etapa 3: atualizar registros existentes
UPDATE clients
SET lifecycle_stage =
  CASE
    WHEN contract_active = true THEN 'cliente'
    ELSE 'lead'
  END
WHERE lifecycle_stage IS NULL
   OR lifecycle_stage = 'lead';