-- ============================================================
-- Drop redundant app_code / url_donc columns from clients
-- TD-001 — see docs/backlog.md
-- ============================================================
-- The clients.app_code and clients.url_donc columns were made
-- redundant when client_donc_instances started carrying the
-- canonical values per contract (migration 020). Form inputs and
-- display in the UI were removed in a9c36d2; this migration
-- backfills any missing instance rows from the legacy columns
-- and then drops them.
-- ============================================================

-- ── Backfill: copy values into client_donc_instances where missing ─────────────
UPDATE client_donc_instances i
  SET url_donc = c.url_donc,
      app_code = c.app_code
FROM clients c
WHERE i.client_id = c.id
  AND (i.url_donc IS NULL OR i.app_code IS NULL)
  AND (c.url_donc IS NOT NULL OR c.app_code IS NOT NULL);

-- ── Drop the legacy columns from clients ──────────────────────────────────────
ALTER TABLE clients DROP COLUMN app_code;
ALTER TABLE clients DROP COLUMN url_donc;
