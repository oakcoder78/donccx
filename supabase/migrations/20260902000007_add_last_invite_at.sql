-- Add last_invite_at to track resend resets (fixes "Expirado há 4h" not updating after Reenviar)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_invite_at timestamptz;
UPDATE public.profiles SET last_invite_at = COALESCE(last_invite_at, created_at) WHERE last_invite_at IS NULL;
COMMENT ON COLUMN public.profiles.last_invite_at IS 'Último envio de convite (invite-user/resend-invite); usado para badge Expirado/Reenviado em SettingsUsers';
