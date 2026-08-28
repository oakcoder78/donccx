-- Restrict labs_dashboard to admin only at start (Phase 0)
-- Legacy /dashboard remains ungated; labs is additive and hidden until admin enables per role

UPDATE public.feature_flags
SET allowed_roles = ARRAY['admin']
WHERE key = 'labs_dashboard';
