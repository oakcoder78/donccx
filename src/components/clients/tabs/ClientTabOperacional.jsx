import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClientSubDados } from './operacional/ClientSubDados'
import { ClientSubUso } from './operacional/ClientSubUso'
import { ClientSubProjetos } from './operacional/ClientSubProjetos'
import { ClientSubSuporte } from './operacional/ClientSubSuporte'
import { ClientSubRelatorios } from './operacional/ClientSubRelatorios'
import { ClientSubAnexos } from './operacional/ClientSubAnexos'
import { RegistrarDadosModal } from './operacional/RegistrarDadosModal'
import { Button } from '../../ui/Button'

const SUBS = [
  { key: 'dados',      label: 'Dados'      },
  { key: 'uso',        label: 'Uso'        },
  { key: 'projetos',   label: 'Projetos'   },
  { key: 'suporte',    label: 'Suporte'    },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'anexos',     label: 'Anexos'     },
]

export function ClientTabOperacional({ client }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sub = searchParams.get('sub') || 'dados'

  // null = closed; string = open with that month pre-filled
  const [modalMonth, setModalMonth] = useState(null)

  function setSub(s) {
    setSearchParams(prev => { prev.set('tab', 'operacional'); prev.set('sub', s); return prev })
  }

  const showRegBtn = sub === 'uso' || sub === 'suporte'

  return (
    <div>
      {/* Header: sub-tabs + action button */}
      <div className="flex items-center justify-between mb-5 gap-4">
        <div className="flex gap-1 bg-bg-tertiary p-1 rounded-md w-fit flex-wrap">
          {SUBS.map(s => (
            <button
              key={s.key}
              onClick={() => setSub(s.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                sub === s.key
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {showRegBtn && (
          <Button size="sm" onClick={() => setModalMonth('')}>
            + Registrar Dados
          </Button>
        )}
      </div>

      {sub === 'dados'    && <ClientSubDados client={client} />}
      {sub === 'uso'      && <ClientSubUso   client={client} onEdit={setModalMonth} />}
      {sub === 'projetos'   && <ClientSubProjetos   client={client} />}
      {sub === 'suporte'    && <ClientSubSuporte    client={client} onEdit={setModalMonth} />}
      {sub === 'relatorios' && <ClientSubRelatorios client={client} />}
      {sub === 'anexos'     && <ClientSubAnexos     client={client} />}

      {modalMonth !== null && (
        <RegistrarDadosModal
          client={client}
          initialMonth={modalMonth || undefined}
          onClose={() => setModalMonth(null)}
        />
      )}
    </div>
  )
}
