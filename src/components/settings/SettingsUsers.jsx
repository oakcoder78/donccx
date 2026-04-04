import { useState, useRef } from 'react'
import { useProfiles, useProfilesMutations } from '../../hooks/useProfiles'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuditLog } from '../../hooks/useAuditLog'
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

function AvatarUpload({ userId, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUrl || null)
  const fileRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${userId}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      onUploaded(publicUrl)
    } catch (err) {
      toast.error('Erro ao enviar foto')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-20 h-20 rounded-full overflow-hidden bg-donc-navy flex items-center justify-center cursor-pointer ring-2 ring-border-tertiary hover:ring-donc-sky transition-all"
        onClick={() => fileRef.current?.click()}
      >
        {preview
          ? <img src={preview} alt="avatar" className="w-full h-full object-cover" />
          : <span className="text-white font-bold text-2xl">?</span>
        }
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="text-xs text-donc-sky hover:underline"
        disabled={uploading}
      >
        {uploading ? 'Enviando...' : 'Trocar foto'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

function NewUserModal({ onClose, onCreated }) {
  const { logAction } = useAuditLog()
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'csm',
    email_secondary: '', phone: '', phone_is_whatsapp: false,
  })
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
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

      // Save extra fields if user_id returned
      const newUserId = data?.user_id || data?.id
      if (newUserId) {
        const extra = {}
        if (form.email_secondary) extra.email_secondary = form.email_secondary
        if (form.phone) { extra.phone = form.phone; extra.phone_is_whatsapp = form.phone_is_whatsapp }
        if (Object.keys(extra).length) {
          await supabase.from('profiles').update(extra).eq('id', newUserId)
        }
      }

      await logAction('create_user', 'user', newUserId || form.email, form.name, null, { role: form.role, email: form.email })
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
    <Modal isOpen onClose={onClose} title="Novo Usuário" maxWidth="max-w-md">
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
          <label className="label-sm">E-mail secundário</label>
          <input name="email_secondary" type="email" value={form.email_secondary} onChange={handleChange} className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">Telefone</label>
          <div className="flex items-center gap-2">
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="(11) 99999-9999" className="input-base flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                name="phone_is_whatsapp"
                checked={form.phone_is_whatsapp}
                onChange={handleChange}
                className="w-3.5 h-3.5 rounded"
              />
              WhatsApp
            </label>
          </div>
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

function EditUserModal({ profile: p, onClose, onSaved }) {
  const { updateProfile } = useProfilesMutations()
  const [name, setName] = useState(p.name || '')
  const [emailSecondary, setEmailSecondary] = useState(p.email_secondary || '')
  const [phone, setPhone] = useState(p.phone || '')
  const [phoneIsWhatsapp, setPhoneIsWhatsapp] = useState(p.phone_is_whatsapp || false)
  const [avatarUrl, setAvatarUrl] = useState(p.avatar_url || null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await updateProfile.mutateAsync({
        id: p.id,
        name,
        avatar_url: avatarUrl,
        email_secondary: emailSecondary || null,
        phone: phone || null,
        phone_is_whatsapp: phoneIsWhatsapp,
      })
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Editar Usuário" maxWidth="max-w-md">
      <div className="space-y-4">
        <AvatarUpload userId={p.id} currentUrl={avatarUrl} onUploaded={setAvatarUrl} />

        <div>
          <label className="label-sm">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">E-mail principal</label>
          <input value={p.email || ''} readOnly className="input-base w-full opacity-60 cursor-default" />
        </div>
        <div>
          <label className="label-sm">E-mail secundário</label>
          <input
            type="email"
            value={emailSecondary}
            onChange={e => setEmailSecondary(e.target.value)}
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="label-sm">Telefone</label>
          <div className="flex items-center gap-2">
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="input-base flex-1"
            />
            <label className="flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={phoneIsWhatsapp}
                onChange={e => setPhoneIsWhatsapp(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              WhatsApp
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export function SettingsUsers() {
  const { data: profiles = [], isLoading, refetch } = useProfiles()
  const { updateStatus, updateRole } = useProfilesMutations()
  const { canManageUsers } = usePermissions()
  const [showNewUser, setShowNewUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  if (isLoading) return <PageSpinner />

  const pending = profiles.filter(p => p.status === 'pending')
  const rest    = profiles.filter(p => p.status !== 'pending')

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">👥 Usuários</h2>
        {canManageUsers && (
          <Button size="sm" onClick={() => setShowNewUser(true)}>+ Novo Usuário</Button>
        )}
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
                {canManageUsers && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="green" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'active', name: p.name })}>Aprovar</Button>
                    <Button size="sm" variant="danger" onClick={() => updateStatus.mutateAsync({ id: p.id, status: 'blocked', name: p.name })}>Rejeitar</Button>
                  </div>
                )}
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
                {(p.phone) && (
                  <p className="text-xs text-text-tertiary">
                    {p.phone}{p.phone_is_whatsapp ? ' · WhatsApp' : ''}
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

      {showNewUser && <NewUserModal onClose={() => setShowNewUser(false)} onCreated={refetch} />}
      {editingUser && (
        <EditUserModal
          profile={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
