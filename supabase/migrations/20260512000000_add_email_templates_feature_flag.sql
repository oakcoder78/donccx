-- ─── feature_flags: add email_templates ─────────────────────────────────────
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES (
  'email_templates',
  'Módulo de templates de e-mail — gerenciamento de templates HTML para envio via Resend',
  true,
  ARRAY['admin', 'manager'],
  now()
)
ON CONFLICT (key) DO NOTHING;