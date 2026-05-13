-- fix email module: from_mode column on email_logs
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS from_mode text DEFAULT 'csm';
