import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

const FIELDS = [
  { key: 'tickets_opened',   label: 'Tickets abertos'       },
  { key: 'tickets_resolved', label: 'Tickets resolvidos'     },
  { key: 'sla_first_response', label: '1ª resposta (min)'   },
  { key: 'n1_pct',           label: 'N1 (qtd)'              },
  { key: 'n2_pct',           label: 'N2 (qtd)'              },
  { key: 'n3_pct',           label: 'N3 (qtd)'              },
]

// ── Linha de comparação ───────────────────────────────────────────────────────
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

// ── Card de uma empresa / mês ─────────────────────────────────────────────────
function PendingCard({ record, onAction }) {
  const snap    = record.freshdesk_snapshot ?? {}
  const [busy, setBusy] = useState(false)

  async function act(action) {
    setBusy(true)
    try {
      await onAction(record, action)
    } finally {
      setBusy(false)
    }
  }

  const hasNewContacts = (snap.new_contacts ?? []).length > 0

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-bg-secondary border-b border-border-tertiary flex items-center justify-between">
        <div>
          <span className="font-semibold text-text-primary text-sm">{record.client?.name}</span>
          <span className="ml-2 text-xs text-text-tertiary">{fmtMonth(record.ref_month)}</span>
          {hasNewContacts && (
            <span className="ml-2 text-xs bg-donc-sky/15 text-donc-sky rounded px-1.5 py-0.5">
              +{snap.new_contacts.length} contato{snap.new_contacts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="green"     onClick={() => act('approve')} disabled={busy}>Aprovar</Button>
          <Button size="sm" variant="secondary" onClick={() => act('merge')}   disabled={busy}>Mesclar</Button>
          <Button size="sm" variant="danger"    onClick={() => act('reject')}  disabled={busy}>Rejeitar</Button>
        </div>
      </div>

      {/* Comparação de métricas */}
      <div className="p-4">
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
              <CompareRow
                key={f.key}
                label={f.label}
                current={record[f.key]}
                proposed={snap[f.key]}
              />
            ))}
          </tbody>
        </table>

        {/* Contatos novos */}
        {hasNewContacts && (
          <div className="mt-3 border-t border-border-tertiary pt-3">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">Contatos novos encontrados</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-secondary">
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">Nome</th>
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">E-mail</th>
                  <th className="text-right px-3 py-1.5 text-xs font-medium text-text-tertiary">Tickets</th>
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-text-tertiary">Papel sugerido</th>
                </tr>
              </thead>
              <tbody>
                {snap.new_contacts.map((c, i) => (
                  <tr key={i} className="border-t border-border-tertiary">
                    <td className="px-3 py-2 text-text-primary">{c.name}</td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{c.email}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{c.ticket_count}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        c.suggested_papel === 'Técnico'       ? 'bg-blue-100 text-blue-700' :
                        c.suggested_papel === 'Influenciador' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {c.suggested_papel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Aprovação de contatos ─────────────────────────────────────────────────────
async function approveContacts(clientId, newContacts) {
  if (!newContacts?.length) return

  for (const c of newContacts) {
    // Verifica se contato já existe por e-mail
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
    }

    // Garante que o papel seja válido para o banco
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

  async function handleAction(record, action) {
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
          tickets_opened:    snap.tickets_opened   ?? record.tickets_opened,
          tickets_resolved:  snap.tickets_resolved ?? record.tickets_resolved,
          sla_first_response: snap.sla_first_response ?? record.sla_first_response,
          n1_pct:            snap.n1_pct   ?? record.n1_pct,
          n2_pct:            snap.n2_pct   ?? record.n2_pct,
          n3_pct:            snap.n3_pct   ?? record.n3_pct,
          pending:           false,
          freshdesk_snapshot: null,
        })
        .eq('id', record.id)
      if (error) { toast.error(error.message); return }
      await approveContacts(record.client_id, snap.new_contacts)
      toast.success('Dados aprovados')
    }

    if (action === 'merge') {
      const { error } = await supabase
        .from('client_support')
        .update({
          tickets_opened:    record.tickets_opened   || snap.tickets_opened   || 0,
          tickets_resolved:  record.tickets_resolved || snap.tickets_resolved || 0,
          sla_first_response: record.sla_first_response || snap.sla_first_response || 0,
          n1_pct:            record.n1_pct || snap.n1_pct || 0,
          n2_pct:            record.n2_pct || snap.n2_pct || 0,
          n3_pct:            record.n3_pct || snap.n3_pct || 0,
          pending:           false,
          freshdesk_snapshot: null,
        })
        .eq('id', record.id)
      if (error) { toast.error(error.message); return }
      // Mesclar: importa só novos contatos
      await approveContacts(record.client_id, snap.new_contacts)
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
            Revise os dados importados antes de aplicá-los aos registros de suporte.
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
