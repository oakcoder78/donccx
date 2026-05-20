-- Enable cs_radar feature flag for production
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES ('cs_radar', 'CS Radar — painel de atividades do CS', true, ARRAY['admin','manager','csm'], now())
ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now();
