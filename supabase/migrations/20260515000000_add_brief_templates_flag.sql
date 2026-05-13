-- Add brief_templates feature flag
INSERT INTO feature_flags (key, enabled, allowed_roles, description)
VALUES ('brief_templates', true, ARRAY['admin', 'manager', 'csm', 'analyst'], 'Gestão de Templates de Brief')
ON CONFLICT (key) DO NOTHING;