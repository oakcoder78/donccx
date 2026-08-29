import DashboardPage from '@/pages/Dashboard'

// /labs/dashboard — the legacy monolithic dashboard, kept as an admin-only parity
// reference and kill-switch while Dashboard v3 is built at /dashboard.
// Route access is gated by <AdminOnlyRoute> in src/App.jsx (no feature flag).
// See docs/sdd/labs-dashboard-sdd.md §1.3 / §6 Phase 1.
export default function LabsDashboardPage() {
  return (
    <>
      <div className="max-w-[1120px] mx-auto px-6 pt-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
          Modo legado — dashboard atual preservada aqui enquanto a v3 é construída em <span className="font-mono">/dashboard</span>.
        </div>
      </div>
      <DashboardPage />
    </>
  )
}
