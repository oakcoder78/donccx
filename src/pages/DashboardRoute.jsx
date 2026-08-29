import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import DashboardPage from '@/pages/Dashboard'
import MeuDiaV3Page from '@/pages/MeuDiaV3Page'

// Transitional wrapper for /dashboard (Dashboard v3 workstream, Phase 1).
// Serves the working monolith by default; renders v3 only when the transitional
// `dashboard_v3` flag is enabled for the effective role (admin preview).
// The Phase 3 closeout deletes this file and points /dashboard straight at MeuDiaV3Page.
// See docs/sdd/labs-dashboard-sdd.md §1.3.
export default function DashboardRoute() {
  const { effectiveRole } = useAuth()
  const { isEnabled, loading } = useFeatureFlags()

  if (loading) return null

  return isEnabled('dashboard_v3', effectiveRole) ? <MeuDiaV3Page /> : <DashboardPage />
}
