import { useParams, useNavigate } from 'react-router-dom'
import { useClient } from '@/hooks/useClient'
import { ClientFormContent } from '@/components/clients/ClientFormContent'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/lib/icons'

// /labs/empresas_v2 — isolated labs playground for Empresas v2 form
// Gated by <AdminOnlyRoute> in src/App.jsx (admin-only, no feature flag).
// Reuses ClientFormContent with new tab order: Dados → Endereço → Contrato → Operacional.
// Same DB, additive-only Phase 1 (no DROP). See docs/sdd/empresas-form-v2-sdd.md.

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
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 mb-4 flex items-start gap-2">
        <Icons.FlaskConical size={16} className="flex-shrink-0 mt-0.5 hidden" />
        <div>
          <span className="font-semibold">Labs — Empresas v2</span> · Playground isolado (admin-only). Nova ordem de abas: <span className="font-mono">Dados → Endereço → Contrato → Operacional</span>. Motor de contrato e handover em preview (Phase 1 additive, produção intacta).
          <span className="ml-2">Produção em <a href="/empresas" className="underline font-medium">/empresas</a> permanece no modal legado.</span>
        </div>
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

      <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
        <ClientFormContent
          client={isEdit ? client : null}
          onSuccess={(clientId) => {
            // After create/edit, go to detail (or labs list if we had one)
            navigate(clientId ? `/empresas/${clientId}` : '/empresas')
          }}
          onCancel={() => navigate(isEdit ? `/empresas/${id}` : '/empresas')}
        />
      </div>

      <p className="text-[11px] text-text-tertiary mt-3">
        DDL pendente: <code>billing_status/erp/ti_tipo</code> + <code>client_handovers</code> + <code>contract_charges/billing_os_tiers</code> (migrations additive Phase 1–3). Sem migration, campos labs salvam em modo compatibilidade.
      </p>
    </div>
  )
}
