import { useState, useEffect } from 'react'
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
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [gender, setGender]               = useState(profile?.gender || '')
  const [phone, setPhone]                 = useState(profile?.phone || '')
  const [avatarFile, setAvatarFile]       = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [password, setPassword]           = useState('')
  const [confirm, setConfirm]             = useState('')
  const [errors, setErrors]               = useState({})
  const [saving, setSaving]               = useState(false)

  useEffect(() => {
    if (profile?.status === 'active') {
      navigate(profile.role === 'analyst' ? '/atendimento' : '/dashboard', { replace: true })
    }
  }, [profile])

  const metaName    = user?.user_metadata?.name || user?.email || ''
  const metaRole    = user?.user_metadata?.role || 'csm'
  const displayName = (profile?.name || metaName).split(' ')[0]
  const currentAvatar = avatarPreview || profile?.avatar_url || null

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function validate() {
    const errs = {}
    if (!password) {
      errs.password = 'Senha é obrigatória'
    } else if (password.length < 6) {
      errs.password = 'Senha deve ter no mínimo 6 caracteres'
    }
    if (!confirm) {
      errs.confirm = 'Confirmação de senha é obrigatória'
    } else if (confirm !== password) {
      errs.confirm = 'As senhas não coincidem'
    }
    return errs
  }

  async function handleSave() {
    if (!user?.id) return
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) throw pwError

      const patch = {
        id:     user.id,
        name:   profile?.name || metaName,
        email:  user.email,
        role:   profile?.role || metaRole,
        status: 'active',
        gender: gender || null,
        phone:  phone.trim() || null,
      }

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

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(patch, { onConflict: 'id' })
      if (profileError) throw profileError

      await supabase
        .from('access_requests')
        .update({ status: 'approved' })
        .eq('email', user.email)

      await supabase.auth.signOut()
      toast.success('Perfil configurado! Faça login com sua nova senha.')
      navigate('/login', { replace: true })
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

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
            Configure seu perfil e defina sua senha para começar.
          </p>

          <div className="space-y-4">
            {/* Foto de perfil */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-donc-navy flex items-center justify-center border-2 border-border-tertiary flex-shrink-0">
                {currentAvatar
                  ? <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-2xl">
                      {(profile?.name || metaName || 'U')[0].toUpperCase()}
                    </span>
                }
              </div>
              <label className="cursor-pointer text-xs text-donc-sky hover:underline">
                {currentAvatar ? 'Alterar foto de perfil' : 'Adicionar foto de perfil'}
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

            {/* Senha */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Defina sua senha de acesso <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })) }}
                placeholder="Mínimo 6 caracteres"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky ${errors.password ? 'border-red-400' : 'border-border-secondary'}`}
              />
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password}</p>
              )}
            </div>

            {/* Confirmar senha */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Confirmar senha <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: undefined })) }}
                placeholder="Repita a senha"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky ${errors.confirm ? 'border-red-400' : 'border-border-secondary'}`}
              />
              {errors.confirm && (
                <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 px-4 bg-donc-navy text-white rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Completar perfil'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
