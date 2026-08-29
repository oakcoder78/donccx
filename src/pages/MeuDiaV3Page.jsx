import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icons } from '@/lib/icons'

// Dashboard v3 — "Meu Dia". Shell only (Phase 1).
// Reached at /dashboard when the transitional `dashboard_v3` flag is on (admin preview);
// blocks are built in Phase 3. See docs/sdd/labs-dashboard-sdd.md §3 / §6 Phase 3.
// Section order is personal-first (§3).
const BLOCKS = [
  { key: 'hero', label: 'HERO — saudação + 3 cards por papel', scope: 'usuário', icon: 'Sparkles' },
  { key: 'agenda', label: 'Minha agenda — próximas 48h por urgência', scope: 'usuário', icon: 'Calendar' },
  { key: 'saude', label: 'Saúde por dimensão', scope: 'minha carteira', icon: 'Activity' },
  { key: 'projetos', label: 'Projetos em aberto', scope: 'minha carteira', icon: 'FolderKanban' },
  { key: 'forca', label: 'Nossa força em Números (YTD)', scope: 'toda a base', icon: 'TrendingUp' },
  { key: 'mapa', label: 'Mapa vivo do ecossistema', scope: 'toda a base', icon: 'Globe' },
  { key: 'operacional', label: 'Operacional — variação mensal', scope: 'toda a base', icon: 'BarChart3' },
]

export default function MeuDiaV3Page() {
  const { effectiveRole } = useAuth()

  return (
    <div className="p-6 max-w-[1120px] mx-auto">
      <PageHeader
        title="Meu Dia"
        subtitle={`Dashboard v3 · preview (flag dashboard_v3) · perfil: ${effectiveRole || '—'}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {BLOCKS.map((b) => {
          const Icon = Icons[b.icon] || Icons.Package
          return (
            <div
              key={b.key}
              className="bg-bg-primary border border-border-tertiary rounded-2xl p-5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-text-secondary">
                <Icon size={16} />
                <span className="text-sm font-semibold text-text-primary">{b.label}</span>
              </div>
              <span className="text-[11px] uppercase tracking-wide font-bold text-text-tertiary">
                {b.scope}
              </span>
              <div className="mt-2 h-16 rounded-lg bg-bg-secondary animate-pulse" />
              <span className="text-xs text-text-tertiary">Em construção — Fase 3</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
