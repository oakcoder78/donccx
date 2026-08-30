-- Dashboard v3 (Phase 3 closeout — kill-switch variant)
-- The v3 becomes the default /dashboard for ALL six roles. The `dashboard_v3`
-- flag is kept (not dropped) as a DB kill-switch: while enabled=true the
-- DashboardRoute wrapper serves MeuDiaV3Page; set enabled=false to revert every
-- role to the monolith without a deploy. Full removal (drop flag + delete the
-- wrapper) is a follow-up once the v3 is proven stable in prod.
-- See docs/sdd/labs-dashboard-sdd.md §1.3 / §6 Phase 3.

UPDATE public.feature_flags
SET allowed_roles = ARRAY['admin', 'manager', 'csm', 'sales', 'finance', 'analyst'],
    enabled = true,
    updated_at = now()
WHERE key = 'dashboard_v3';
