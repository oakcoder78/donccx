import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { PageHeader } from '@/components/ui/PageHeader'

export default function LabsDashboardPage() {
  const { effectiveRole, profile } = useAuth()
  const { isEnabled, loading: flagsLoading } = useFeatureFlags()
  const navigate = useNavigate()

  useEffect(() => {
    if (!flagsLoading && profile && !isEnabled('labs_dashboard', effectiveRole)) {
      navigate('/dashboard', { replace: true })
    }
  }, [flagsLoading, profile, effectiveRole, isEnabled, navigate])

  if (flagsLoading) return null

  if (!isEnabled('labs_dashboard', effectiveRole)) {
    return null
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Labs · Dashboard"
        subtitle="Em construção — branch-by-abstraction. Legada /dashboard permanece até aprovação."
      />
      <div className="mt-6 bg-bg-primary border border-border-tertiary rounded-lg p-8 text-center">
        <p className="text-text-secondary text-sm">
          Shell Phase 0 — rota <span className="font-mono">/labs/dashboard</span> visível apenas para <strong>admin</strong> no início.
        </p>
        <p className="text-text-tertiary text-xs mt-2">
          Próximos passos: Meu Dia genérico + CockpitGrid por role ( effectiveRole: {effectiveRole} ).
        </p>
      </div>
    </div>
  )
}
