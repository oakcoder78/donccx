-- ============================================================
-- 024_activity_attachments_fields — Expansão da tabela de anexos
-- Adiciona suporte a client_id, uploader, tipo de arquivo,
-- caminho no storage e soft delete lógico
-- ============================================================

-- ── Novas colunas em activity_attachments ─────────────────────

ALTER TABLE public.activity_attachments
  ADD COLUMN IF NOT EXISTS client_id integer REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- ── Índices para otimização de consultas ─────────────────────

CREATE INDEX IF NOT EXISTS idx_activity_attachments_activity
  ON public.activity_attachments(activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_attachments_client
  ON public.activity_attachments(client_id);

-- ── Índice para listagem de anexos ativos ─────────────────────

CREATE INDEX IF NOT EXISTS idx_activity_attachments_active
  ON public.activity_attachments(activity_id, is_deleted);