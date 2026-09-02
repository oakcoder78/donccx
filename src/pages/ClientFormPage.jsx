import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useClient } from '@/hooks/useClient'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { ClientFormContent } from '@/components/clients/ClientFormContent'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/lib/icons'

// /empresas/nova and /empresas/:id/editar — produção quando flag empresas_form_v2 habilitar
// Reuso total de ClientFormContent (mesmo que labs). Gate por feature flag.
// Labs /labs/empresas_v2 permanece admin-only sem flag (ver App.jsx AdminOnlyRoute).

export default function ClientFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { effectiveRole } = useAuth()
  const { isEnabled, loading } = useFeatureFlags()
  const { data: client, isPending } = useClient(id)

  if (loading) return null
  if (!isEnabled('empresas_form_v2', effectiveRole)) {
    return <Navigate to="/empresas" replace />
  }

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
        <Button variant="secondary" onClick={() => navigate('/empresas')} className="mt-4">Voltar</Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="secondary" onClick={() => navigate(isEdit ? `/empresas/${id}` : '/empresas')} className="gap-1.5">
          <Icons.ArrowLeft size={14} /> Voltar
        </Button>
        <h1 className="text-xl font-bold text-text-primary">
          {isEdit ? `Editar — ${client?.fantasy_name || client?.name || 'Empresa'}` : 'Nova Empresa'}
        </h1>
      </div>

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
