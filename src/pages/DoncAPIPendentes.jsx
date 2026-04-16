import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('pt-BR')
}

function isCurrentMonth(refMonth) {
  if (!refMonth) return false
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return refMonth === cur
}

// ── Campos comparados em ordem ─────────────────────────────────────────────────
const COMPARE_FIELDS = [
  { key: 'os_created',              label: 'OS criadas'             },
  { key: 'active_users',            label: 'Profissionais ativos'   },
  { key: 'profissionais_inativos',  label: 'Profissionais inativos' },
  { key: 'os_finalizadas',          label: 'OS finalizadas'         },
  { key: 'os_abertas',              label: 'OS abertas'             },
  { key: 'os_canceladas',           label: 'OS canceladas'          },
  { key: 'unidades',                label: 'Unidades'               },
]

// ── Extrai valores da API do donc_snapshot ─────────────────────────────────────
function snapshotValues(snap) {
  if (!snap) return {}
  return {
    os_created:             snap.totalOs                    ?? null,
    active_users:           snap.profissionais?.ativos      ?? null,
    profissionais_inativos: snap.profissionais?.inativos    ?? null,
    os_finalizadas:         snap.osPorStatus?.finalizadas   ?? null,
    os_abertas:             snap.osPorStatus?.abertas       ?? null,
    os_canceladas:          snap.osPorStatus?.canceladas    ?? null,
    unidades:               snap.unidades                   ?? null,
  }
}

// ── Célula de comparação ───────────────────────────────────────────────────────
function CmpCell({ current, next }) {
  let color = '#888780'
  let arrow = null
  if (next !== null && next !== undefined && current !== null && current !== undefined) {
    if (next > current)      { color = '#16a34a'; arrow = '▲' }
    else if (next < current) { color = '#dc2626'; arrow = '▼' }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{fmtNum(next)}</span>
      {arrow && <span style={{ fontSize: 10, color }}>{arrow}</span>}
    </div>
  )
}

// ── Card de um registro pendente ───────────────────────────────────────────────
function PendingCard({ row, onAction, dismissing }) {
  const snap       = row.donc_snapshot
  const apiVals    = snapshotValues(snap)
  const os_por_tipo = snap?.osPorTipo ?? row.os_por_tipo ?? null

  const [acting, setActing] = useState(null)

  async function act(type) {
    setActing(type)
    await onAction(row, type)
    setActing(null)
  }

  const instLabel = row.client_donc_instances?.label ?? `ID ${row.instance_id}`
  const refLabel  = fmtMonth(row.ref_month)
  const isPartial = isCurrentMonth(row.ref_month)

  return (
    <div
      style={{
        border: '1px solid #e8e7e3',
        borderRadius: 10,
        marginBottom: 12,
        overflow: 'hidden',
        backgroundColor: '#fff',
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'opacity 0.25s, transform 0.25s',
      }}
    >
      {/* Topbar navy */}
      <div style={{ backgroundColor: '#173557', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
          {instLabel}
        </span>
        <span style={{ fontSize: 11, color: '#173557', backgroundColor: '#59c2ed', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
          {refLabel}
        </span>
        {isPartial && (
          <span style={{ fontSize: 11, color: '#92400e', backgroundColor: '#fde68a', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
            ⚠️ Dados parciais
          </span>
        )}
      </div>

      {/* Tabela comparação */}
      <div style={{ padding: '12px 16px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: '#888780', fontWeight: 600, paddingBottom: 6, paddingRight: 16, whiteSpace: 'nowrap' }}>Campo</th>
              <th style={{ textAlign: 'right', color: '#888780', fontWeight: 600, paddingBottom: 6, paddingRight: 8 }}>Atual</th>
              <th style={{ textAlign: 'right', color: '#888780', fontWeight: 600, paddingBottom: 6 }}>API DONC</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_FIELDS.map(f => (
              <tr key={f.key} style={{ borderTop: '1px solid #f0f0ec' }}>
                <td style={{ padding: '5px 16px 5px 0', color: '#555452', whiteSpace: 'nowrap' }}>{f.label}</td>
                <td style={{ padding: '5px 8px 5px 0', textAlign: 'right', color: '#888780' }}>{fmtNum(row[f.key])}</td>
                <td style={{ padding: '5px 0', textAlign: 'right' }}>
                  <CmpCell current={row[f.key]} next={apiVals[f.key]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* OS por tipo */}
        {os_por_tipo && Array.isArray(os_por_tipo) && os_por_tipo.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#888780', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>OS por tipo (API)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {os_por_tipo.map((t, i) => (
                <span key={i} style={{ fontSize: 11, backgroundColor: '#f0f0ec', borderRadius: 4, padding: '2px 8px', color: '#1a1a18' }}>
                  {t.tipo ?? t.type ?? JSON.stringify(t)}: {fmtNum(t.quantidade ?? t.count ?? t.total)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ações */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #e8e7e3', display: 'flex', gap: 8 }}>
        <button
          disabled={!!acting}
          onClick={() => act('approve')}
          style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: acting ? 'not-allowed' : 'pointer', backgroundColor: acting === 'approve' ? '#e8e7e3' : '#d3da47', color: acting === 'approve' ? '#888780' : '#173557' }}
        >
          {acting === 'approve' ? '...' : 'Aprovar'}
        </button>
        <button
          disabled={!!acting}
          onClick={() => act('merge')}
          style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: acting ? 'not-allowed' : 'pointer', backgroundColor: acting === 'merge' ? '#e8e7e3' : '#59c2ed', color: acting === 'merge' ? '#888780' : '#173557' }}
        >
          {acting === 'merge' ? '...' : 'Mesclar'}
        </button>
        <button
          disabled={!!acting}
          onClick={() => act('reject')}
          style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #d4d3ce', cursor: acting ? 'not-allowed' : 'pointer', backgroundColor: '#fff', color: '#888780' }}
        >
          {acting === 'reject' ? '...' : 'Rejeitar'}
        </button>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function DoncAPIPendentes() {
  const navigate   = useNavigate()
  const [rows,       setRows]      = useState([])
  const [loading,    setLoading]   = useState(true)
  const [dismissing, setDismissing] = useState(new Set())
  const [approving,  setApproving]  = useState(false)
  const [rejecting,  setRejecting]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_usage')
      .select(`
        *,
        client_donc_instances ( id, label, contrato_saas_id ),
        clients ( id, name, fantasy_name )
      `)
      .eq('pending', true)
      .not('instance_id', 'is', null)
      .order('client_id')
      .order('ref_month', { ascending: false })

    if (error) { console.error('[DoncAPIPendentes]', error); toast.error(error.message) }
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Agrupa por cliente
  const grouped = rows.reduce((acc, r) => {
    const cid = r.client_id
    if (!acc[cid]) acc[cid] = { client: r.clients, rows: [] }
    acc[cid].rows.push(r)
    return acc
  }, {})

  async function doAction(row, type) {
    const snap    = row.donc_snapshot
    const apiVals = snapshotValues(snap)

    let patch = { pending: false }

    if (type === 'approve') {
      Object.assign(patch, apiVals, {
        os_por_tipo:   snap?.osPorTipo  ?? null,
        donc_snapshot: snap,
      })
    } else if (type === 'merge') {
      for (const [k, v] of Object.entries(apiVals)) {
        const cur = row[k]
        if (cur === null || cur === undefined || cur === 0) patch[k] = v
      }
      if (!row.os_por_tipo && snap?.osPorTipo) patch.os_por_tipo = snap.osPorTipo
    }

    const { error } = await supabase
      .from('client_usage')
      .update(patch)
      .eq('id', row.id)

    if (error) { toast.error(error.message); return }

    const label = type === 'approve' ? 'Aprovado' : type === 'merge' ? 'Mesclado' : 'Rejeitado'
    toast.success(label)

    setDismissing(prev => new Set([...prev, row.id]))
    setTimeout(() => {
      setRows(prev => prev.filter(r => r.id !== row.id))
      setDismissing(prev => { const s = new Set(prev); s.delete(row.id); return s })
    }, 280)
  }

  async function approveAll() {
    if (!window.confirm(`Aprovar todos os ${rows.length} registros pendentes?`)) return
    setApproving(true)
    for (const row of rows) {
      await doAction(row, 'approve')
    }
    setApproving(false)
  }

  async function rejectAll() {
    if (!window.confirm(`Rejeitar todos os ${rows.length} registros pendentes?`)) return
    setRejecting(true)
    for (const row of rows) {
      await doAction(row, 'reject')
    }
    setRejecting(false)
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/configuracoes')}
          style={{ fontSize: 13, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← Configurações
        </button>
        <span style={{ color: '#d4d3ce' }}>|</span>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a18', margin: 0 }}>
          Registros Pendentes — API DONC
        </h1>
        {rows.length > 0 && (
          <span style={{ fontSize: 12, backgroundColor: '#59c2ed', color: '#fff', fontWeight: 700, padding: '2px 10px', borderRadius: 10 }}>
            {rows.length}
          </span>
        )}
        {rows.length > 1 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={approveAll}
              disabled={approving || rejecting}
              style={{ padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, border: 'none', cursor: (approving || rejecting) ? 'not-allowed' : 'pointer', backgroundColor: (approving || rejecting) ? '#e8e7e3' : '#173557', color: (approving || rejecting) ? '#888780' : '#fff' }}
            >
              {approving ? 'Aprovando...' : 'Aprovar todos'}
            </button>
            <button
              onClick={rejectAll}
              disabled={approving || rejecting}
              style={{ padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, border: '1px solid #d4d3ce', cursor: (approving || rejecting) ? 'not-allowed' : 'pointer', backgroundColor: '#fff', color: '#888780' }}
            >
              {rejecting ? 'Rejeitando...' : 'Rejeitar todos'}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <p style={{ fontSize: 13, color: '#888780' }}>Carregando...</p>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#888780' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18', margin: '0 0 4px' }}>Nenhum registro pendente</p>
          <p style={{ fontSize: 13, margin: 0 }}>Todos os dados da API DONC já foram revisados.</p>
        </div>
      )}

      {!loading && Object.entries(grouped).map(([cid, { client, rows: clientRows }]) => (
        <div key={cid} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a18' }}>{client?.fantasy_name || client?.name}</span>
            {client?.fantasy_name && client?.name && (
              <span style={{ fontSize: 12, color: '#888780', marginLeft: 8 }}>{client.name}</span>
            )}
          </div>
          {clientRows.map(row => (
            <PendingCard
              key={row.id}
              row={row}
              onAction={doAction}
              dismissing={dismissing.has(row.id)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
