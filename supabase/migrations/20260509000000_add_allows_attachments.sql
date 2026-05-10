-- ============================================================
-- Migration: add_allows_attachments_to_fase_types_and_fases
-- Adds allows_attachments flag to onboarding_fase_types (catalog)
-- and onboarding_fases (instance), enabling per-fase control over
-- attachment uploads independent from evidence requirements.
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 1. onboarding_fase_types — catalog column
ALTER TABLE "public"."onboarding_fase_types"
  ADD COLUMN IF NOT EXISTS "allows_attachments" boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN "public"."onboarding_fase_types"."allows_attachments" IS
  'Whether fase instances can accept file attachments.';

-- 2. onboarding_fases — instance column
ALTER TABLE "public"."onboarding_fases"
  ADD COLUMN IF NOT EXISTS "allows_attachments" boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN "public"."onboarding_fases"."allows_attachments" IS
  'Per-instance override for attachment uploads.';

-- 3. Update create_default_fases to propagate both flags
CREATE OR REPLACE FUNCTION "public"."create_default_fases"("p_onboarding_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_type record;
  v_order integer := 0;
BEGIN
  FOR v_type IN
    SELECT id, is_milestone, requires_evidence, allows_attachments, display_order
    FROM public.onboarding_fase_types
    WHERE active = true
    ORDER BY display_order
  LOOP
    v_order := v_order + 1;
    INSERT INTO public.onboarding_fases (
      onboarding_id, fase_type_id, display_order,
      status, evidence_required, allows_attachments
    ) VALUES (
      p_onboarding_id,
      v_type.id,
      v_type.display_order,
      CASE WHEN v_order = 1 THEN 'ativa' ELSE 'pendente' END,
      v_type.requires_evidence,
      v_type.allows_attachments
    )
    ON CONFLICT (onboarding_id, fase_type_id) DO NOTHING;
  END LOOP;

  UPDATE public.onboardings
  SET fase_atual_id = (
    SELECT id FROM public.onboarding_fases
    WHERE onboarding_id = p_onboarding_id
    ORDER BY display_order
    LIMIT 1
  )
  WHERE id = p_onboarding_id;
END;
$$;

-- 4. Index for future query performance
CREATE INDEX IF NOT EXISTS "idx_onb_fases_allows_attachments"
  ON "public"."onboarding_fases" ("allows_attachments");
