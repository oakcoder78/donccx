import { useState } from 'react'
import { SettingsHealth } from './SettingsHealth'
import { SettingsCatalog } from './SettingsCatalog'
import { SettingsSegments } from './SettingsSegments'
import { SettingsStages } from './SettingsStages'
import { SettingsUsers } from './SettingsUsers'
import { SettingsLogs } from './SettingsLogs'
import { SettingsFreshdesk } from './SettingsFreshdesk'
import { SettingsDonkie } from './SettingsDonkie'
import { SettingsAI } from './SettingsAI'
import { SettingsDoncAPI } from './SettingsDoncAPI'
import { SettingsMinhaConta } from './SettingsMinhaConta'
import { SettingsFeatureFlags } from './SettingsFeatureFlags'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../contexts/AuthContext'
import { SettingsMenuIcons } from '../../lib/icons'

const BASE_MENU = [
  { key: 'minha-conta', Icon: SettingsMenuIcons['minha-conta'], label: 'Minha Conta' },
  { key: 'health',      Icon: SettingsMenuIcons['health'],       label: 'Health Score' },
  { key: 'catalog',     Icon: SettingsMenuIcons['catalog'],      label: 'Catálogos'   },
  { key: 'segments',    Icon: SettingsMenuIcons['segments'],     label: 'Segmentos'   },
  { key: 'stages',      Icon: SettingsMenuIcons['stages'],       label: 'Estágios'    },
  { key: 'users',       Icon: SettingsMenuIcons['users'],        label: 'Usuários'    },
  { key: 'logs',        Icon: SettingsMenuIcons['logs'],         label: 'Auditoria'   },
  { key: 'freshdesk',   Icon: SettingsMenuIcons['freshdesk'],    label: 'Freshdesk',  adminOnly: true },
  { key: 'donkie',      Icon: SettingsMenuIcons['donkie'],       label: 'Donkie',     adminOnly: true },
  { key: 'ai',          Icon: SettingsMenuIcons['ai'],           label: 'IA',          adminOnly: true },
  { key: 'donc-api',    Icon: SettingsMenuIcons['donc-api'],     label: 'API DONC',        managerOnly: true },
  { key: 'features',    Icon: SettingsMenuIcons['features'],     label: 'Funcionalidades', adminOnly: true  },
]

export default function SettingsPage() {
  const { canManageUsers } = usePermissions()
  const { isAdmin } = useAuth()
  const [section, setSection] = useState('minha-conta')

  const { isManager } = useAuth()

  const MENU = BASE_MENU.filter(m => {
    if (m.key === 'logs' && !canManageUsers) return false
    if (m.adminOnly && !isAdmin) return false
    if (m.managerOnly && !isManager) return false
    return true
  })

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="w-52 bg-bg-primary border-r border-border-tertiary p-3 flex-shrink-0">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2">Configurações</p>
        <nav className="space-y-0.5">
          {MENU.map(item => {
            const MenuIcon = item.Icon
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  section === item.key
                    ? 'bg-donc-navy text-white'
                    : 'text-text-secondary hover:bg-bg-secondary'
                }`}
              >
                <MenuIcon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6">
        {section === 'minha-conta' && <SettingsMinhaConta />}
        {section === 'health'    && <SettingsHealth />}
        {section === 'catalog'   && <SettingsCatalog />}
        {section === 'segments'  && <SettingsSegments />}
        {section === 'stages'    && <SettingsStages />}
        {section === 'users'     && <SettingsUsers />}
        {section === 'logs'      && canManageUsers && <SettingsLogs />}
        {section === 'freshdesk' && isAdmin && <SettingsFreshdesk />}
        {section === 'donkie'    && isAdmin && <SettingsDonkie />}
        {section === 'ai'        && isAdmin   && <SettingsAI />}
        {section === 'donc-api'  && isManager && <SettingsDoncAPI />}
        {section === 'features'  && isAdmin   && <SettingsFeatureFlags />}
      </main>
    </div>
  )
}
