import { useState } from 'react'
import { SettingsHealth } from './SettingsHealth'
import { SettingsCatalog } from './SettingsCatalog'
import { SettingsStages } from './SettingsStages'
import { SettingsUsers } from './SettingsUsers'

const MENU = [
  { key: 'health', icon: '❤️', label: 'Health Score' },
  { key: 'catalog', icon: '📦', label: 'Catálogos' },
  { key: 'stages', icon: '🔄', label: 'Estágios' },
  { key: 'users', icon: '👥', label: 'Usuários' },
]

export default function SettingsPage() {
  const [section, setSection] = useState('health')

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="w-52 bg-bg-primary border-r border-border-tertiary p-3 flex-shrink-0">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2">Configurações</p>
        <nav className="space-y-0.5">
          {MENU.map(item => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                section === item.key
                  ? 'bg-donc-navy text-white'
                  : 'text-text-secondary hover:bg-bg-secondary'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6">
        {section === 'health' && <SettingsHealth />}
        {section === 'catalog' && <SettingsCatalog />}
        {section === 'stages' && <SettingsStages />}
        {section === 'users' && <SettingsUsers />}
      </main>
    </div>
  )
}
