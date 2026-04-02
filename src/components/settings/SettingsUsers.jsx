import { useProfiles, useProfilesMutations } from '../../hooks/useProfiles'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { PageSpinner } from '../ui/Spinner'

const statusVariant = { active: 'green', pending: 'amber', blocked: 'red' }
const statusLabel = { active: 'Ativo', pending: 'Pendente', blocked: 'Bloqueado' }
const roleLabel = { admin: 'Admin', manager: 'Manager', csm: 'CSM' }

export function SettingsUsers() {
  const { data: profiles = [], isLoading } = useProfiles()
  const { updateStatus, updateRole } = useProfilesMutations()

  if (isLoading) return <PageSpinner />

  const pending = profiles.filter(p => p.status === 'pending')
  const rest = profiles.filter(p => p.status !== 'pending')

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-base font-semibold text-text-primary">👥 Usuários</h2>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="bg-donc-amber/10 border border-donc-amber/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-donc-amber mb-3">Aguardando aprovação ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-bg-primary rounded-md p-3">
                <Avatar name={p.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{p.name}</p>
                  <p className="text-xs text-text-tertiary">{p.email} · {roleLabel[p.role]}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="green" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'active' })}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'blocked' })}>
                    Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All users */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Todos os usuários</h3>
        <div className="space-y-2">
          {rest.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border-tertiary last:border-0">
              <Avatar name={p.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{p.name}</p>
                <p className="text-xs text-text-tertiary">{p.email}</p>
              </div>
              <Badge variant={statusVariant[p.status]}>{statusLabel[p.status]}</Badge>

              <select
                value={p.role}
                onChange={e => updateRole.mutateAsync({ id: p.id, role: e.target.value })}
                className="input-base text-xs w-24"
              >
                <option value="csm">CSM</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>

              {p.status === 'active' && (
                <Button size="sm" variant="danger" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'blocked' })}>
                  Bloquear
                </Button>
              )}
              {p.status === 'blocked' && (
                <Button size="sm" variant="green" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'active' })}>
                  Reativar
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
