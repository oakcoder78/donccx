import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClients, useAllClients } from '@/hooks/useClients'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { supabase } from '@/lib/supabaseClient'
import { PageHeader } from '../ui/PageHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { StagePill } from '../ui/StagePill'
import { HealthBar, HealthScore } from '../ui/HealthBar'
import { Avatar } from '../ui/Avatar'
import { Icons } from '@/lib/icons'
import { PageSpinner } from '../ui/Spinner'
import { ClientForm } from './ClientForm'

const CHIPS = [
  { key: 'todos',     label: 'Todos'           },
  { key: 'onboarding', label: 'Onboarding'     },
  { key: 'producao',  label: 'Em Produção'      },
  { key: 'risco',     label: 'Em Risco'         },
  { key: 'saudavel',  label: 'Saudáveis'        },
  { key: 'atencao',   label: 'Atenção'          },
  { key: 'atraso',    label: 'Fatura em Atraso' },
  { key: 'renovacao', label: 'Renovação 30d'    },
]

function applyFilter(clients, filter) {
  if (!filter || filter === 'todos') return clients
  const today = new Date()
  const in30  = new Date(); in30.setDate(today.getDate() + 30)
  return clients.filter(c => {
    if (filter === 'onboarding') return c.stage?.name === 'Onboarding'
    if (filter === 'producao')   return c.stage?.name === 'Produção'
    if (filter === 'risco')      return (c.health_total || 0) < 50
    if (filter === 'saudavel')   return (c.health_total || 0) >= 75
    if (filter === 'atencao')    return (c.health_total || 0) >= 50 && (c.health_total || 0) < 75
    if (filter === 'atraso')     return c.delay_days > 0
    if (filter === 'renovacao') {
      if (!c.contract_renewal) return false
      const d = new Date(c.contract_renewal)
      return d >= today && d <= in30
    }
    return true
  })
}

function abcVariant(abc) {
  if (abc === 'A') return 'green'
  if (abc === 'B') return 'sky'
  return 'slate'
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const isAdminOrManager = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'finance'
  const canMutateEmpresas = ['admin', 'manager', 'finance', 'sales'].includes(effectiveRole)
  const canSeeFinancial = ['admin', 'manager', 'finance'].includes(effectiveRole)

  const [search,          setSearch]          = useState('')
  const [filter,          setFilter]          = useState(searchParams.get('filter') || 'todos')
  const [showInactive,   setShowInactive]    = useState(false)
  const [lifecycleFilter, setLifecycleFilter] = useState('cliente')
  const [showForm,     setShowForm]     = useState(false)
  const estadoParam = (searchParams.get('estado') || '').trim().toUpperCase() || null

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f) setFilter(f)
  }, [searchParams])

  // Global read (Opção A): todos veem todos os cards — sem filtro por carteira
  const baseFilters = {
    ...(search ? { search } : {}),
    ...(estadoParam ? { address_state: estadoParam } : {}),
  }

  // Call both hooks; enable only the relevant one (avoids conditional hook calls)
  const { data: activeClients = [], isLoading: loadingActive } =
    useClients(baseFilters, { enabled: !!profile && !showInactive, includeFinancial: canSeeFinancial })
  const { data: allClients = [],    isLoading: loadingAll    } =
    useAllClients(baseFilters, { enabled: !!profile && showInactive, includeFinancial: canSeeFinancial })

  const clients   = showInactive ? allClients   : activeClients
  const isLoading = showInactive ? loadingAll   : loadingActive

  let filtered = applyFilter(clients, filter)

  if (lifecycleFilter !== 'all') {
    filtered = filtered.filter(c => (c.lifecycle_stage || 'cliente') === lifecycleFilter)
  }
  // Head-count query for badge — works even when toggle is OFF (allClients not loaded yet)
  const { data: inactiveCountHead } = useQuery({
    queryKey: ['clients_inactive_count', baseFilters, lifecycleFilter],
    enabled: !!profile && isAdminOrManager,
    queryFn: async () => {
      let q = supabase.from('clients').select('id', { count: 'exact', head: true })
      if (baseFilters.csm_id) q = q.eq('csm_id', baseFilters.csm_id)
      if (baseFilters.comercial_id) q = q.eq('comercial_id', baseFilters.comercial_id)
      if (baseFilters.search) q = q.or(`name.ilike.%${baseFilters.search}%,fantasy_name.ilike.%${baseFilters.search}%`)
      if (baseFilters.address_state) q = q.eq('address_state', baseFilters.address_state)
      if (lifecycleFilter !== 'all') q = q.eq('lifecycle_stage', lifecycleFilter)
      q = q.eq('contract_active', false)
      const { count } = await q
      return count ?? 0
    },
    staleTime: 30_000,
  })
  const inactiveCount = showInactive
    ? allClients.filter(c => c.contract_active === false).length
    : (inactiveCountHead ?? 0)

  const useV2 = isEnabled('empresas_form_v2', effectiveRole)

  return (
    <div className="p-6">
      <PageHeader
        title="Empresas"
        subtitle={`${clients.length} empresa${clients.length !== 1 ? 's' : ''}`}
        action={canMutateEmpresas ? <Button onClick={() => useV2 ? navigate('/empresas/nova') : setShowForm(true)}>+ Nova Empresa</Button> : null}
      />
      {estadoParam && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#173557', background: '#e8f6fd', border: '0.5px solid rgba(15,34,58,0.09)', borderRadius: 999, padding: '4px 10px' }}>
            Filtrado por UF: {estadoParam}
            <button type="button" onClick={() => navigate('/empresas')} style={{ background: 'none', border: 0, cursor: 'pointer', color: '#173557', fontWeight: 700, padding: '0 2px', fontSize: '0.875rem', lineHeight: 1 }} aria-label="Remover filtro">×</button>
          </span>
        </div>
      )}

      {/* Search + inactive toggle */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="w-full pl-9 pr-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <select
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value)}
          className="h-10 px-3 rounded-lg border border-border-tertiary bg-white text-sm"
        >
          <option value="cliente">Clientes</option>
          <option value="lead">Leads</option>
          <option value="prospect">Prospects</option>
          <option value="parceiro">Parceiros</option>
          <option value="teste">Teste</option>
          <option value="all">Todos</option>
        </select>
        {isAdminOrManager && (
          <button
            type="button"
            role="switch"
            aria-checked={showInactive}
            onClick={() => setShowInactive(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
              showInactive
                ? 'bg-donc-navy/10 border-donc-navy/30 text-donc-navy'
                : 'bg-bg-primary border-border-secondary text-text-secondary hover:border-border-tertiary'
            }`}
          >
            <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${showInactive ? 'bg-donc-navy' : 'bg-border-secondary'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showInactive ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
            </span>
            Mostrar inativas
            {inactiveCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${showInactive ? 'bg-donc-navy/15 text-donc-navy' : 'bg-bg-secondary text-text-tertiary border border-border-secondary'}`}>{inactiveCount}</span>
            )}
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filter === chip.key
                ? 'bg-donc-navy text-white border-donc-navy'
                : 'bg-bg-primary text-text-secondary border-border-secondary hover:border-donc-navy/40'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(c => (
            <CompanyCard key={c.id} client={c} canSeeFinancial={canSeeFinancial} onClick={() => navigate(`/empresas/${c.id}?tab=overview`)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-text-tertiary">Nenhuma empresa encontrada.</div>
          )}
        </div>
      )}

      {showForm && <ClientForm onClose={() => setShowForm(false)} />}
    </div>
  )
}

function CompanyCard({ client: c, onClick, canSeeFinancial }) {
  const isInactive   = c.contract_active === false
  const isCliente    = c.lifecycle_stage === 'cliente'
  const displayName  = c.fantasy_name || c.name
  const subtitle     = c.fantasy_name ? c.name : null
  const penetrationPct = c.unidades_total > 0
    ? Math.round((c.unidades_donc / c.unidades_total) * 100)
    : null

  const dims = [
    { label: 'Uso',   val: c.health_uso            },
    { label: 'Sup.',  val: c.health_suporte         },
    { label: 'Rel.',  val: c.health_relacionamento  },
    { label: 'Fin.',  val: c.health_financeiro      },
    { label: 'Proj.', val: c.health_projeto         },
  ]

  return (
    <div
      onClick={onClick}
      className={`bg-bg-primary border border-border-tertiary rounded-lg p-4 cursor-pointer hover:border-border-secondary hover:shadow-sm transition-all ${isInactive ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-donc-navy flex items-center justify-center">
            {c.logo_url
              ? <img src={c.logo_url} alt={displayName} className="w-full h-full object-cover" />
              : <span className="text-white font-bold text-sm">{(displayName || '?')[0].toUpperCase()}</span>
            }
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary truncate leading-tight">{displayName}</h3>
            {subtitle && <p className="text-[11px] text-text-tertiary truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {c.stage && <StagePill name={c.stage.name} color={c.stage.color} />}
          {isInactive && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 border border-gray-300">
              Inativo
            </span>
          )}
        </div>
      </div>

      {isCliente && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {c.abc_class && <Badge variant={abcVariant(c.abc_class)}>ABC {c.abc_class}</Badge>}
          <HealthScore score={c.health_total || 0} />
          {canSeeFinancial && c.mrr > 0 && (
            <span className="text-xs text-text-tertiary">
              {c.mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </span>
          )}
          {penetrationPct !== null && (
            <span className="text-xs text-text-tertiary">
              {c.unidades_donc}/{c.unidades_total} un. ({penetrationPct}%)
            </span>
          )}
        </div>
      )}

      {isCliente && (
        <div className="grid grid-cols-5 gap-1 mb-3">
          {dims.map(d => (
            <div key={d.label}>
              <div className="text-[10px] text-text-tertiary mb-0.5 text-center">{d.label}</div>
              <HealthBar value={d.val || 0} max={20} />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {c.csm && (
          <div className="flex items-center gap-1">
            <Avatar name={c.csm.name} size="sm" />
            <span className="text-xs text-text-tertiary truncate max-w-[100px]">{c.csm.name}</span>
          </div>
        )}
        {c.comercial && (
          <div className="flex items-center gap-1">
            <Avatar name={c.comercial.name} size="sm" />
            <span className="text-xs text-text-tertiary truncate max-w-[100px]">Com. {c.comercial.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}
