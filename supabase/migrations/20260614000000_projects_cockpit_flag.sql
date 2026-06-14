-- Add projects_cockpit feature flag
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES (
  'projects_cockpit',
  'Project Cockpit — painel de projetos ativos por cliente',
  false,
  ARRAY['admin', 'manager', 'csm'],
  now()
)
ON CONFLICT (key) DO NOTHING;
