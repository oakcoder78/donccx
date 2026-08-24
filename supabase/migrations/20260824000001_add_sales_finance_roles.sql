-- Add sales and finance roles (English keys, labels PT: Comercial, Financeiro)
-- Existing check: ('admin','manager','csm','analyst')
-- New check includes sales (commercial pipeline) and finance (billing + headcount)

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'csm'::text, 'analyst'::text, 'sales'::text, 'finance'::text]));

COMMENT ON COLUMN public.profiles.role IS 'Roles: admin, manager, csm, analyst, sales (Comercial), finance (Financeiro)';
