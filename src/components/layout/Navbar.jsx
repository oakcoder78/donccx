import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui/Avatar'

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/contatos', label: 'Contatos' },
  { to: '/atividades', label: 'Atividades' },
  { to: '/projetos', label: 'Projetos' },
]

export function Navbar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'
  const links = isAdminOrManager ? [...navLinks, { to: '/configuracoes', label: 'Config.' }] : navLinks

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-donc-navy h-14 flex items-center px-6 gap-8 sticky top-0 z-40">
      {/* Logo */}
      <div className="flex-shrink-0 flex items-center gap-0.5">
        <span className="text-donc-lime font-bold text-lg tracking-tight">donc</span>
        <span className="text-white/40 font-bold text-lg tracking-tight">CX</span>
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
          <Avatar name={profile?.name || profile?.email || ''} size="sm" />
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
  )
}
