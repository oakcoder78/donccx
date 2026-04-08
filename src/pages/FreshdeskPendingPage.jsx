import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

// ── Helpers de texto ──────────────────────────────────────────────────────────
function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

// ── ABORDAGEM 1: Sistema de scoring com regex ─────────────────────────────────

/** Retorna array de tokens significativos (> 2 chars, sem acentos, lowercase) */
function normalizeName(name) {
  if (!name) return []
  return name.toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t.length > 2)
}

/** Separa parte local e domínio de um e-mail */
function extractEmailParts(email) {
  if (!email) return { local: '', domain: '' }
  const match = email.match(/^([^@]+)@(.+)$/)
  return match
    ? { local: match[1].toLowerCase(), domain: match[2].toLowerCase() }
    : { local: '', domain: '' }
}

/** Levenshtein entre duas strings */
function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1])
  return dp[m][n]
}

/** Score de similaridade 0–100 entre dois contatos */
function contactSimilarityScore(a, b) {
  let score = 0
  const ta = normalizeName(a.name)
  const tb = normalizeName(b.name)
  const ea = extractEmailParts(a.email)
  const eb = extractEmailParts(b.email)

  // Mesmo domínio de e-mail: +40
  if (ea.domain && eb.domain && ea.domain === eb.domain) score += 40

  // Primeiro token do nome igual: +30
  if (ta.length > 0 && tb.length > 0 && ta[0] === tb[0]) score += 30

  // Levenshtein entre nomes completos normalizados <= 3: +20
  const na = ta.join(' '), nb = tb.join(' ')
  if (na && nb && editDistance(na, nb) <= 3) score += 20

  // Mesmo último token: +20
  if (ta.length > 0 && tb.length > 0 && ta[ta.length - 1] === tb[tb.length - 1]) score += 20

  // Parte local do e-mail contém token do nome com >= 4 chars: +15
  const sigA = ta.filter(t => t.length >= 4)
  const sigB = tb.filter(t => t.length >= 4)
  const emailHit =
    sigA.some(t => new RegExp(t, 'i').test(eb.local)) ||
    sigB.some(t => new RegExp(t, 'i').test(ea.local))
  if (emailHit) score += 15

  return Math.min(score, 100)
}

/**
 * Agrupa contatos por similaridade.
 * Retorna { singles, groups: [{ key, contacts, score, level }] }
 * level: 'probable' (score >= 70) | 'possible' (score 40–69)
 */
function groupContacts(contacts) {
  if (!contacts?.length) return { singles: [], groups: [] }
  const used = new Set()
  const singles = []
  const groups  = []

  for (let i = 0; i < contacts.length; i++) {
    if (used.has(i)) continue
    let bestScore = 0, bestJ = -1
    for (let j = i + 1; j < contacts.length; j++) {
      if (used.has(j)) continue
      const s = contactSimilarityScore(contacts[i], contacts[j])
      if (s >= 40 && s > bestScore) { bestScore = s; bestJ = j }
    }
    used.add(i)
    if (bestJ !== -1) {
      used.add(bestJ)
      groups.push({
        key:      `g${i}`,
        contacts: [contacts[i], contacts[bestJ]],
        score:    bestScore,
        level:    bestScore >= 70 ? 'probable' : 'possible',
      })
    } else {
      singles.push(contacts[i])
    }
  }
  return { singles, groups }
}

// ── Helpers de mescla ─────────────────────────────────────────────────────────

/** Escolhe o contato primário (mais tickets; empate → nome mais longo) */
function pickPrimary(c1, c2) {
  if (c1.ticket_count !== c2.ticket_count) return c1.ticket_count > c2.ticket_count ? c1 : c2
  return c1.name.length >= c2.name.length ? c1 : c2
}

/** Resolve os contatos a importar com base nas decisões automáticas */
function buildResolvedContacts(singles, groups, resolutions) {
  const result = [...singles]
  for (const g of groups) {
    const res = resolutions[g.key]
    if (!res || res.action === 'discard') continue
    if (res.action === 'pick_first')  result.push(g.contacts[0])
    if (res.action === 'pick_second') result.push(g.contacts[1] ?? g.contacts[0])
    if (res.action === 'keep_both')   result.push(...g.contacts)
    if (res.action === 'merge_contacts') {
      const primary   = pickPrimary(g.contacts[0], g.contacts[1] ?? g.contacts[0])
      const secondary = g.contacts.find(c => c !== primary) ?? null
      result.push({
        ...primary,
        secondary_emails: secondary?.email ? [{ email: secondary.email, type: 'work' }] : [],
      })
    }
  }
  return result
}

// ── Campos de comparação ──────────────────────────────────────────────────────
const FIELDS = [
  { key: 'tickets_opened',     label: 'Tickets abertos'    },
  { key: 'tickets_resolved',   label: 'Tickets resolvidos'  },
  { key: 'sla_first_response', label: '1ª resposta (min)'   },
  { key: 'n1_pct',             label: 'N1 (qtd)'            },
  { key: 'n2_pct',             label: 'N2 (qtd)'            },
  { key: 'n3_pct',             label: 'N3 (qtd)'            },
]

function CompareRow({ label, current, proposed }) {
  const changed = current !== proposed && proposed != null
  return (
    <tr className="border-t border-border-tertiary">
      <td className="px-3 py-2 text-xs text-text-tertiary">{label}</td>
      <td className="px-3 py-2 text-sm text-right text-text-secondary">{current ?? '—'}</td>
      <td className={`px-3 py-2 text-sm text-right font-medium ${changed ? 'text-donc-sky' : 'text-text-secondary'}`}>
        {proposed ?? '—'}
      </td>
    </tr>
  )
}

function PapelBadge({ papel }) {
  const cls =
    papel === 'Técnico'       ? 'bg-blue-100 text-blue-700' :
    papel === 'Influenciador' ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{papel}</span>
}

// ── ABORDAGEM 2: Modal de mescla manual ───────────────────────────────────────
function MergeModal({ contacts, onConfirm, onClose }) {
  const [primary, setPrimary] = useState(null)
  const c1 = contacts[0], c2 = contacts[1]
  const secondary = primary ? contacts.find(c => c !== primary) : null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-bg-primary border border-border-secondary rounded-xl p-5 w-full max-w-md shadow-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Mesclar contatos</h3>
        <p className="text-xs text-text-tertiary mb-4">Qual contato manter como principal?</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {[c1, c2].map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrimary(c)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                primary === c
                  ? 'border-donc-sky bg-donc-sky/5'
                  : 'border-border-tertiary hover:border-border-secondary bg-bg-secondary'
              }`}
            >
              <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
              <p className="text-xs text-text-secondary mt-0.5 truncate">{c.email}</p>
              <p className="text-xs text-text-tertiary mt-1">{c.ticket_count} tickets</p>
            </button>
          ))}
        </div>

        {primary ? (
          <p className="text-xs text-text-secondary mb-4 bg-bg-secondary rounded p-2">
            Manter <strong>{primary.name}</strong> com o e-mail de <strong>{secondary?.name}</strong> como secundário
          </p>
        ) : (
          <p className="text-xs text-text-tertiary mb-4">Selecione o contato principal acima</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-border-tertiary rounded hover:bg-bg-secondary text-text-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => primary && onConfirm(primary, secondary)}
            disabled={!primary}
            className="text-xs px-3 py-1.5 bg-donc-navy text-white rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmar mescla
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de contato único (com checkbox) ──────────────────────────────────────
function SingleContactRow({ c, checked, onToggle }) {
  return (
    <tr className="border-t border-border-tertiary">
      <td className="pl-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(c)}
          className="accent-donc-sky cursor-pointer"
          title="Selecionar para mescla manual"
        />
      </td>
      <td className="px-3 py-2 text-text-primary">{c.name}</td>
      <td className="px-3 py-2 text-text-secondary text-xs">{c.email}</td>
      <td className="px-3 py-2 text-right text-text-secondary">{c.ticket_count}</td>
      <td className="px-3 py-2"><PapelBadge papel={c.suggested_papel} /></td>
    </tr>
  )
}

// ── Card de grupo de duplicatas (com score + checkboxes) ──────────────────────
function DuplicateGroupCard({ group, resolution, onResolve, checkedEmails, onToggle }) {
  const c1 = group.contacts[0]
  const c2 = group.contacts[1]
  const resolved     = !!resolution
  const mergedPrimary = resolution?.action === 'merge_contacts' ? pickPrimary(c1, c2) : null

  const isProbable = group.level === 'probable'

  const scoreBadgeCls = isProbable
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-800'

  const borderCls = resolved
    ? 'border-border-tertiary bg-bg-primary'
    : isProbable
      ? 'border-red-400 bg-red-50/30'
      : 'border-amber-400 bg-amber-50/40'

  const btnCls = (active) =>
    `text-xs px-2.5 py-1 rounded border transition-colors ${
      active
        ? 'bg-donc-navy text-white border-donc-navy'
        : 'border-border-tertiary text-text-secondary hover:bg-bg-tertiary'
    }`

  function cardHighlight(c, idx) {
    if (!resolution) return 'border-border-tertiary bg-bg-secondary'
    if (resolution.action === 'pick_first'     && idx === 0) return 'border-donc-verde bg-donc-verde/5'
    if (resolution.action === 'pick_second'    && idx === 1) return 'border-donc-verde bg-donc-verde/5'
    if (resolution.action === 'keep_both')                   return 'border-donc-verde bg-donc-verde/5'
    if (resolution.action === 'merge_contacts')
      return c === mergedPrimary ? 'border-donc-sky bg-donc-sky/5' : 'border-border-tertiary bg-bg-secondary opacity-60'
    return 'border-border-tertiary bg-bg-secondary'
  }

  return (
    <div className={`rounded-lg border-2 p-3 mb-2 ${borderCls}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${scoreBadgeCls}`}>
          {isProbable ? 'Duplicata provável' : 'Possível duplicata'}
        </span>
        <span className="text-xs font-mono text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-tertiary">
          score {group.score}
        </span>
        {!resolved && (
          <span className="text-xs text-amber-700">Resolução necessária antes de aprovar</span>
        )}
        {resolved && resolution.action === 'merge_contacts' && (
          <span className="text-xs text-donc-sky">✓ Mesclar — manter {mergedPrimary?.name} com ambos os emails</span>
        )}
        {resolved && resolution.action !== 'discard' && resolution.action !== 'merge_contacts' && (
          <span className="text-xs text-donc-verde">✓ Resolvido</span>
        )}
        {resolved && resolution.action === 'discard' && (
          <span className="text-xs text-text-tertiary">✓ Descartado</span>
        )}
      </div>

      {/* Lado a lado */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        {[c1, c2].map((c, idx) => (
          <div key={idx} className={`rounded p-2.5 border text-sm ${cardHighlight(c, idx)}`}>
            <div className="flex items-start gap-1.5">
              <input
                type="checkbox"
                checked={checkedEmails.has(c.email)}
                onChange={() => onToggle(c)}
                className="accent-donc-sky cursor-pointer mt-0.5 flex-shrink-0"
                title="Selecionar para mescla manual"
              />
              <div className="min-w-0">
                <p className="font-medium text-text-primary truncate">{c.name}</p>
                <p className="text-xs text-text-secondary mt-0.5 truncate">{c.email}</p>
                {c.phone && <p className="text-xs text-text-tertiary mt-0.5">{c.phone}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-text-tertiary">{c.ticket_count} tickets</span>
                  <PapelBadge papel={c.suggested_papel} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ações de resolução automática */}
      <div className="flex flex-wrap gap-1.5">
        <button className={btnCls(resolution?.action === 'pick_first')}
          onClick={() => onResolve(group.key, { action: 'pick_first' })}>
          Usar {c1.name.split(' ')[0]}
        </button>
        <button className={btnCls(resolution?.action === 'pick_second')}
          onClick={() => onResolve(group.key, { action: 'pick_second' })}>
          Usar {c2.name.split(' ')[0]}
        </button>
        <button className={btnCls(resolution?.action === 'keep_both')}
          onClick={() => onResolve(group.key, { action: 'keep_both' })}>
          Manter ambos
        </button>
        <button className={btnCls(resolution?.action === 'merge_contacts')}
          onClick={() => onResolve(group.key, { action: 'merge_contacts' })}>
          Mesclar em um contato
        </button>
        <button className={btnCls(resolution?.action === 'discard')}
          onClick={() => onResolve(group.key, { action: 'discard' })}>
          Descartar ambos
        </button>
      </div>
    </div>
  )
}

// ── Seção de contatos novos ───────────────────────────────────────────────────
function NewContactsSection({ effectiveContacts, dupResolutions, onResolve, checkedEmails, onToggle, onOpenMergeModal }) {
  const { singles, groups } = groupContacts(effectiveContacts)
  const hasContent = singles.length > 0 || groups.length > 0

  if (!hasContent) return null

  const checkedCount = checkedEmails.size
  const selectedContacts = effectiveContacts.filter(c => checkedEmails.has(c.email))

  return (
    <div className="mt-3 border-t border-border-tertiary pt-3">
      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
        Contatos novos encontrados
        {groups.length > 0 && (
          <span className="ml-2 normal-case font-normal text-amber-600">
            — {groups.length} grupo{groups.length !== 1 ? 's' : ''} detectado{groups.length !== 1 ? 's' : ''}
          </span>
        )}
      </p>

      {/* Grupos de duplicatas (scoring automático) */}
      {groups.map(g => (
        <DuplicateGroupCard
          key={g.key}
          group={g}
          resolution={dupResolutions[g.key] ?? null}
          onResolve={onResolve}
          checkedEmails={checkedEmails}
          onToggle={onToggle}
        />
      ))}

      {/* Contatos únicos */}
      {singles.length > 0 && (
        <table className="w-full text-sm mt-1">
          <thead>
            <tr className="bg-bg-secondary">
              <th className="pl-3 py-1.5 w-8" />
              <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">Nome</th>
              <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">E-mail</th>
              <th className="text-right px-3 py-1.5 text-xs font-medium text-text-tertiary">Tickets</th>
              <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">Papel sugerido</th>
            </tr>
          </thead>
          <tbody>
            {singles.map((c, i) => (
              <SingleContactRow
                key={i}
                c={c}
                checked={checkedEmails.has(c.email)}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* Barra flutuante — ABORDAGEM 2: mescla manual por checkbox */}
      {checkedCount >= 2 && (
        <div className="mt-3 p-2.5 bg-donc-navy text-white rounded-lg flex items-center justify-between gap-3 sticky bottom-2 shadow-lg">
          <span className="text-xs">
            {checkedCount} contatos selecionados
          </span>
          <div className="flex gap-2">
            {checkedCount === 2 ? (
              <button
                type="button"
                onClick={() => onOpenMergeModal(selectedContacts)}
                className="text-xs px-3 py-1 bg-white text-donc-navy rounded font-medium hover:bg-gray-100 transition-colors"
              >
                Mesclar selecionados
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toast.error('Selecione exatamente 2 contatos para mesclar', { icon: '⚠️' })}
                className="text-xs px-3 py-1 bg-white/20 text-white rounded"
              >
                Mesclar selecionados
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Card de empresa / mês ─────────────────────────────────────────────────────
function PendingCard({ record, onAction }) {
  const snap = record.freshdesk_snapshot ?? {}

  const [busy, setBusy]                   = useState(false)
  const [dupResolutions, setDupResolutions] = useState({})
  // effectiveContacts: lista de contatos após mesclas manuais
  const [effectiveContacts, setEffectiveContacts] = useState(() => snap.new_contacts ?? [])
  const [checkedEmails, setCheckedEmails] = useState(new Set())
  const [mergeModal, setMergeModal]       = useState(null) // [c1, c2] or null

  const { groups } = groupContacts(effectiveContacts)
  const unresolvedCount = groups.filter(g => !dupResolutions[g.key]).length

  function handleResolve(key, resolution) {
    setDupResolutions(p => ({ ...p, [key]: resolution }))
  }

  function handleToggleCheck(contact) {
    setCheckedEmails(prev => {
      const next = new Set(prev)
      next.has(contact.email) ? next.delete(contact.email) : next.add(contact.email)
      return next
    })
  }

  function handleOpenMergeModal(selected) {
    if (selected.length !== 2) {
      toast.error('Selecione exatamente 2 contatos para mesclar', { icon: '⚠️' })
      return
    }
    setMergeModal(selected)
  }

  function handleManualMerge(primary, secondary) {
    setEffectiveContacts(prev =>
      prev
        .filter(c => c.email !== secondary.email)
        .map(c => c.email === primary.email
          ? { ...c, secondary_emails: [...(c.secondary_emails ?? []), { email: secondary.email, type: 'work' }] }
          : c,
        ),
    )
    // Recalcula grupos — resoluções anteriores ficam obsoletas
    setDupResolutions({})
    setCheckedEmails(new Set())
    setMergeModal(null)
    toast.success(`Mescla confirmada: "${primary.name}" manterá ambos os e-mails`)
  }

  async function act(action) {
    if ((action === 'approve' || action === 'merge') && unresolvedCount > 0) {
      toast.error(
        `Resolva ${unresolvedCount} grupo${unresolvedCount !== 1 ? 's' : ''} de duplicata antes de aprovar`,
        { icon: '⚠️' },
      )
      return
    }
    setBusy(true)
    try {
      const { singles, groups: gs } = groupContacts(effectiveContacts)
      const resolvedContacts = buildResolvedContacts(singles, gs, dupResolutions)
      await onAction(record, action, resolvedContacts)
    } finally {
      setBusy(false)
    }
  }

  const totalNew = effectiveContacts.length
  const dupLabel = groups.length > 0 ? ` · ${groups.length} grupo${groups.length !== 1 ? 's' : ''}` : ''

  return (
    <>
      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-bg-secondary border-b border-border-tertiary flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="font-semibold text-text-primary text-sm truncate">{record.client?.fantasy_name || record.client?.name}</span>
            <span className="text-xs text-text-tertiary flex-shrink-0">{fmtMonth(record.ref_month)}</span>
            {totalNew > 0 && (
              <span className="text-xs bg-donc-sky/15 text-donc-sky rounded px-1.5 py-0.5 flex-shrink-0">
                +{totalNew} contato{totalNew !== 1 ? 's' : ''}{dupLabel}
              </span>
            )}
            {unresolvedCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 flex-shrink-0">
                ⚠️ {unresolvedCount} duplicata{unresolvedCount !== 1 ? 's' : ''} pendente{unresolvedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="green"     onClick={() => act('approve')} disabled={busy}>Aprovar</Button>
            <Button size="sm" variant="secondary" onClick={() => act('merge')}   disabled={busy}>Mesclar</Button>
            <Button size="sm" variant="danger"    onClick={() => act('reject')}  disabled={busy}>Rejeitar</Button>
          </div>
        </div>

        <div className="p-4">
          {/* Comparação de métricas */}
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="bg-bg-secondary">
                <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">Campo</th>
                <th className="text-right px-3 py-1.5 text-xs font-medium text-text-tertiary">Atual</th>
                <th className="text-right px-3 py-1.5 text-xs font-medium text-text-tertiary">Freshdesk</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(f => (
                <CompareRow key={f.key} label={f.label} current={record[f.key]} proposed={snap[f.key]} />
              ))}
            </tbody>
          </table>

          {/* Contatos */}
          <NewContactsSection
            effectiveContacts={effectiveContacts}
            dupResolutions={dupResolutions}
            onResolve={handleResolve}
            checkedEmails={checkedEmails}
            onToggle={handleToggleCheck}
            onOpenMergeModal={handleOpenMergeModal}
          />
        </div>
      </div>

      {/* Modal de mescla manual */}
      {mergeModal && (
        <MergeModal
          contacts={mergeModal}
          onConfirm={handleManualMerge}
          onClose={() => setMergeModal(null)}
        />
      )}
    </>
  )
}

// ── Aprovação de contatos (lista já resolvida) ────────────────────────────────
async function approveContacts(clientId, contacts) {
  if (!contacts?.length) return

  for (const c of contacts) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', c.email)
      .maybeSingle()

    let contactId = existing?.id

    if (!contactId) {
      const { data: created, error } = await supabase
        .from('contacts')
        .insert({ name: c.name, email: c.email })
        .select('id')
        .single()
      if (error) { console.error('Erro ao criar contato:', error.message); continue }
      contactId = created.id

      // Insere e-mail primário em contact_emails
      await supabase.from('contact_emails').insert({
        contact_id: contactId, email: c.email, type: 'work', is_primary: true,
      })
    }

    // Insere e-mails secundários (resultado de mescla automática ou manual)
    if (c.secondary_emails?.length) {
      const rows = c.secondary_emails.map(se => ({
        contact_id: contactId, email: se.email, type: se.type || 'work', is_primary: false,
      }))
      await supabase.from('contact_emails').upsert(rows, { onConflict: 'contact_id,email', ignoreDuplicates: true })
    }

    const papel = ['Decisor','Influenciador','Usuário','Técnico'].includes(c.suggested_papel)
      ? c.suggested_papel
      : 'Usuário'

    await supabase
      .from('contact_links')
      .upsert({ contact_id: contactId, client_id: clientId, papel }, { onConflict: 'contact_id,client_id' })
  }
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function FreshdeskPendingPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_support')
      .select('*, client:clients(id, name)')
      .eq('pending', true)
      .order('ref_month', { ascending: false })
    if (error) toast.error(error.message)
    setRecords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAction(record, action, resolvedContacts) {
    const snap = record.freshdesk_snapshot ?? {}

    if (action === 'reject') {
      const { error } = await supabase
        .from('client_support')
        .update({ pending: false, freshdesk_snapshot: null })
        .eq('id', record.id)
      if (error) { toast.error(error.message); return }
      toast.success('Dados rejeitados')
    }

    if (action === 'approve') {
      const { error } = await supabase
        .from('client_support')
        .update({
          tickets_opened:     snap.tickets_opened    ?? record.tickets_opened,
          tickets_resolved:   snap.tickets_resolved  ?? record.tickets_resolved,
          sla_first_response: snap.sla_first_response ?? record.sla_first_response,
          n1_pct:             snap.n1_pct  ?? record.n1_pct,
          n2_pct:             snap.n2_pct  ?? record.n2_pct,
          n3_pct:             snap.n3_pct  ?? record.n3_pct,
          pending:            false,
          freshdesk_snapshot: null,
        })
        .eq('id', record.id)
      if (error) { toast.error(error.message); return }
      await approveContacts(record.client_id, resolvedContacts)
      toast.success('Dados aprovados')
    }

    if (action === 'merge') {
      const { error } = await supabase
        .from('client_support')
        .update({
          tickets_opened:     record.tickets_opened    || snap.tickets_opened    || 0,
          tickets_resolved:   record.tickets_resolved  || snap.tickets_resolved  || 0,
          sla_first_response: record.sla_first_response || snap.sla_first_response || 0,
          n1_pct:             record.n1_pct || snap.n1_pct || 0,
          n2_pct:             record.n2_pct || snap.n2_pct || 0,
          n3_pct:             record.n3_pct || snap.n3_pct || 0,
          pending:            false,
          freshdesk_snapshot: null,
        })
        .eq('id', record.id)
      if (error) { toast.error(error.message); return }
      await approveContacts(record.client_id, resolvedContacts)
      toast.success('Dados mesclados')
    }

    setRecords(p => p.filter(r => r.id !== record.id))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Importações Pendentes — Freshdesk</h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            Revise os dados importados. Resolva duplicatas detectadas ou selecione manualmente com os checkboxes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={load}>Atualizar</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/configuracoes')}>
            ← Configurações
          </Button>
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium text-text-primary">Nenhuma importação pendente</p>
          <p className="text-sm mt-1">Todos os dados importados foram revisados.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-tertiary">
            {records.length} registro{records.length !== 1 ? 's' : ''} aguardando revisão
          </p>
          {records.map(r => (
            <PendingCard key={r.id} record={r} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  )
}
