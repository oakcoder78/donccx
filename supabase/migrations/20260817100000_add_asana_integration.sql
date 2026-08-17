-- Add Asana integration support
-- 1) whatsapp_tickets: link to the Asana task created for a ticket
ALTER TABLE public.whatsapp_tickets
  ADD COLUMN IF NOT EXISTS asana_task_gid text,
  ADD COLUMN IF NOT EXISTS asana_task_url  text;

-- 2) feature flag to show the Asana settings panel + the "Register in Asana" option
INSERT INTO public.feature_flags (key, description, enabled, allowed_roles, updated_at)
VALUES (
  'asana',
  'Integração Asana — registrar tickets de atendimento como tarefas no Asana',
  true,
  ARRAY['admin', 'manager'],
  now()
)
ON CONFLICT (key) DO NOTHING;