-- Dashboard v3 workstream — Phase 1 (route scaffold + transitional flag)
-- See docs/sdd/labs-dashboard-sdd.md §1.3 / §6 Phase 1.
--
-- The v3 dashboard will replace the monolith at /dashboard for all roles. During
-- Phases 1-3 the swap is gated by a TRANSITIONAL flag so /dashboard keeps serving
-- the working monolith to everyone; an admin flips dashboard_v3 on to preview the
-- v3 while it is built. The Phase 3 closeout drops this flag and makes /dashboard
-- render v3 unconditionally.
--
-- labs_dashboard (which gated the old /labs/dashboard shell) is retired now:
-- /labs/dashboard becomes an admin-only route (AdminOnlyRoute) rendering the
-- monolith as a parity reference.

DELETE FROM public.feature_flags WHERE key = 'labs_dashboard';

INSERT INTO public.feature_flags (key, description, enabled, allowed_roles)
VALUES ('dashboard_v3', 'Dashboard v3 — preview em /dashboard (transitório)', false, ARRAY['admin'])
ON CONFLICT (key) DO NOTHING;
