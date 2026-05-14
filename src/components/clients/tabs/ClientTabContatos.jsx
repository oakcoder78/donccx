import { useState, useMemo } from 'react'
import { Icons } from '../../../lib/icons'
import { Avatar } from '../../ui/Avatar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ContactModal } from '../../contacts/ContactModal'
import { ContactPanel } from '../../contacts/ContactPanel'
import { useUnlinkContact } from '../../../hooks/useContacts'
import { formatPhone } from '../../../lib/formatPhone'

// ─── helpers ────────────────────────────────────────────────────────────────────
function getRelevanceScore(cl) {
  const { champion, papel, engajamento } = cl
  if (champion && papel === 'Decisor') return 7
  if (papel === 'Decisor') return 6
  if (champion && papel === 'Influenciador') return 5
  if (papel === 'Influenciador') return 4
  if (champion) return 4
  if (papel === 'Técnico') return 3
  if (papel === 'Usuário') return 2
  const engScore = engajamento === 'Alto' ? 2 : engajamento === 'Médio' ? 1 : 0
  return engScore
}

const STATUS_INFO = {
  ativo: { emoji: '🟢', label: 'Ativo' },
  morno: { emoji: '🟡', label: 'Morno' },
  frio:  { emoji: '🔴', label: 'Frio'  },
  Alto:  { emoji: '🟢', label: 'Ativo' },
  Médio: { emoji: '🟡', label: 'Morno' },
  Baixo: { emoji: '🔴', label: 'Frio'  },
}
const PAPEL_VARIANT = { Decisor: 'navy', Influenciador: 'purple', Técnico: 'sky', Usuário: 'slate' }
const PAPEIS_ORDER  = ['Decisor', 'Influenciador', 'Técnico', 'Usuário']

function getWhatsapp(phones = []) {
  return phones.find(p => p.type === 'WhatsApp')
}

// ─── Rich contact card ──────────────────────────────────────────────────────────
function ContactCard({ link, onEdit, onUnlink, isSelected, onClick }) {
  const c   = link.contacts || {}
  const st  = STATUS_INFO[link.engajamento] || STATUS_INFO.morno
  const wp  = getWhatsapp(c.contact_phones || [])

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'border-donc-navy bg-donc-navy/5 shadow-sm'
          : 'bg-bg-primary border-border-tertiary hover:border-border-secondary'
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 relative">
        <Avatar name={c.name} size="lg" />
        {link.champion && (
          <span className="absolute -top-1 -right-1 text-sm leading-none">⭐</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-text-primary">{c.name || '—'}</span>
          <Badge variant={PAPEL_VARIANT[link.papel] || 'slate'}>{link.papel}</Badge>
          <span className="text-xs">{st.emoji} {st.label}</span>
        </div>

        {c.cargo && <p className="text-xs text-text-tertiary">{c.cargo}</p>}

        <div className="flex items-center gap-3 flex-wrap mt-1">
          {c.email && (
            <a href={`mailto:${c.email}`}
              onClick={e => e.stopPropagation()}
              className="text-xs text-text-secondary hover:text-donc-sky transition-colors truncate max-w-[180px] flex items-center gap-1"
            >
              <Icons.Mail className="w-3 h-3 flex-shrink-0" /> {c.email}
            </a>
          )}
          {wp && (
            <a href={`https://wa.me/${wp.number.replace(/\D/g,'')}`}
              target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-text-secondary hover:text-donc-verde transition-colors flex items-center gap-1"
            >
              <Icons.MessageCircle className="w-3 h-3 flex-shrink-0" /> {formatPhone(wp.number)}
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 min-w-[100px] justify-end self-center" onClick={e => e.stopPropagation()}>
        {wp && (
          <a href={`https://wa.me/${wp.number.replace(/\D/g,'')}`}
            target="_blank" rel="noreferrer"
            className="p-1.5 rounded-md bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
            title="WhatsApp"
          >
            <Icons.MessageCircle className="w-4 h-4" />
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`}
            className="p-1.5 rounded-md hover:bg-bg-secondary text-text-secondary transition-colors"
            title="E-mail"
          >
            <Icons.Mail className="w-4 h-4" />
          </a>
        )}
        <button
          onClick={() => onEdit(link)}
          className="p-1.5 rounded-md hover:bg-bg-secondary text-text-secondary transition-colors"
          title="Editar"
        >
          <Icons.Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onUnlink(link.id)}
          className="p-1.5 rounded-md hover:bg-red-50 text-text-tertiary hover:text-donc-red transition-colors"
          title="Desvincular"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Power Map ──────────────────────────────────────────────────────────────────
function PowerMap({ links }) {
  const hasDecisores = links.some(l => l.papel === 'Decisor')

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">Mapa de Poder</h3>

      {!hasDecisores && (
        <div className="flex items-center gap-2 px-3 py-2 bg-donc-amber/10 border border-donc-amber/30 rounded-md text-sm text-donc-amber">
          ⚠️ Nenhum decisor mapeado
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PAPEIS_ORDER.map(papel => {
          const group = links.filter(l => l.papel === papel)
          return (
            <div key={papel}
              className="bg-bg-primary border border-border-tertiary rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {papel}
                </span>
                <Badge variant={PAPEL_VARIANT[papel] || 'slate'}>{group.length}</Badge>
              </div>

              {group.length === 0 ? (
                <p className="text-xs text-text-tertiary italic">Nenhum</p>
              ) : (
                <div className="space-y-1.5">
                  {group.map(l => {
                    const c  = l.contacts || {}
                    const st = STATUS_INFO[l.engajamento] || STATUS_INFO.morno
                    return (
                      <div key={l.id} className="flex items-center gap-2">
                        <div className="relative flex-shrink-0">
                          <Avatar name={c.name} size="sm" />
                          {l.champion && (
                            <span className="absolute -top-1 -right-1 text-[10px] leading-none">⭐</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-primary truncate">{c.name}</p>
                          <span className="text-[11px] text-text-tertiary">{st.emoji} {st.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function ClientTabContatos({ client }) {
  const [showCreate, setShowCreate]         = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [selectedLink, setSelectedLink]     = useState(null)
  const unlinkContact = useUnlinkContact()

  const links = useMemo(() => {
    return [...(client.contact_links || [])].sort((a, b) => {
      const sa = getRelevanceScore(a)
      const sb = getRelevanceScore(b)
      if (sa !== sb) return sb - sa
      const engA = a.engajamento === 'Alto' ? 2 : a.engajamento === 'Médio' ? 1 : 0
      const engB = b.engajamento === 'Alto' ? 2 : b.engajamento === 'Médio' ? 1 : 0
      return engB - engA
    })
  }, [client.contact_links])

  function buildContactFromLink(link) {
    const c = link.contacts || {}
    return {
      ...c,
      contact_phones: c.contact_phones || [],
      contact_links: [{
        id: link.id,
        client_id: link.client_id,
        papel: link.papel,
        engajamento: link.engajamento,
        champion: link.champion,
        clients: { id: client.id, name: client.fantasy_name || client.name },
      }],
    }
  }

  function handleEdit(link) {
    const c = link.contacts || {}
    setEditingContact({
      ...c,
      contact_phones: c.contact_phones || [],
      contact_links: [{
        id: link.id,
        client_id: link.client_id,
        papel: link.papel,
        engajamento: link.engajamento,
        champion: link.champion,
      }],
    })
    setSelectedLink(null)
  }

  function handleUnlink(linkId) {
    if (!window.confirm('Desvincular este contato da empresa?')) return
    unlinkContact.mutate(linkId)
    if (selectedLink?.id === linkId) setSelectedLink(null)
  }

  function handleCardClick(link) {
    setSelectedLink(prev => prev?.id === link.id ? null : link)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-tertiary">{links.length} contato{links.length !== 1 ? 's' : ''} vinculado{links.length !== 1 ? 's' : ''}</span>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ Novo Contato</Button>
      </div>

      {/* Cards + Side Panel */}
      <div className="flex gap-4 items-start">
        <div className={`space-y-2 ${selectedLink ? 'flex-1' : 'w-full'}`}>
          {links.map(link => (
            <ContactCard
              key={link.id}
              link={link}
              onEdit={handleEdit}
              onUnlink={handleUnlink}
              isSelected={selectedLink?.id === link.id}
              onClick={() => handleCardClick(link)}
            />
          ))}
          {links.length === 0 && (
            <p className="text-center py-12 text-text-tertiary text-sm">Nenhum contato vinculado.</p>
          )}
        </div>

        {selectedLink && (
          <div className="w-96 flex-shrink-0">
            <ContactPanel
              contact={buildContactFromLink(selectedLink)}
              onEdit={() => handleEdit(selectedLink)}
              onClose={() => setSelectedLink(null)}
            />
          </div>
        )}
      </div>

      {/* Power Map */}
      {links.length > 0 && <PowerMap links={links} />}

      {showCreate && (
        <ContactModal defaultClientId={client.id} onClose={() => setShowCreate(false)} />
      )}
      {editingContact && (
        <ContactModal contact={editingContact} onClose={() => setEditingContact(null)} />
      )}
    </div>
  )
}
