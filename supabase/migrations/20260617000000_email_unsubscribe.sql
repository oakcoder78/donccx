-- email_unsubscribe infrastructure

-- 1. Add unsubscribed column to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;

-- 2. email_view_cache — store merged HTML for "view in browser"
CREATE TABLE IF NOT EXISTS public.email_view_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_log_id uuid REFERENCES public.email_logs(id) ON DELETE CASCADE,
  html_body  text NOT NULL,
  token      text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. email_unsubscribes — track unsubscribe tokens
CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      integer REFERENCES public.contacts(id) ON DELETE CASCADE,
  email           text NOT NULL,
  token           text UNIQUE NOT NULL,
  unsubscribed_at timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_view_cache_token ON public.email_view_cache(token);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_token ON public.email_unsubscribes(token);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_contact ON public.email_unsubscribes(contact_id);

-- RLS
ALTER TABLE public.email_view_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribes  ENABLE ROW LEVEL SECURITY;

-- email_view_cache: anon can read by token (public page)
CREATE POLICY "anon_select_view_cache" ON public.email_view_cache
  FOR SELECT TO anon USING (true);

-- email_view_cache: authenticated can insert (edge function with service key)
CREATE POLICY "auth_insert_view_cache" ON public.email_view_cache
  FOR INSERT TO authenticated WITH CHECK (true);

-- email_unsubscribes: anon can read by token + update (set unsubscribed_at)
CREATE POLICY "anon_select_unsubscribes" ON public.email_unsubscribes
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_unsubscribes" ON public.email_unsubscribes
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- email_unsubscribes: authenticated can insert (edge function)
CREATE POLICY "auth_insert_unsubscribes" ON public.email_unsubscribes
  FOR INSERT TO authenticated WITH CHECK (true);
