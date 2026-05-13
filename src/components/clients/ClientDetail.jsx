import { useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useClient } from '../../hooks/useClient'
import { PageSpinner } from '../ui/Spinner'
import { StagePill } from '../ui/StagePill'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { HealthScore } from '../ui/HealthBar'
import { ClientForm } from './ClientForm'
import { ClientTabOverview } from './tabs/ClientTabOverview'
import { ClientTabActivities } from './tabs/ClientTabActivities'
import { ClientTabOperacional } from './tabs/ClientTabOperacional'
import { ClientTabHealth } from './tabs/ClientTabHealth'
import { ClientTabContatos } from './tabs/ClientTabContatos'
import { ClientSubAnexos } from './tabs/operacional/ClientSubAnexos'
import { EmailComposerModal } from '../email/EmailComposerModal'
import { Icons } from '../../lib/icons'

const TABS = [
  { key: 'overview', label: 'Visão Geral' },
  { key: 'atividades', label: 'Atividades' },
  { key: 'operacional', label: 'Operacional' },
  { key: 'health', label: 'Health Score' },
  { key: 'contatos', label: 'Contatos' },
  { key: 'anexos', label: 'Anexos' },
]

export default function ClientDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = searchParams.get('tab') || 'overview'
  const [showEdit, setShowEdit]   = useState(false)
  const [showEmail, setShowEmail] = useState(false)

  const { data: client, isLoading } = useClient(id)

  const isCliente = client?.lifecycle_stage === 'cliente'

  function setTab(t) {
    setSearchParams({ tab: t })
  }

  if (isLoading) return <PageSpinner />
  if (!client) return <div className="p-6 text-text-tertiary">Empresa não encontrada.</div>

  const displayName = client.fantasy_name || client.name

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <button onClick={() => navigate('/empresas')} className="text-xs text-text-tertiary hover:text-text-secondary mb-1 flex items-center gap-1">
            ← Empresas
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            {client.logo_url && (
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={client.logo_url} alt={displayName} className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className="text-xl font-bold text-text-primary">{displayName}</h1>
            {client.fantasy_name && <span className="text-sm text-text-tertiary">{client.name}</span>}
            {client.stage && <StagePill name={client.stage.name} color={client.stage.color} />}
            {client.abc_class && <Badge variant={client.abc_class === 'A' ? 'green' : client.abc_class === 'B' ? 'sky' : 'slate'}>ABC {client.abc_class}</Badge>}
            {isCliente && <HealthScore score={client.health_total || 0} />}
            {client.contract_active === false && (
              <span className="text-xs px-2 py-0.5 rounded bg-text-tertiary/20 text-text-tertiary">Contrato inativo</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowEmail(true)}>
            <Icons.Mail className="w-3.5 h-3.5" />
            Enviar e-mail
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>Editar</Button>
        </div>
      </div>

      <EmailComposerModal
        isOpen={showEmail}
        onClose={() => setShowEmail(false)}
        mode="individual"
        preselectedClientId={client?.id}
      />

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-tertiary mt-4 mb-5 overflow-x-auto">
        {TABS.map(t => {
          const isDisabledTab = (t.key === 'operacional' || t.key === 'health') && !isCliente
          return (
            <button
              key={t.key}
              onClick={() => {
                if (!isDisabledTab) setTab(t.key)
              }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'text-donc-navy border-donc-navy'
                  : isDisabledTab
                    ? 'text-text-tertiary/40 cursor-not-allowed'
                    : 'text-text-tertiary border-transparent hover:text-text-primary'
              }`}
              disabled={isDisabledTab}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <ClientTabOverview client={client} />}
      {tab === 'atividades' && <ClientTabActivities client={client} />}
      {tab === 'operacional' && isCliente && <ClientTabOperacional client={client} />}
      {tab === 'health' && isCliente && <ClientTabHealth client={client} />}
      {tab === 'contatos' && <ClientTabContatos client={client} />}
      {tab === 'anexos' && <ClientSubAnexos client={client} />}

      {showEdit && <ClientForm client={client} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
