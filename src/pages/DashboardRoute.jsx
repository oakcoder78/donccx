import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import DashboardPage from '@/pages/Dashboard'
import MeuDiaV3Page from '@/pages/MeuDiaV3Page'

// Kill-switch wrapper for /dashboard (Dashboard v3 workstream).
// Since the Phase 3 closeout (2026-08-30) `dashboard_v3` is enabled for all six
// roles, so this renders MeuDiaV3Page for everyone. It stays as a DB kill-switch:
// set feature_flags.dashboard_v3.enabled = false to revert every role to the
// monolith with no deploy. Full removal (delete this file, point the route
// straight at MeuDiaV3Page, drop the flag) is a follow-up once v3 is proven.
// See docs/sdd/labs-dashboard-sdd.md §1.3.
export default function DashboardRoute() {
  const { effectiveRole } = useAuth()
  const { isEnabled, loading } = useFeatureFlags()

  if (loading) return null

  return isEnabled('dashboard_v3', effectiveRole) ? <MeuDiaV3Page /> : <DashboardPage />
}
