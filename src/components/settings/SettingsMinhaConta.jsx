import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const GENDER_OPTIONS = [
  { value: '',          label: '— Prefiro não informar —' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino',  label: 'Feminino' },
  { value: 'outro',     label: 'Prefiro não informar' },
]

export function SettingsMinhaConta() {
  const { profile, refreshProfile } = useAuth()
  const [gender, setGender]   = useState(profile?.gender || '')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!profile?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ gender: gender || null })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
      toast.success('Perfil atualizado')
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-base font-semibold text-text-primary mb-1">Minha Conta</h2>
      <p className="text-xs text-text-tertiary mb-5">Informações pessoais do seu perfil.</p>

      <div className="space-y-4">
        {/* Nome (read-only) */}
        <div>
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
            Nome
          </label>
          <div className="px-3 py-2 border border-border-tertiary rounded-lg text-sm text-text-secondary bg-bg-secondary">
            {profile?.name || '—'}
          </div>
        </div>

        {/* E-mail (read-only) */}
        <div>
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
            E-mail
          </label>
          <div className="px-3 py-2 border border-border-tertiary rounded-lg text-sm text-text-secondary bg-bg-secondary">
            {profile?.email || '—'}
          </div>
        </div>

        {/* Gênero */}
        <div>
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
            Gênero
          </label>
          <select
            value={gender}
            onChange={e => setGender(e.target.value)}
            className="w-full px-3 py-2 border border-border-tertiary rounded-lg text-sm text-text-primary bg-bg-primary focus:outline-none focus:ring-2 focus:ring-donc-navy"
          >
            {GENDER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-donc-navy text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
