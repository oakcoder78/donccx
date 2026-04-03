import { useState } from 'react'
import { useProfiles, useProfilesMutations } from '../../hooks/useProfiles'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PageSpinner } from '../ui/Spinner'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'

const statusVariant = { active: 'green', pending: 'amber', blocked: 'red' }
const statusLabel   = { active: 'Ativo', pending: 'Pendente', blocked: 'Bloqueado' }
const roleLabel     = { admin: 'Admin', manager: 'Manager', csm: 'CSM' }

function NewUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'csm' })
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Senha deve ter ao menos 8 caracteres'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { name: form.name, email: form.email, password: form.password, role: form.role },
      })
      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Erro ao criar usuário')
        return
      }
      toast.success('Usuário criado com sucesso')
      onCreated?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Erro ao criar usuário')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Novo Usuário" maxWidth="max-w-sm">
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
          <label className="label-sm">Senha * (mín. 8 caracteres)</label>
          <input name="password" type="password" value={form.password} onChange={handleChange} required minLength={8} className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">Perfil</label>
          <select name="role" value={form.role} onChange={handleChange} className="input-base w-full">
            <option value="csm">CSM</option>
            <option value="manager">CS Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar Usuário'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function SettingsUsers() {
  const { data: profiles = [], isLoading, refetch } = useProfiles()
  const { updateStatus, updateRole } = useProfilesMutations()
  const [showNewUser, setShowNewUser] = useState(false)

  if (isLoading) return <PageSpinner />

  const pending = profiles.filter(p => p.status === 'pending')
  const rest    = profiles.filter(p => p.status !== 'pending')

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">👥 Usuários</h2>
        <Button size="sm" onClick={() => setShowNewUser(true)}>+ Novo Usuário</Button>
      </div>

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
                  <Button size="sm" variant="green" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'active' })}>Aprovar</Button>
                  <Button size="sm" variant="danger" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'blocked' })}>Rejeitar</Button>
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
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-donc-navy flex items-center justify-center">
                {p.avatar_url
                  ? <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-xs">{(p.name || 'U')[0].toUpperCase()}</span>
                }
              </div>
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
                <Button size="sm" variant="danger" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'blocked' })}>Bloquear</Button>
              )}
              {p.status === 'blocked' && (
                <Button size="sm" variant="green" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'active' })}>Reativar</Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {showNewUser && <NewUserModal onClose={() => setShowNewUser(false)} onCreated={refetch} />}
    </div>
  )
}
