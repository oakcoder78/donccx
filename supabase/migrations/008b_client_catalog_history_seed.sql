-- ============================================================
-- 008b — Seed histórico inicial para registros já existentes em client_catalog
--
-- Idempotente: só insere onde ainda não existe entrada em client_catalog_history.
-- Usa contract_start como data de referência; fallback para created_at.
-- Nota: contract_signed_date não existe na migration inicial; removido do COALESCE.
-- ============================================================

INSERT INTO client_catalog_history
  (client_catalog_id, client_id, catalog_item_id, status_anterior, status_novo, changed_at)
SELECT
  cc.id,
  cc.client_id,
  cc.catalog_item_id,
  NULL,
  COALESCE(cc.status, 'implantado'),
  COALESCE(c.contract_start::timestamptz, c.created_at)
FROM client_catalog cc
JOIN clients c ON c.id = cc.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM client_catalog_history cch
  WHERE cch.client_catalog_id = cc.id
);
