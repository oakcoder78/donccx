import { useState, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/empresas', label: 'Empresas' },
  { to: '/contatos', label: 'Contatos' },
  { to: '/atividades', label: 'Atividades' },
  { to: '/projetos', label: 'Projetos' },
]

function UserProfileModal({ onClose }) {
  const { user, profile, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.name || '')
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || null)
  const fileRef = useRef()

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('user-avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('user-avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
      await refreshProfile()
    } catch (err) {
      toast.error('Erro ao enviar avatar')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    const { error } = await supabase.from('profiles').update({ name }).eq('id', user.id)
    if (error) { toast.error(error.message); return }
    await refreshProfile()
    toast.success('Perfil atualizado')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-tertiary rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Minha Conta</h2>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-full overflow-hidden bg-donc-navy flex items-center justify-center cursor-pointer ring-2 ring-border-tertiary hover:ring-donc-sky transition-all"
            onClick={() => fileRef.current?.click()}
          >
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-white font-bold text-2xl">{(name || 'U')[0].toUpperCase()}</span>
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
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        {/* Name */}
        <div>
          <label className="label-sm">Nome</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-base w-full"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="label-sm">E-mail</label>
          <input value={user?.email || ''} readOnly className="input-base w-full opacity-60 cursor-default" />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancelar</button>
          <button onClick={handleSave} className="px-3 py-1.5 text-sm font-medium bg-donc-navy text-white rounded-md hover:bg-donc-navy/90">Salvar</button>
        </div>
      </div>
    </div>
  )
}

export function Navbar() {
  const { profile, signOut } = useAuth()
  const { canViewSettings } = usePermissions()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const links = canViewSettings ? [...navLinks, { to: '/configuracoes', label: 'Config.' }] : navLinks

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = (profile?.name || profile?.email || 'U')[0].toUpperCase()

  return (
    <>
      <nav className="bg-donc-navy h-14 flex items-center px-6 gap-8 sticky top-0 z-40">
        {/* Logo */}
        <div className="flex-shrink-0 flex items-center gap-0.5">
          <span className="text-donc-lime font-bold text-lg tracking-tight">donc</span>
          <span className="text-white font-bold text-lg tracking-tight">CX</span>
          <span className="text-white/60 font-light text-sm tracking-tight ml-0.5">Hub</span>
        </div>

        {/* Nav tabs */}
        <div className="flex items-center gap-1 flex-1">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
                  isActive
                    ? 'text-white border-b-[3px] border-donc-lime rounded-b-none pb-[5px]'
                    : 'text-white/60 hover:text-white/90'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* User button */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 hover:bg-white/10 rounded-md px-2 py-1.5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden bg-donc-lime flex items-center justify-center flex-shrink-0">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-donc-navy font-bold text-xs">{initials}</span>
              }
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-white text-xs font-medium leading-tight">{profile?.name || 'Usuário'}</div>
              <div className="text-white/50 text-[11px] uppercase">{profile?.role || 'csm'}</div>
            </div>
            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={() => { setDropdownOpen(false); setShowProfile(true) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-secondary transition-colors"
                >
                  Minha conta
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-sm text-donc-red hover:bg-bg-secondary transition-colors"
                >
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
