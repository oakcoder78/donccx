-- Sincroniza client_catalog a partir de module_pricing para todos os clientes ativos.
-- Garante que qualquer módulo habilitado em module_pricing esteja presente em client_catalog.
INSERT INTO client_catalog (client_id, catalog_item_id)
SELECT mp.client_id, mp.catalog_item_id
FROM module_pricing mp
INNER JOIN clients c ON c.id = mp.client_id AND c.contract_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM client_catalog cc
  WHERE cc.client_id = mp.client_id
    AND cc.catalog_item_id = mp.catalog_item_id
)
ON CONFLICT DO NOTHING;
