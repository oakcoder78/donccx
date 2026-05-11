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
import { EmailTemplatesManager } from '../email/EmailTemplatesManager'

const MENU_GROUPS = [
  { label: 'Equipe', items: [
    { key: 'users', label: 'Usuários', featureFlag: 'users' },
  ]},
  { label: 'Produto', items: [
    { key: 'stages',   label: 'Estágios', featureFlag: 'stages' },
    { key: 'segments', label: 'Segmentos', featureFlag: 'segments' },
    { key: 'catalog',  label: 'Catálogos', featureFlag: 'catalog' },
  ]},
  { label: 'Projetos', items: [
    { key: 'fase-types',       label: 'Tipos de Fase',      featureFlag: 'fase_types' },
    { key: 'activity-types',  label: 'Tipos de Atividade', featureFlag: 'activity_types' },
    { key: 'project-templates', label: 'Templates',        featureFlag: 'project_templates' },
  ]},
  { label: 'Health Score', items: [
    { key: 'health', label: 'Health Score', featureFlag: 'health' },
  ]},
  { label: 'IA & Automação', items: [
    { key: 'donkie', label: 'Donkie', featureFlag: 'donkie' },
    { key: 'ai',     label: 'IA', featureFlag: 'ai' },
  ]},
  { label: 'Integrações', items: [
    { key: 'freshdesk', label: 'Freshdesk', featureFlag: 'freshdesk' },
    { key: 'donc-api',  label: 'API DONC',   managerOnly: true },
  ]},
  { label: 'Comunicação', items: [
    { key: 'email-templates', label: 'Templates de E-mail', managerOnly: true },
  ]},
  { label: 'Governança', items: [
    { key: 'logs', label: 'Auditoria', featureFlag: 'logs' },
    { key: 'features', label: 'Funcionalidades', featureFlag: 'features' },
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
      if (item.featureFlag && !isEnabled(item.featureFlag, profile?.role)) return false
      if (item.adminOnly && !isAdmin) return false
      if (item.managerOnly && !isManager) return false
      return true
    })
  })).filter(group => group.items.length > 0)

  const renderSection = (key) => {
    switch (key) {
      case 'health':    return isEnabled('health', profile?.role) && <SettingsHealth />
      case 'catalog':  return isEnabled('catalog', profile?.role) && <SettingsCatalog />
      case 'segments': return isEnabled('segments', profile?.role) && <SettingsSegments />
      case 'stages':   return isEnabled('stages', profile?.role) && <SettingsStages />
      case 'users':    return isEnabled('users', profile?.role) && <SettingsUsers />
      case 'logs':     return isEnabled('logs', profile?.role) && <SettingsLogs />
      case 'freshdesk': return isEnabled('freshdesk', profile?.role) && <SettingsFreshdesk />
      case 'donkie':   return isEnabled('donkie', profile?.role) && <SettingsDonkie />
      case 'ai':       return isEnabled('ai', profile?.role) && <SettingsAI />
      case 'donc-api': return isManager && <SettingsDoncAPI />
      case 'features': return isEnabled('features', profile?.role) && <SettingsFeatureFlags />
      case 'fase-types': return isEnabled('fase_types', profile?.role) && <SettingsFaseTypes />
      case 'activity-types': return isEnabled('activity_types', profile?.role) && <SettingsActivityTypes />
      case 'project-templates': return isEnabled('project_templates', profile?.role) && <SettingsProjectTemplates />
      case 'email-templates': return isManager && <EmailTemplatesManager />
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