import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProfiles, useProfilesMutations } from '../../hooks/useProfiles'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuditLog } from '../../hooks/useAuditLog'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PageSpinner } from '../ui/Spinner'
import { UserEditModal } from '../ui/UserEditModal'
import { formatPhone } from '../../lib/formatPhone'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'

const statusVariant = { active: 'green', pending: 'amber', blocked: 'red' }
const statusLabel   = { active: 'Ativo', pending: 'Pendente', blocked: 'Bloqueado' }
const roleLabel     = { admin: 'Admin', manager: 'Manager', csm: 'CSM', analyst: 'Analyst' }


// ── Modal: convidar usuário por e-mail ───────────────────────────────────────
function InviteUserModal({ onClose, onDone }) {
  const { logAction } = useAuditLog()
  const [form, setForm] = useState({ name: '', email: '', role: 'csm' })
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { toast.error('Sessão expirada. Faça login novamente.'); return }

      // Inserir profile com status pending
      const { data: profile, error: insertError } = await supabase
        .from('profiles')
        .insert({ name: form.name, email: form.email, role: form.role, status: 'pending' })
        .select('id')
        .single()
      if (insertError) throw new Error(insertError.message)

      // Enviar convite
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email,
          role: form.role,
          name: form.name,
          redirectTo: 'https://donccx.vercel.app/primeiro-acesso',
        }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) throw new Error(data?.error || 'Erro ao enviar convite')

      // Atualizar status para invited
      await supabase.from('profiles').update({ status: 'invited' }).eq('id', profile.id)

      await logAction('invite_user', 'user', profile.id, form.name, null, { role: form.role, email: form.email })
      toast.success(`Convite enviado para ${form.email}`)
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar convite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Convidar Usuário" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label-sm">Nome *</label>
          <input name="name" value={form.name} onChange={handleChange} required className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">E-mail *</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} required className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">Perfil</label>
          <select name="role" value={form.role} onChange={handleChange} className="input-base w-full">
            <option value="csm">CSM</option>
            <option value="analyst">Analyst</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar Convite'}</Button>
        </div>
      </form>
    </Modal>
  )
}


// ── Modal: aprovar solicitação e enviar convite ───────────────────────────────
function ApproveModal({ request, onClose, onDone }) {
  const { logAction } = useAuditLog()
  const [role, setRole]     = useState('csm')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sessão expirada')

      const fnUrl     = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`
      const redirectTo = 'https://donccx.vercel.app/primeiro-acesso'

      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: request.email, role, name: request.name, redirectTo }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) throw new Error(data?.error || 'Erro ao enviar convite')

      // Marcar solicitação como invited (vem de access_requests) ou atualizar profile
      if (request._source === 'access_requests') {
        await supabase.from('access_requests').update({ status: 'invited' }).eq('id', request.id)
      } else {
        // Perfil pendente legado — atualiza role + status
        await supabase.from('profiles').update({ role, status: 'invited' }).eq('id', request.id)
      }

      await logAction('invite_user', 'user', request.id, request.name, null, { role, email: request.email })
      toast.success(`Acesso aprovado! Email enviado para ${request.email}`)
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar convite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Aprovar e Convidar" maxWidth="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Selecione o perfil para <strong className="text-text-primary">{request.name}</strong> e envie o convite por e-mail para{' '}
          <span className="font-mono text-xs">{request.email}</span>.
        </p>
        <div>
          <label className="label-sm">Perfil</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="input-base w-full">
            <option value="csm">CSM</option>
            <option value="analyst">Analyst</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={loading} onClick={handleConfirm}>
            {loading ? 'Enviando...' : 'Enviar Convite'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}


// ── Componente principal ──────────────────────────────────────────────────────
export function SettingsUsers() {
  const { data: profiles = [], isLoading, refetch } = useProfiles()
  const { updateStatus, updateRole } = useProfilesMutations()
  const { canManageUsers } = usePermissions()
  const [showInviteUser, setShowInviteUser]   = useState(false)
  const [editingUser, setEditingUser]         = useState(null)
  const [approvingRequest, setApprovingRequest] = useState(null)

  // Solicitações de acesso pendentes (novo fluxo)
  const { data: accessRequests = [], refetch: refetchAR } = useQuery({
    queryKey: ['access_requests', 'pending'],
    queryFn: async () => {
      const { data } = await supabase
        .from('access_requests')
        .select('*')
        .in('status', ['pending'])
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  function refetchAll() { refetch(); refetchAR() }

  if (isLoading) return <PageSpinner />

  const pendingProfiles = profiles.filter(p => p.status === 'pending')
  const invitedProfiles = profiles.filter(p => p.status === 'invited')
  const rest            = profiles.filter(p => p.status !== 'pending' && p.status !== 'invited')

  const hasPending = accessRequests.length > 0 || pendingProfiles.length > 0

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">👥 Usuários</h2>
      </div>

      {/* ── Solicitações pendentes ─────────────────────────────────────── */}
      {hasPending && (
        <div className="bg-donc-amber/10 border border-donc-amber/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-donc-amber mb-3">
            Aguardando aprovação ({accessRequests.length + pendingProfiles.length})
          </h3>
          <div className="space-y-2">
            {/* Novas solicitações via access_requests */}
            {accessRequests.map(req => (
              <div key={req.id} className="flex items-center gap-3 bg-bg-primary rounded-md p-3">
                <Avatar name={req.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{req.name}</p>
                  <p className="text-xs text-text-tertiary">{req.email}</p>
                </div>
                {canManageUsers && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="green"
                      onClick={() => setApprovingRequest({ ...req, _source: 'access_requests' })}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        await supabase.from('access_requests').update({ status: 'rejected' }).eq('id', req.id)
                        refetchAR()
                        toast.success('Solicitação rejeitada')
                      }}
                    >
                      Rejeitar
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {/* Perfis pendentes legados */}
            {pendingProfiles.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-bg-primary rounded-md p-3">
                <Avatar name={p.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{p.name}</p>
                  <p className="text-xs text-text-tertiary">{p.email}</p>
                </div>
                {canManageUsers && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="green"
                      onClick={() => setApprovingRequest({ ...p, _source: 'profiles' })}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        await supabase.from('profiles').update({ status: 'rejected' }).eq('id', p.id)
                        refetch()
                        toast.success('Solicitação rejeitada')
                      }}
                    >
                      Rejeitar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Convites enviados ──────────────────────────────────────────── */}
      {invitedProfiles.length > 0 && (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Convites enviados ({invitedProfiles.length})
          </h3>
          <div className="space-y-2">
            {invitedProfiles.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border-tertiary last:border-0">
                <Avatar name={p.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{p.name}</p>
                  <p className="text-xs text-text-tertiary">{p.email} · {roleLabel[p.role] || '—'}</p>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-donc-sky/15 text-donc-sky whitespace-nowrap">
                  Convite enviado
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Todos os usuários ativos/bloqueados ───────────────────────── */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Todos os usuários</h3>
          {canManageUsers && (
            <Button size="sm" onClick={() => setShowInviteUser(true)}>+ Convidar Usuário</Button>
          )}
        </div>
        <div className="space-y-2">
          {rest.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border-tertiary last:border-0">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-donc-navy flex items-center justify-center">
                {p.avatar_url
                  ? <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-xs">{(p.name || 'U')[0].toUpperCase()}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{p.name}</p>
                <p className="text-xs text-text-tertiary">{p.email}</p>
                {p.phone && (
                  <p className="text-xs text-text-tertiary">
                    {formatPhone(p.phone)}{p.phone_is_whatsapp ? ' · WhatsApp' : ''}
                  </p>
                )}
              </div>
              <Badge variant={statusVariant[p.status]}>{statusLabel[p.status]}</Badge>
              {canManageUsers ? (
                <select
                  value={p.role}
                  onChange={e => updateRole.mutateAsync({ id: p.id, role: e.target.value, name: p.name })}
                  className="input-base text-xs w-24"
                >
                  <option value="csm">CSM</option>
                  <option value="analyst">Analyst</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="text-xs text-text-tertiary w-24 text-center">{roleLabel[p.role]}</span>
              )}
              <Button size="sm" variant="secondary" onClick={() => setEditingUser(p)}>Editar</Button>
              {canManageUsers && p.status === 'active' && (
                <Button size="sm" variant="danger" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'blocked', name: p.name })}>Bloquear</Button>
              )}
              {canManageUsers && p.status === 'blocked' && (
                <Button size="sm" variant="green" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'active', name: p.name })}>Reativar</Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Modais ────────────────────────────────────────────────────── */}
      {showInviteUser && <InviteUserModal onClose={() => setShowInviteUser(false)} onDone={refetchAll} />}
      {editingUser && (
        <UserEditModal
          profile={editingUser}
          email={editingUser.email}
          title="Editar Usuário"
          onClose={() => setEditingUser(null)}
          onSaved={refetchAll}
        />
      )}
      {approvingRequest && (
        <ApproveModal
          request={approvingRequest}
          onClose={() => setApprovingRequest(null)}
          onDone={refetchAll}
        />
      )}
    </div>
  )
}
