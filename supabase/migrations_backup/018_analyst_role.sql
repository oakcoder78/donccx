-- ============================================================
-- 018_analyst_role — Adiciona role 'analyst' em profiles
-- ============================================================
-- O check constraint inline do CREATE TABLE recebe o nome
-- automático profiles_role_check no PostgreSQL.
-- Removemos e recriamos com 'analyst' incluído.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'csm', 'analyst'));
