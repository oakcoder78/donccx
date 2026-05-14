import { useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { formatPhone } from '../../lib/formatPhone'
import { Icons } from '../../lib/icons'
import { EmailComposerModal } from '../email/EmailComposerModal'

const STATUS_INFO = {
  ativo: { emoji: '🟢', label: 'Ativo' },
  morno: { emoji: '🟡', label: 'Morno' },
  frio:  { emoji: '🔴', label: 'Frio'  },
  // backwards compat
  Alto:  { emoji: '🟢', label: 'Ativo' },
  Médio: { emoji: '🟡', label: 'Morno' },
  Baixo: { emoji: '🔴', label: 'Frio'  },
}

const PAPEL_VARIANT = { Decisor: 'navy', Influenciador: 'purple', Técnico: 'sky', Usuário: 'slate' }

export function ContactPanel({ contact: c, onEdit, onClose, onClientClick }) {
  const [showEmailCompose, setShowEmailCompose] = useState(false)

  const phones = c.contact_phones || []
  const links  = c.contact_links  || []
  const whatsapp = phones.find(p => p.type === 'WhatsApp')
  const primaryEmail = c.contact_emails?.find(e => e.is_primary)?.email ?? c.email

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 sticky top-20 w-96 max-w-[90vw]">
      <div className="flex justify-end mb-2">
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary"><Icons.X className="w-4 h-4" /></button>
      </div>

      {/* Avatar + name */}
      <div className="text-center mb-4">
        <Avatar name={c.name} size="xl" className="mx-auto mb-2" />
        <h3 className="text-base font-semibold text-text-primary">{c.name}</h3>
        {c.cargo && <p className="text-sm text-text-tertiary">{c.cargo}</p>}
        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
          {links.map(l => (
            <Badge key={l.id} variant={PAPEL_VARIANT[l.papel] || 'slate'}>{l.papel}</Badge>
          ))}
          {links.some(l => l.champion) && <span className="text-yellow-500 text-sm">⭐ Champion</span>}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        {primaryEmail && (
          <button
            onClick={() => setShowEmailCompose(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-border-secondary rounded-md hover:bg-bg-secondary transition-colors text-text-secondary">
            <Icons.Mail className="w-3.5 h-3.5" /> E-mail
          </button>
        )}
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp.number.replace(/\D/g,'')}`}
            target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-border-secondary rounded-md hover:bg-bg-secondary transition-colors text-text-secondary">
            <Icons.MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
        )}
      </div>

      {/* Contact info */}
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs font-medium text-text-tertiary uppercase mb-2">Contato</p>
          {/* Multiple emails via contact_emails, fall back to contacts.email */}
          {(c.contact_emails?.length > 0 ? c.contact_emails : c.email ? [{ email: c.email, is_primary: true }] : []).map((em, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-text-primary mb-1">
              <Icons.Mail className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
              <a href={`mailto:${em.email}`} className="hover:underline truncate max-w-[240px]" title={em.email}>{em.email}</a>
              {em.is_primary && <span className="text-[10px] text-text-tertiary bg-bg-secondary px-1 rounded">principal</span>}
            </div>
          ))}
          {phones.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-text-primary mb-1">
              {p.type === 'WhatsApp'
                ? <Icons.MessageCircle className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                : <Icons.Phone className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />}
              {formatPhone(p.number)} <span className="text-xs text-text-tertiary">{p.type}</span>
            </div>
          ))}
          {c.linkedin && (
            <a href={c.linkedin} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-donc-sky hover:underline">
              <Icons.Link className="w-3.5 h-3.5" /> LinkedIn
            </a>
          )}
        </div>

        {/* Vínculos */}
        {links.length > 0 && (
          <div>
            <p className="text-xs font-medium text-text-tertiary uppercase mb-2">Vínculos</p>
            <div className="space-y-2">
              {links.map(l => {
                const st = STATUS_INFO[l.engajamento] || STATUS_INFO.morno
                return (
                  <div key={l.id}
                    onClick={() => onClientClick?.(l.client_id)}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{l.clients?.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant={PAPEL_VARIANT[l.papel] || 'slate'}>{l.papel}</Badge>
                        <span className="text-xs">{st.emoji} {st.label}</span>
                        {l.champion && <span className="text-yellow-500 text-xs">⭐</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
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

      <EmailComposerModal
        isOpen={showEmailCompose}
        onClose={() => setShowEmailCompose(false)}
        mode="individual"
        preselectedClientId={links[0]?.client_id}
        preselectedContactId={c.id}
      />
    </div>
  )
}
