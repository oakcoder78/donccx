import { useState, lazy, Suspense } from 'react'
import { SettingsHealth } from './SettingsHealth'
import { SettingsCatalog } from './SettingsCatalog'
import { SettingsSegments } from './SettingsSegments'
import { SettingsStages } from './SettingsStages'
import { SettingsUsers } from './SettingsUsers'
import { SettingsLogs } from './SettingsLogs'
import { SettingsFreshdesk } from './SettingsFreshdesk'
import { SettingsAsana } from './SettingsAsana'
import { SettingsAI } from './SettingsAI'
import { SettingsDoncAPI } from './SettingsDoncAPI'
import { SettingsSyncStatus } from './SettingsSyncStatus'

import { SettingsFeatureFlags } from './SettingsFeatureFlags'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { Icons } from '@/lib/icons'

const SETTINGS_MENU_ICONS = {
  'minha-conta': Icons.User,
  health: Icons.Heart,
  catalog: Icons.Package,
  segments: Icons.Tag,
  stages: Icons.RefreshCw,
  users: Icons.Users,
  logs: Icons.ClipboardList,
  freshdesk: Icons.Headphones,
  asana: Icons.FolderKanban,
  donkie: Icons.Bot,
  'donc-api': Icons.Plug,
  features: Icons.Flag,
  'fase-types': Icons.FolderKanban,
  'activity-types': Icons.Activity,
  'email-templates': Icons.Mail,
  'email-blast': Icons.Send,
  'brief-templates': Icons.FileQuestion,
  'sync-status': Icons.Clock,
  default: Icons.Settings,
}

import { SettingsFaseTypes } from './SettingsFaseTypes'
import { SettingsActivityTypes } from './SettingsActivityTypes'
import { SettingsProjectTemplates } from './SettingsProjectTemplates'
import SettingsBriefTemplates from '@/pages/SettingsBriefTemplates'
import { EmailTemplatesManager } from '../email/EmailTemplatesManager'
import { SettingsEmailBlast } from './SettingsEmailBlast'

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
    { key: 'brief-templates', label: 'Templates de Brief', featureFlag: 'brief_templates', href: '/config/brief-templates' },
  ]},
  { label: 'Health Score', items: [
    { key: 'health', label: 'Health Score', featureFlag: 'health' },
  ]},
  { label: 'IA & Automação', items: [
    { key: 'donkie', label: 'Donkie IA', featureFlag: 'ai' },
  ]},
  { label: 'Integrações', items: [
    { key: 'freshdesk', label: 'Freshdesk', featureFlag: 'freshdesk' },
    { key: 'asana',     label: 'Asana',     featureFlag: 'asana' },
    { key: 'donc-api',  label: 'API DONC',   featureFlag: 'api_donc' },
    { key: 'sync-status', label: 'Status da Sincronização', adminOnly: true },
  ]},
  { label: 'Comunicação', items: [
    { key: 'email-templates', label: 'Templates de E-mail', featureFlag: 'email_templates' },
    { key: 'email-blast',     label: 'Envio em Massa',      featureFlag: 'email_templates' },
  ]},
  { label: 'Governança', items: [
    { key: 'logs', label: 'Auditoria', featureFlag: 'logs' },
    { key: 'features', label: 'Funcionalidades', featureFlag: 'features' },
  ]},
]

export default function SettingsPage() {
  const { effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const [section, setSection] = useState(() => localStorage.getItem('settings_section') || 'users')

  const handleSetSection = (key) => {
    localStorage.setItem('settings_section', key)
    setSection(key)
  }

  // Gates below use effectiveRole (not the real profile.role) so that an admin
  // previewing another role via "Ver como" sees exactly what that role would see.
  const MENU = MENU_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.featureFlag && !isEnabled(item.featureFlag, effectiveRole)) return false
      if (item.adminOnly && effectiveRole !== 'admin') return false
      if (item.managerOnly && effectiveRole !== 'manager') return false
      return true
    })
  })).filter(group => group.items.length > 0)

  const renderSection = (key) => {
    switch (key) {
      case 'health':    return isEnabled('health', effectiveRole) && <SettingsHealth />
      case 'catalog':  return isEnabled('catalog', effectiveRole) && <SettingsCatalog />
      case 'segments': return isEnabled('segments', effectiveRole) && <SettingsSegments />
      case 'stages':   return isEnabled('stages', effectiveRole) && <SettingsStages />
      case 'users':    return isEnabled('users', effectiveRole) && <SettingsUsers />
      case 'logs':     return isEnabled('logs', effectiveRole) && <SettingsLogs />
      case 'freshdesk': return isEnabled('freshdesk', effectiveRole) && <SettingsFreshdesk />
      case 'asana':     return isEnabled('asana', effectiveRole) && <SettingsAsana />
      case 'donkie':   return isEnabled('ai', effectiveRole) && <SettingsAI />
      case 'donc-api': return isEnabled('api_donc', effectiveRole) && <SettingsDoncAPI />
      case 'sync-status': return effectiveRole === 'admin' && <SettingsSyncStatus />
      case 'features': return isEnabled('features', effectiveRole) && <SettingsFeatureFlags />
      case 'fase-types': return isEnabled('fase_types', effectiveRole) && <SettingsFaseTypes />
      case 'activity-types': return isEnabled('activity_types', effectiveRole) && <SettingsActivityTypes />
      case 'project-templates': return isEnabled('project_templates', effectiveRole) && <SettingsProjectTemplates />
      case 'brief-templates': return isEnabled('brief_templates', effectiveRole) && <SettingsBriefTemplates />
      case 'email-templates': return isEnabled('email_templates', effectiveRole) && <EmailTemplatesManager />
      case 'email-blast': return isEnabled('email_templates', effectiveRole) && <SettingsEmailBlast />
      default: return null
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="w-64 bg-bg-primary border-r border-border-tertiary p-3 flex-shrink-0">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-3">Configurações</p>
        <nav className="space-y-4">
          {MENU.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const MenuIcon = SETTINGS_MENU_ICONS[item.key] || Icons.Settings
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