-- Add Google Meet link storage for activities synced to Google Calendar.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS meet_link text;
ALTER TABLE public.onboarding_activities ADD COLUMN IF NOT EXISTS meet_link text;