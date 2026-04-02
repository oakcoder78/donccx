import { useState } from 'react'
import { useContacts } from '../../hooks/useContacts'
import { useClients } from '../../hooks/useClients'
import { PageHeader } from '../ui/PageHeader'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { PageSpinner } from '../ui/Spinner'
import { ContactModal } from './ContactModal'
import { ContactPanel } from './ContactPanel'

const CHIPS = [
  { key: 'Decisor', label: 'Decisor', type: 'papel' },
  { key: 'Influenciador', label: 'Influenciador', type: 'papel' },
  { key: 'Usuário', label: 'Usuário', type: 'papel' },
  { key: 'Alto', label: 'Eng. Alto', type: 'engajamento' },
  { key: 'Médio', label: 'Eng. Médio', type: 'engajamento' },
  { key: 'Baixo', label: 'Eng. Baixo', type: 'engajamento' },
  { key: 'champion', label: '⭐ Champions', type: 'champion' },
]

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [activeChips, setActiveChips] = useState([])
  const [clientChip, setClientChip] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editContact, setEditContact] = useState(null)

  const filters = {
    search,
    papel: activeChips.find(c => ['Decisor','Influenciador','Usuário'].includes(c)),
    engajamento: activeChips.find(c => ['Alto','Médio','Baixo'].includes(c)),
    champion: activeChips.includes('champion') || undefined,
    client_id: clientChip,
  }
  const { data: contacts = [], isLoading } = useContacts(filters)
  const { data: clients = [] } = useClients()

  function toggleChip(key) {
    setActiveChips(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Contatos"
        subtitle={`${contacts.length} contatos`}
        action={<Button onClick={() => setShowCreate(true)}>+ Novo Contato</Button>}
      />

      <div className="flex gap-6">
        {/* Left panel */}
        <div className="flex-1 min-w-0">
          {/* Search */}
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contatos..."
              className="w-full pl-9 pr-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
            />
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {CHIPS.map(chip => (
              <button
                key={chip.key}
                onClick={() => toggleChip(chip.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  activeChips.includes(chip.key)
                    ? 'bg-donc-navy text-white border-donc-navy'
                    : 'bg-bg-primary text-text-secondary border-border-secondary hover:border-donc-navy/40'
                }`}
              >
                {chip.label}
              </button>
            ))}
            {clientChip ? (
              <button
                onClick={() => setClientChip(null)}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-donc-sky/20 text-donc-blue border border-donc-sky/40 flex items-center gap-1"
              >
                {clients.find(c => c.id === clientChip)?.name}
                <span className="text-xs">✕</span>
              </button>
            ) : null}
          </div>

          {/* Contact list */}
          {isLoading ? <PageSpinner /> : (
            <div className="space-y-2">
              {contacts.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected?.id === c.id
                      ? 'border-donc-sky bg-donc-sky/5'
                      : 'border-border-tertiary bg-bg-primary hover:border-border-secondary'
                  }`}
                >
                  <Avatar name={c.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                    <p className="text-xs text-text-tertiary truncate">{c.cargo}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {c.contact_links?.slice(0,1).map(l => (
                      <Badge key={l.id} variant={l.papel === 'Decisor' ? 'navy' : l.papel === 'Influenciador' ? 'purple' : 'slate'}>
                        {l.papel}
                      </Badge>
                    ))}
                    {c.contact_links?.some(l => l.champion) && <span className="text-yellow-500 text-xs">⭐</span>}
                  </div>
                </div>
              ))}
              {contacts.length === 0 && (
                <p className="text-center py-16 text-text-tertiary">Nenhum contato encontrado.</p>
              )}
            </div>
          )}
        </div>

        {/* Right panel - sticky */}
        {selected && (
          <div className="w-80 flex-shrink-0">
            <ContactPanel
              contact={selected}
              onEdit={() => setEditContact(selected)}
              onClose={() => setSelected(null)}
              onClientClick={setClientChip}
            />
          </div>
        )}
      </div>

      {showCreate && <ContactModal onClose={() => setShowCreate(false)} />}
      {editContact && <ContactModal contact={editContact} onClose={() => setEditContact(null)} />}
    </div>
  )
}
