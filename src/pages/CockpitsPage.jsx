import { useNavigate } from 'react-router-dom'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useAuth } from '@/contexts/AuthContext'
import { Icons } from '@/lib/icons'
import { PageHeader } from '@/components/ui/PageHeader'

const cockpits = [
  {
    key: 'health',
    title: 'Health Score',
    description: 'Scorecard de saúde da carteira, tendências e alertas por dimensão',
    icon: Icons.Activity,
    href: '/health',
    color: 'text-donc-verde',
    bgColor: 'bg-donc-verde/10',
  },
  {
    key: 'cs_radar',
    title: 'CS Radar',
    description: 'Atividades, RMCs e avanço de projetos do time de CS',
    icon: Icons.BarChart3,
    href: '/cs-radar',
    color: 'text-donc-sky',
    bgColor: 'bg-donc-sky/10',
  },
]

export default function CockpitsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { isEnabled } = useFeatureFlags()

  const visible = cockpits.filter(c => isEnabled(c.key, profile?.role))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Cockpits" description="Painéis operacionais e analíticos" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
        {visible.map(c => (
          <button
            key={c.key}
            onClick={() => navigate(c.href)}
            className="bg-bg-primary border border-border-tertiary rounded-xl p-6 text-left hover:border-border-secondary transition-colors group"
          >
            <div className={`w-12 h-12 rounded-lg ${c.bgColor} flex items-center justify-center mb-4`}>
              <c.icon className={`w-6 h-6 ${c.color}`} />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">{c.title}</h3>
            <p className="text-sm text-text-tertiary">{c.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
