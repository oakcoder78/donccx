import { useState, lazy, Suspense } from 'react'
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

import { SettingsFeatureFlags } from './SettingsFeatureFlags'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../contexts/AuthContext'
import { useFeatureFlags } from '../../hooks/useFeatureFlags'
import { SettingsMenuIcons } from '../../lib/icons'

import { SettingsFaseTypes } from './SettingsFaseTypes'
import { SettingsActivityTypes } from './SettingsActivityTypes'
import { SettingsProjectTemplates } from './SettingsProjectTemplates'

const MENU_GROUPS = [
  { label: 'Equipe', items: [
    { key: 'users', label: 'Usuários' },
  ]},
  { label: 'Produto', items: [
    { key: 'stages',   label: 'Estágios' },
    { key: 'segments', label: 'Segmentos' },
    { key: 'catalog',  label: 'Catálogos' },
  ]},
  { label: 'Projetos', items: [
    { key: 'fase-types',       label: 'Tipos de Fase',      adminOnly: true },
    { key: 'activity-types',  label: 'Tipos de Atividade', adminOnly: true },
    { key: 'project-templates', label: 'Templates',        adminOnly: true },
  ]},
  { label: 'Health Score', items: [
    { key: 'health', label: 'Health Score' },
  ]},
  { label: 'IA & Automação', items: [
    { key: 'donkie', label: 'Donkie', adminOnly: true },
    { key: 'ai',     label: 'IA',     adminOnly: true },
  ]},
  { label: 'Integrações', items: [
    { key: 'freshdesk', label: 'Freshdesk' },
    { key: 'donc-api',  label: 'API DONC',   managerOnly: true },
  ]},
  { label: 'Governança', items: [
    { key: 'logs', label: 'Auditoria' },
    { key: 'features', label: 'Funcionalidades', adminOnly: true },
  ]},
]

export default function SettingsPage() {
  const { canManageUsers } = usePermissions()
  const { isAdmin, isManager, profile } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const [section, setSection] = useState(() => localStorage.getItem('settings_section') || 'users')

  const handleSetSection = (key) => {
    localStorage.setItem('settings_section', key)
    setSection(key)
  }

  const MENU = MENU_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.key === 'logs' && !canManageUsers) return false
      if (item.adminOnly && !isAdmin) return false
      if (item.managerOnly && !isManager) return false
      return true
    })
  })).filter(group => group.items.length > 0)

  const renderSection = (key) => {
    switch (key) {
      case 'health':    return <SettingsHealth />
      case 'catalog':  return <SettingsCatalog />
      case 'segments': return <SettingsSegments />
      case 'stages':   return <SettingsStages />
      case 'users':    return <SettingsUsers />
      case 'logs':     return canManageUsers && <SettingsLogs />
      case 'freshdesk': return isEnabled('freshdesk', profile?.role) && <SettingsFreshdesk />
      case 'donkie':   return isAdmin && <SettingsDonkie />
      case 'ai':       return isAdmin && <SettingsAI />
      case 'donc-api': return isManager && <SettingsDoncAPI />
      case 'features': return isAdmin && <SettingsFeatureFlags />
      case 'fase-types': return <SettingsFaseTypes />
      case 'activity-types': return <SettingsActivityTypes />
      case 'project-templates': return isAdmin && <SettingsProjectTemplates />
      default: return null
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="w-52 bg-bg-primary border-r border-border-tertiary p-3 flex-shrink-0">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-3">Configurações</p>
        <nav className="space-y-4">
          {MENU.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const MenuIcon = SettingsMenuIcons[item.key] || SettingsMenuIcons['default']
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleSetSection(item.key)}
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
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        {renderSection(section)}
      </main>
    </div>
  )
}