-- Add cs_radar feature flag
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES (
  'cs_radar',
  'CS Radar — painel de atividades do CS',
  false,
  ARRAY['admin', 'manager', 'csm'],
  now()
)
ON CONFLICT (key) DO NOTHING;
