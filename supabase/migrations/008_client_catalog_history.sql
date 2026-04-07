-- ============================================================
-- 008 — client_catalog_history: rastreamento de mudanças de status
--
-- ATENÇÃO: client_catalog usava PK composta (client_id, catalog_item_id).
-- Este script adiciona coluna id BIGSERIAL e recria a PK, mantendo a
-- unicidade do par (client_id, catalog_item_id) como UNIQUE constraint.
-- ============================================================

-- Passo 1: adiciona id a client_catalog (se ainda não existir)
ALTER TABLE client_catalog ADD COLUMN IF NOT EXISTS id BIGSERIAL;

-- Passo 2: recria a PK em id (idempotente via bloco DO)
DO $$
BEGIN
  -- Verifica se id já é PK antes de alterar
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_name = tc.table_name
    WHERE tc.table_name = 'client_catalog'
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = 'id'
  ) THEN
    ALTER TABLE client_catalog DROP CONSTRAINT IF EXISTS client_catalog_pkey;
    ALTER TABLE client_catalog ADD PRIMARY KEY (id);
    ALTER TABLE client_catalog ADD CONSTRAINT client_catalog_unique_pair
      UNIQUE (client_id, catalog_item_id);
  END IF;
END $$;

-- Passo 3: tabela de histórico
-- client_id e catalog_item_id são INTEGER (serial) neste schema
CREATE TABLE IF NOT EXISTS client_catalog_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_catalog_id BIGINT  REFERENCES client_catalog(id) ON DELETE CASCADE,
  client_id     INTEGER     NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  catalog_item_id INTEGER   NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo   TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cch_client_id  ON client_catalog_history(client_id);
CREATE INDEX IF NOT EXISTS idx_cch_changed_at ON client_catalog_history(changed_at);

-- Passo 4: função de trigger
CREATE OR REPLACE FUNCTION fn_client_catalog_history()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) OR TG_OP = 'INSERT' THEN
    INSERT INTO client_catalog_history
      (client_catalog_id, client_id, catalog_item_id, status_anterior, status_novo, changed_at)
    VALUES (
      NEW.id,
      NEW.client_id,
      NEW.catalog_item_id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Passo 5: trigger (recriado se já existir)
DROP TRIGGER IF EXISTS trg_client_catalog_history ON client_catalog;
CREATE TRIGGER trg_client_catalog_history
AFTER INSERT OR UPDATE ON client_catalog
FOR EACH ROW EXECUTE FUNCTION fn_client_catalog_history();
