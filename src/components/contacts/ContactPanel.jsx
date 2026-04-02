import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export function ContactPanel({ contact: c, onEdit, onClose, onClientClick }) {
  const phones = c.contact_phones || []
  const links = c.contact_links || []

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 sticky top-20">
      {/* Close */}
      <div className="flex justify-end mb-2">
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-sm">✕</button>
      </div>

      {/* Avatar + name */}
      <div className="text-center mb-4">
        <Avatar name={c.name} size="xl" className="mx-auto mb-2" />
        <h3 className="text-base font-semibold text-text-primary">{c.name}</h3>
        {c.cargo && <p className="text-sm text-text-tertiary">{c.cargo}</p>}

        {/* Papéis */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
          {links.map(l => (
            <Badge key={l.id} variant={l.papel === 'Decisor' ? 'navy' : l.papel === 'Influenciador' ? 'purple' : 'slate'}>
              {l.papel}
            </Badge>
          ))}
          {links.some(l => l.champion) && <span className="text-yellow-500 text-sm">⭐ Champion</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-4">
        {c.email && (
          <a href={`mailto:${c.email}`} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-border-secondary rounded-md hover:bg-bg-secondary transition-colors text-text-secondary">
            📧 E-mail
          </a>
        )}
        {phones.some(p => p.type === 'WhatsApp') && (
          <a href={`https://wa.me/${phones.find(p => p.type === 'WhatsApp')?.number?.replace(/\D/g,'')}`}
            target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-border-secondary rounded-md hover:bg-bg-secondary transition-colors text-text-secondary">
            💬 WhatsApp
          </a>
        )}
      </div>

      {/* Contact info */}
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs font-medium text-text-tertiary uppercase mb-2">Contato</p>
          {c.email && (
            <div className="flex items-center gap-2 text-sm text-text-primary mb-1">
              <span className="text-text-tertiary">📧</span> {c.email}
            </div>
          )}
          {phones.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-text-primary mb-1">
              <span className="text-text-tertiary">{p.type === 'WhatsApp' ? '💬' : '📞'}</span>
              {p.number} <span className="text-xs text-text-tertiary">{p.type}</span>
            </div>
          ))}
          {c.linkedin && (
            <a href={c.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-donc-sky hover:underline">
              <span>🔗</span> LinkedIn
            </a>
          )}
        </div>

        {/* Vínculos */}
        {links.length > 0 && (
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase mb-2">Vínculos</p>
            <div className="space-y-2">
              {links.map(l => (
                <div key={l.id}
                  onClick={() => onClientClick?.(l.client_id)}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{l.clients?.name}</p>
                    <div className="flex gap-1 mt-0.5">
                      <Badge variant="slate">{l.papel}</Badge>
                      <Badge variant={l.engajamento === 'Alto' ? 'green' : l.engajamento === 'Médio' ? 'amber' : 'red'}>
                        {l.engajamento}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {c.notes && (
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase mb-1">Notas</p>
            <p className="text-sm text-text-secondary">{c.notes}</p>
          </div>
        )}
      </div>

      <Button variant="secondary" size="sm" className="w-full justify-center" onClick={onEdit}>
        Editar Contato
      </Button>
    </div>
  )
}
