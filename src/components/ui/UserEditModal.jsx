import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'
import { maskPhoneInput, stripPhone } from '../../lib/formatPhone'
import { Calendar } from 'lucide-react'
import { useGoogleCalendarStatus } from '../../hooks/useGoogleCalendarStatus'

const GENDER_OPTIONS = [
  { value: '',          label: '— Prefiro não informar —' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino',  label: 'Feminino' },
  { value: 'outro',     label: 'Prefiro não informar' },
]

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
    } catch {
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
          : <span className="text-white font-bold text-2xl">{(currentUrl ? '?' : '?')}</span>
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

/**
 * Modal de edição de perfil unificado.
 * @param {object}   profile   — linha da tabela profiles (id, name, avatar_url, email_secondary, phone, phone_is_whatsapp)
 * @param {string}   email     — e-mail de autenticação (auth.users), exibido read-only e usado no reset de senha
 * @param {string}   title     — título do modal (default "Editar Perfil")
 * @param {function} onClose   — fecha o modal
 * @param {function} onSaved   — chamado após salvar com sucesso (ex: refreshProfile ou refetch)
 */
export function UserEditModal({ profile, email, title = 'Editar Perfil', onClose, onSaved }) {
  const [name, setName]                     = useState(profile?.name || '')
  const [emailSecondary, setEmailSecondary] = useState(profile?.email_secondary || '')
  const [phone, setPhone]                   = useState(maskPhoneInput(profile?.phone || ''))
  const [phoneIsWhatsapp, setPhoneIsWhatsapp] = useState(profile?.phone_is_whatsapp || false)
  const [gender, setGender]                 = useState(profile?.gender || '')
  const [birthDate, setBirthDate]         = useState(profile?.birth_date || '')
  const [avatarUrl, setAvatarUrl]           = useState(profile?.avatar_url || null)
  const [saving, setSaving]                 = useState(false)
  const [sendingReset, setSendingReset]     = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        name,
        avatar_url: avatarUrl,
        email_secondary: emailSecondary || null,
        phone: stripPhone(phone) || null,
        phone_is_whatsapp: phoneIsWhatsapp,
        gender: gender || null,
        birth_date: birthDate || null,
      }).eq('id', profile.id)
      if (error) throw error
      toast.success('Perfil atualizado')
      await onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://donccx.vercel.app/reset-password',
      })
      if (error) throw error
      toast.success('E-mail de redefinição de senha enviado')
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar e-mail')
    } finally {
      setSendingReset(false)
    }
  }

  const { isLoading, isConnected, connectGoogleCalendar } = useGoogleCalendarStatus()
  const wasConnectedRef = useRef(false)

  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true
      toast.success('Google Calendar conectado!')
    }
  }, [isConnected])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-tertiary rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>

        <AvatarUpload userId={profile?.id} currentUrl={avatarUrl} onUploaded={setAvatarUrl} />

        <div>
          <label className="label-sm">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-base w-full" />
        </div>

        <div>
          <label className="label-sm">E-mail principal</label>
          <input value={email || ''} readOnly className="input-base w-full opacity-60 cursor-default" />
        </div>

        <div>
          <label className="label-sm">E-mail secundário</label>
          <input
            type="email"
            value={emailSecondary}
            onChange={e => setEmailSecondary(e.target.value)}
            placeholder="opcional"
            className="input-base w-full"
          />
        </div>

        <div>
          <label className="label-sm">Telefone</label>
          <div className="flex items-center gap-2">
            <input
              value={phone}
              onChange={e => setPhone(maskPhoneInput(e.target.value))}
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

        <div>
          <label className="label-sm">Gênero</label>
          <select
            value={gender}
            onChange={e => setGender(e.target.value)}
            className="input-base w-full"
          >
            {GENDER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-sm">Data de nascimento</label>
          <input
            type="date"
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
            className="input-base w-full"
          />
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={sendingReset || !email}
            className="text-xs text-donc-sky hover:underline disabled:opacity-50"
          >
            {sendingReset ? 'Enviando...' : 'Enviar e-mail de redefinição de senha'}
          </button>
        </div>

        <div className="border-t border-border-tertiary pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Google Calendar</span>
            {isLoading ? (
              <span className="text-xs text-text-secondary animate-pulse">Verificando...</span>
            ) : isConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-600">
                <Calendar className="w-3 h-3 text-green-500" />
                Conectado
              </span>
            ) : (
              <span className="text-xs text-text-secondary">Não conectado</span>
            )}
          </div>
          {!isConnected && !isLoading && (
            <button
              type="button"
              onClick={connectGoogleCalendar}
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              Conectar Google Calendar
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium bg-donc-navy text-white rounded-md hover:bg-donc-navy/90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
