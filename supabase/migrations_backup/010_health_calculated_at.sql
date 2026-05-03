-- ============================================================
-- 010 — Adiciona health_calculated_at na tabela clients
-- Execute no Supabase SQL Editor
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS health_calculated_at timestamptz;
