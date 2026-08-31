-- Fix: primeiro-acesso 403 + prevent role escalation
-- 1) profiles had no INSERT policy for authenticated -> upsert from PrimeiroAcesso failed
-- 2) profiles_update_own allowed any role change -> user could self-promote to admin via console
-- 3) invite-user already uses service_role, but this guards direct REST calls too

-- -- INSERT own: allow authenticated to insert own row, but only non-privileged roles
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (
      public.get_user_role() IN ('admin', 'manager')
      OR role IN ('csm', 'analyst', 'sales', 'finance')
      OR role IS NULL
    )
  );

-- -- UPDATE own: allow updating own row, but block escalation to admin/manager
-- -- Uses: keep same role -> always ok; change to non-privileged -> ok; admin/manager caller -> ok (for self)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      -- no role change (covers gender/phone/avatar/status updates where role stays same)
      role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      -- change to non-privileged role is allowed (e.g. admin downgrading self, though rare)
      OR role IN ('csm', 'analyst', 'sales', 'finance')
      -- admin/manager can set any role on own row (uses pre-update role, so admin keeps privilege)
      OR public.get_user_role() IN ('admin', 'manager')
    )
  );

COMMENT ON POLICY "profiles_insert_own" ON public.profiles IS 'Self-insert for primeiro-acesso; blocks self-promotion to admin/manager (admin/manager via profiles_admin_all).';
COMMENT ON POLICY "profiles_update_own" ON public.profiles IS 'Self-update; blocks escalation to admin/manager unless caller already admin/manager.';
