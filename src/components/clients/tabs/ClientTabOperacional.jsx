import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClientSubDados } from './operacional/ClientSubDados'
import { ClientSubOnboarding } from './operacional/ClientSubOnboarding'
import { ClientSubUso } from './operacional/ClientSubUso'
import { ClientSubProjetos } from './operacional/ClientSubProjetos'
import { ClientSubSuporte } from './operacional/ClientSubSuporte'

const SUBS = [
  { key: 'dados', label: 'Dados' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'uso', label: 'Uso' },
  { key: 'projetos', label: 'Projetos' },
  { key: 'suporte', label: 'Suporte' },
]

export function ClientTabOperacional({ client }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sub = searchParams.get('sub') || 'dados'

  function setSub(s) {
    setSearchParams(prev => { prev.set('tab','operacional'); prev.set('sub', s); return prev })
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 bg-bg-tertiary p-1 rounded-md w-fit">
        {SUBS.map(s => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              sub === s.key ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'dados' && <ClientSubDados client={client} />}
      {sub === 'onboarding' && <ClientSubOnboarding client={client} />}
      {sub === 'uso' && <ClientSubUso client={client} />}
      {sub === 'projetos' && <ClientSubProjetos client={client} />}
      {sub === 'suporte' && <ClientSubSuporte client={client} />}
    </div>
  )
}
