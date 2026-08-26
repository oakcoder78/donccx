-- Enable profissionais_cockpit for finance role (alongside existing admin,manager,csm)

UPDATE public.feature_flags
SET allowed_roles = (
  SELECT array_agg(DISTINCT r)
  FROM unnest(allowed_roles || ARRAY['finance']::text[]) AS r
)
WHERE key = 'profissionais_cockpit'
  AND NOT ('finance' = ANY(allowed_roles));
