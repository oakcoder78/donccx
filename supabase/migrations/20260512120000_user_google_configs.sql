-- ─── user_google_configs + google_event_id on activities/onboarding_activities ────

-- 1. OAuth tokens/refresh per user
CREATE TABLE IF NOT EXISTS public.user_google_configs (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token  text,
  refresh_token text,
  tokenexpiry   timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT user_google_configs_user_id_unique UNIQUE (user_id)
);

ALTER TABLE public.user_google_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own google config"
  ON public.user_google_configs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. google_event_id on activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS google_event_id text;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin/mgr analyst full activities" ON public.activities;
CREATE POLICY "admin/mgr analyst full activities"
  ON public.activities FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'analyst'))
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'analyst'))
  );

-- 3. google_event_id on onboarding_activities
ALTER TABLE public.onboarding_activities
  ADD COLUMN IF NOT EXISTS google_event_id text;

ALTER TABLE public.onboarding_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin/mgr analyst full onboarding_activities" ON public.onboarding_activities;
CREATE POLICY "admin/mgr analyst full onboarding_activities"
  ON public.onboarding_activities FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'analyst'))
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'analyst'))
  );
