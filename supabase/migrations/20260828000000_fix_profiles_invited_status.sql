-- Fix profiles_status_check to include 'invited' (used by InviteUserModal / ApproveModal / App.jsx)
-- Original remote_schema only allowed ('active','pending','blocked'), but app uses 'invited' for users who received invite and need primeiro-acesso.
-- This migration is idempotent and keeps existing + new sales/finance roles from 20260824000001.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'blocked'::text, 'invited'::text]));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'csm'::text, 'analyst'::text, 'sales'::text, 'finance'::text]));
