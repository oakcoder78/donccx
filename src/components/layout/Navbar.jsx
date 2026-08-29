import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useNotifications } from '@/hooks/useNotifications'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { UserEditModal } from '../ui/UserEditModal'
import { Icons } from '@/lib/icons'
import { ROLE_OPTIONS } from '@/lib/roles'
import toast from 'react-hot-toast'

const mainNavLinks = [
  { to: '/dashboard',      label: 'Dashboard'   },
  { to: '/labs/dashboard', label: 'Labs', adminOnly: true },
  { to: '/empresas',       label: 'Empresas'    },
  { to: '/contatos',       label: 'Contatos'    },
  { to: '/atividades',     label: 'Atividades'  },
  { to: '/projetos',       label: 'Projetos'    },
  { to: '/cockpits',       label: 'Cockpits'    },
  { to: '/atendimento',    label: 'Atendimento', featureFlag: 'whatsapp_atendimento' },
]

const analystNavLinks = [
  { to: '/atendimento',  label: 'Atendimento', featureFlag: 'whatsapp_atendimento' },
]

export function Navbar({ googleOAuthSignal }) {
  const { user, profile, effectiveRole, impersonatedRole, isImpersonating, setImpersonation, clearImpersonation, signOut, refreshProfile } = useAuth()
  const { canViewSettings } = usePermissions()
  const { isEnabled } = useFeatureFlags()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    if (googleOAuthSignal.error) {
      toast.error(`Autorização negada: ${googleOAuthSignal.error}`)
    }
    if (googleOAuthSignal.success || googleOAuthSignal.error) {
      setShowProfile(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [googleOAuthSignal])

  const isAdminOrManager = effectiveRole === 'admin' || effectiveRole === 'manager'
  const { data: syncData } = useSyncStatus({ enabled: isAdminOrManager })
  const syncFailed = isAdminOrManager && syncData?.status === 'failed'

  const isAnalyst = effectiveRole === 'analyst'

  const availableLinks = (links) => links.filter(link =>
    (!link.featureFlag || isEnabled(link.featureFlag, effectiveRole)) &&
    (!link.adminOnly || effectiveRole === 'admin')
  )

  const links = isAnalyst
    ? availableLinks(analystNavLinks)
    : canViewSettings && isEnabled('settings_menu', profile?.role)
      ? [...availableLinks(mainNavLinks), { to: '/configuracoes', label: 'Configurações' }]
      : availableLinks(mainNavLinks)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const { unreadCount, markAsRead } = useNotifications()

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

        {/* Sync failure badge */}
        {syncFailed && (
          <button
            onClick={() => navigate('/configuracoes')}
            className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors mr-1 px-2 py-1.5 rounded-md hover:bg-white/10"
            title={syncData?.error_message || 'Falha na sincronização mensal'}
          >
            <Icons.AlertTriangle size={16} />
            <span className="text-[11px] font-medium hidden sm:inline">Sync</span>
          </button>
        )}

        {/* User button */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 hover:bg-white/10 rounded-md px-2 py-1.5 transition-colors"
          >
            <div className="relative">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-donc-lime flex items-center justify-center flex-shrink-0">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-donc-navy font-bold text-xs">{initials}</span>
                }
              </div>
              {profile?.role === 'admin' && unreadCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    markAsRead()
                    localStorage.setItem('settings_section', 'donkie')
                    navigate('/configuracoes')
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm hover:bg-red-600 z-10 cursor-pointer"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </button>
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-white text-xs font-medium leading-tight">{profile?.name || 'Usuário'}</div>
              <div className="text-white/50 text-[11px] uppercase">{isImpersonating ? `${effectiveRole} (via Admin)` : (profile?.role || 'csm')}</div>
            </div>
            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-20 py-1">
                <button
                  onClick={() => { setDropdownOpen(false); setShowProfile(true) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-secondary transition-colors"
                >
                  Minha conta
                </button>
                {/* Admin backdoor: Ver como */}
                {profile?.role === 'admin' && (
                  <div className="px-3 py-2 border-t border-border-tertiary mt-1">
                    <label className="label-sm mb-1 block">Ver como</label>
                    <select
                      value={impersonatedRole || ''}
                      onChange={e => {
                        const v = e.target.value || null
                        setDropdownOpen(false)
                        if (v) setImpersonation(v)
                        else clearImpersonation()
                      }}
                      className="input-base w-full text-xs"
                    >
                      <option value="">— Meu papel (Admin) —</option>
                      {ROLE_OPTIONS.filter(r => r.value !== 'admin').map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {isImpersonating && (
                      <button
                        onClick={() => { setDropdownOpen(false); clearImpersonation() }}
                        className="mt-1 text-xs text-donc-red hover:underline"
                      >
                        Sair do preview
                      </button>
                    )}
                  </div>
                )}
                <div className="border-t border-border-tertiary my-1" />
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-sm text-donc-red hover:bg-bg-secondary transition-colors"
                >
                  Sair
                </button>
                <div className="px-3 py-1.5 text-[10px] text-text-tertiary border-t border-border-tertiary mt-1 font-mono">
                  v · {__COMMIT_HASH__}
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      {isImpersonating && (
        <div className="bg-amber-400 text-amber-900 text-xs font-medium text-center py-1.5 px-4 flex items-center justify-center gap-2">
          <Icons.Eye size={14} />
          <span>Visualizando como <strong>{effectiveRole}</strong> — dados reais filtrados por RLS. Expira em 1h.</span>
          <button onClick={() => clearImpersonation()} className="underline font-semibold ml-2">Sair do preview</button>
        </div>
      )}

      {showProfile && (
        <UserEditModal
          profile={profile}
          email={user?.email}
          title="Minha Conta"
          onClose={() => setShowProfile(false)}
          onSaved={refreshProfile}
        />
      )}
    </>
  )
}
