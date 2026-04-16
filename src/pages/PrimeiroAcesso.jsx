import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const GENDER_OPTIONS = [
  { value: '',          label: '— Prefiro não informar —' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino',  label: 'Feminino' },
  { value: 'outro',     label: 'Prefiro não informar' },
]

export default function PrimeiroAcesso() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [gender, setGender]             = useState(profile?.gender || '')
  const [phone, setPhone]               = useState(profile?.phone || '')
  const [avatarFile, setAvatarFile]     = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [saving, setSaving]             = useState(false)

  // Dados vindos do user_metadata (enviado pelo invite-user Edge Function)
  const metaName = user?.user_metadata?.name || user?.email || ''
  const metaRole = user?.user_metadata?.role || 'csm'
  const displayName = (profile?.name || metaName).split(' ')[0]

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function redirectAfterSetup(role) {
    navigate(role === 'analyst' ? '/atendimento' : '/dashboard', { replace: true })
  }

  async function handleSave() {
    if (!user?.id) return
    setSaving(true)
    try {
      const patch = {
        id:     user.id,
        name:   profile?.name || metaName,
        email:  user.email,
        role:   profile?.role || metaRole,
        status: 'active',
        gender: gender || null,
        phone:  phone.trim() || null,
      }

      // Upload de foto se fornecida
      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop()
        const path = `${user.id}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(path)
          patch.avatar_url = publicUrl
        }
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(patch, { onConflict: 'id' })
      if (error) throw error

      await refreshProfile()
      toast.success('Perfil completado!')
      redirectAfterSetup(patch.role)
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    if (!user?.id) return
    setSaving(true)
    try {
      await supabase.from('profiles').upsert({
        id:     user.id,
        name:   profile?.name || metaName,
        email:  user.email,
        role:   profile?.role || metaRole,
        status: 'active',
      }, { onConflict: 'id' })
      await refreshProfile()
    } catch (_) {
      // Falha silenciosa — não impede o redirecionamento
    } finally {
      setSaving(false)
    }
    redirectAfterSetup(profile?.role || metaRole)
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0.5 mb-2">
            <span className="text-donc-lime font-bold text-3xl">donc</span>
            <span className="text-donc-navy/40 font-bold text-3xl">CX</span>
          </div>
        </div>

        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary mb-1">
            Bem-vindo(a), {displayName}!
          </h1>
          <p className="text-sm text-text-tertiary mb-5">
            Complete seu perfil para começar. Todos os campos são opcionais.
          </p>

          <div className="space-y-4">
            {/* Foto de perfil */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-donc-navy flex items-center justify-center border-2 border-border-tertiary flex-shrink-0">
                {avatarPreview
                  ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-2xl">
                      {(profile?.name || metaName || 'U')[0].toUpperCase()}
                    </span>
                }
              </div>
              <label className="cursor-pointer text-xs text-donc-sky hover:underline">
                Adicionar foto de perfil
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>

            {/* Gênero */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Gênero</label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm bg-bg-primary focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
              >
                {GENDER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Telefone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 px-4 bg-donc-navy text-white rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Completar perfil'}
            </button>

            <button
              onClick={handleSkip}
              disabled={saving}
              className="w-full py-2 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Pular por agora
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
