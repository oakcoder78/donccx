-- Labs Dashboard — Meu Dia + Cockpits isolados (branch-by-abstraction)
-- New dashboard at /labs/dashboard coexists with legacy /dashboard until Phase 6

INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES ('labs_dashboard', 'Labs Dashboard — Meu Dia + Cockpits isolados', false, ARRAY['admin','manager','csm','sales','finance','analyst'])
ON CONFLICT (key) DO NOTHING;
