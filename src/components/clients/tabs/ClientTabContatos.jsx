import { useState } from 'react'
import { Avatar } from '../../ui/Avatar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ContactModal } from '../../contacts/ContactModal'

export function ClientTabContatos({ client }) {
  const [showCreate, setShowCreate] = useState(false)
  const links = client.contact_links || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-text-tertiary">{links.length} contatos vinculados</span>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ Novo Contato</Button>
      </div>

      <div className="space-y-2">
        {links.map(link => {
          const c = link.contacts
          if (!c) return null
          return (
            <div key={link.id} className="flex items-center gap-3 p-3 border border-border-tertiary rounded-lg bg-bg-primary">
              <Avatar name={c.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-primary">{c.name}</span>
                  {link.champion && <span className="text-yellow-500 text-xs">⭐ Champion</span>}
                </div>
                <p className="text-xs text-text-tertiary">{c.cargo}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={link.papel === 'Decisor' ? 'navy' : link.papel === 'Influenciador' ? 'purple' : 'slate'}>{link.papel}</Badge>
                <Badge variant={link.engajamento === 'Alto' ? 'green' : link.engajamento === 'Médio' ? 'amber' : 'red'}>{link.engajamento}</Badge>
              </div>
            </div>
          )
        })}
        {links.length === 0 && <p className="text-center py-12 text-text-tertiary">Nenhum contato vinculado.</p>}
      </div>

      {showCreate && <ContactModal defaultClientId={client.id} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
