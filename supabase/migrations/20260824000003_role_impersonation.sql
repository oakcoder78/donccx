-- Role impersonation for admin backdoor (view as other role with real data)
-- Only admin can impersonate; impersonation affects RLS via get_user_role() override

-- Table to store active impersonation (one per admin user, expires in 1h)
CREATE TABLE IF NOT EXISTS public.role_impersonations (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_role text NOT NULL CHECK (target_role IN ('admin','manager','csm','analyst','sales','finance')),
  original_role text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '1 hour'
);

ALTER TABLE public.role_impersonations ENABLE ROW LEVEL SECURITY;

-- Only the owner can read/delete own impersonation; only admin can insert
DROP POLICY IF EXISTS "role_impersonations_self_select" ON public.role_impersonations;
CREATE POLICY "role_impersonations_self_select" ON public.role_impersonations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "role_impersonations_self_modify" ON public.role_impersonations;
CREATE POLICY "role_impersonations_self_modify" ON public.role_impersonations
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Updated get_user_role() to respect impersonation (only if original role is admin and not expired)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'admin' AND i.target_role IS NOT NULL AND i.expires_at > now() THEN i.target_role
    ELSE p.role
  END
  FROM public.profiles p
  LEFT JOIN public.role_impersonations i ON i.user_id = p.id AND i.expires_at > now()
  WHERE p.id = auth.uid()
$$;

-- Also provide helper to get effective role and original role for UI
CREATE OR REPLACE FUNCTION public.get_effective_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role()
$$;

-- RPC to set impersonation (admin only)
CREATE OR REPLACE FUNCTION public.set_impersonation(target text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orig text;
BEGIN
  SELECT role INTO orig FROM public.profiles WHERE id = auth.uid();
  IF orig IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admin can impersonate';
  END IF;
  IF target NOT IN ('admin','manager','csm','analyst','sales','finance') THEN
    RAISE EXCEPTION 'Invalid target role';
  END IF;
  -- If target is admin (or same as original), clear impersonation
  IF target = 'admin' THEN
    DELETE FROM public.role_impersonations WHERE user_id = auth.uid();
    RETURN;
  END IF;
  INSERT INTO public.role_impersonations (user_id, target_role, original_role, expires_at)
  VALUES (auth.uid(), target, orig, now() + interval '1 hour')
  ON CONFLICT (user_id) DO UPDATE SET target_role = EXCLUDED.target_role, original_role = EXCLUDED.original_role, created_at = now(), expires_at = now() + interval '1 hour';
END;
$$;

-- RPC to clear impersonation
CREATE OR REPLACE FUNCTION public.clear_impersonation()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.role_impersonations WHERE user_id = auth.uid();
END;
$$;

-- Audit log for impersonation changes (use existing audit_logs)
COMMENT ON TABLE public.role_impersonations IS 'Admin view-as-role backdoor: user_id is admin, target_role is impersonated role with real RLS. Expires in 1h.';
