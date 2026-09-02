import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useClient } from '@/hooks/useClient'
import { useAllClients } from '@/hooks/useClients'
import { ClientFormContent } from '@/components/clients/ClientFormContent'
import { Button } from '@/components/ui/Button'
import { StagePill } from '@/components/ui/StagePill'
import { Icons } from '@/lib/icons'

// /labs/empresas_v2 — isolated labs playground for Empresas v2 form
// Gated by <AdminOnlyRoute> in src/App.jsx (admin-only, no feature flag).
// Reuses ClientFormContent with new tab order: Dados → Endereço → Contrato → Operacional.
// Same DB. See docs/sdd/empresas-form-v2-sdd.md.

function EditPicker({ navigate }) {
  const [search, setSearch] = useState('')
  const term = search.trim()
  const { data: results = [], isFetching } = useAllClients(
    { search: term },
    { enabled: term.length >= 2 },
  )

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-xl p-4 mb-4">
      <p className="text-sm font-semibold text-text-primary mb-2">Editar empresa existente</p>
      <div className="relative max-w-md">
        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou fantasia…"
          className="w-full pl-9 pr-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary text-text-primary placeholder:text-text-tertiary"
        />
      </div>

      {term.length >= 2 && (
        <div className="mt-2 border border-border-tertiary rounded-lg divide-y divide-border-tertiary overflow-hidden">
          {isFetching && results.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-text-tertiary">Buscando…</p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-text-tertiary">Nenhuma empresa encontrada.</p>
          )}
          {results.slice(0, 8).map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/labs/empresas_v2/${c.id}/editar`)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-secondary transition-colors"
            >
              <span className="text-sm text-text-primary truncate">
                {c.fantasy_name || c.name}
              </span>
              {c.fantasy_name && c.name !== c.fantasy_name && (
                <span className="text-xs text-text-tertiary truncate">· {c.name}</span>
              )}
              {c.stage?.name && (
                <StagePill name={c.stage.name} color={c.stage.color} className="ml-auto flex-shrink-0" />
              )}
            </button>
          ))}
          {results.length > 8 && (
            <p className="px-3 py-2 text-[11px] text-text-tertiary">
              Refine a busca — {results.length} resultados.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmpresasV2Page() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { data: client, isPending } = useClient(id)

  if (isEdit && isPending) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse h-6 bg-bg-secondary rounded w-48 mb-4" />
        <div className="animate-pulse h-32 bg-bg-secondary rounded" />
      </div>
    )
  }

  if (isEdit && !client) {
    return (
      <div className="p-6 max-w-6xl mx-auto text-center py-12">
        <p className="text-text-tertiary">Empresa não encontrada.</p>
        <Button variant="secondary" onClick={() => navigate('/labs/empresas_v2')} className="mt-4">Voltar</Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Labs banner */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 mb-4">
        <span className="font-semibold">Labs — Empresas v2</span> · Playground admin-only. Ordem das abas:{' '}
        <span className="font-mono">Dados → Endereço → Contrato → Operacional</span>. A produção em{' '}
        <a href="/empresas" className="underline font-medium">/empresas</a> continua no formulário legado.
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Button variant="secondary" onClick={() => navigate(isEdit ? `/empresas/${id}` : '/empresas')} className="gap-1.5">
          <Icons.ArrowLeft size={14} /> Voltar
        </Button>
        <h1 className="text-xl font-bold text-text-primary">
          {isEdit ? `Editar — ${client?.fantasy_name || client?.name || 'Empresa'}` : 'Nova Empresa (Labs v2)'}
        </h1>
        <span className="ml-auto text-[11px] px-2 py-1 rounded bg-donc-navy text-white font-medium">LABS</span>
      </div>

      {!isEdit && <EditPicker navigate={navigate} />}

      <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
        <ClientFormContent
          key={isEdit ? `edit-${client.id}` : 'new'}
          client={isEdit ? client : null}
          onSuccess={(clientId) => {
            navigate(clientId ? `/empresas/${clientId}` : '/empresas')
          }}
          onCancel={() => navigate(isEdit ? `/empresas/${id}` : '/empresas')}
        />
      </div>
    </div>
  )
}
