import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/lib/scoring'
import { Panel, SeeAll } from './primitives'
import { ActivityDetailModal } from '@/components/activities/ActivityDetailModal'
import { ActivityModal } from '@/components/activities/ActivityModal'

const todayStr = new Date().toISOString().slice(0, 10)

function fmtDay(str) {
  if (!str) return ''
  return new Date(str + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function bucket(a) {
  if (a.activity_date && a.activity_date < todayStr) return 0 // atrasada
  if (a.activity_date === todayStr) return 1 // hoje
  return 2 // agendada
}

const BADGE = [
  { label: 'ATRASADA', bg: C.red, fg: '#fff' },
  { label: 'HOJE', bg: C.amber, fg: '#fff' },
  { label: 'AGENDADA', bg: C.surface, fg: C.ink2 },
]

export function MinhaAgendaBlock({ activities = [], effectiveRole, loading, error, onRetry }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const canWrite = effectiveRole !== 'finance'

  const rows = useMemo(() => {
    return [...activities]
      .filter(a => a.status !== 'concluida' && a.status !== 'cancelada')
      .sort((a, b) => {
        const d = bucket(a) - bucket(b)
        if (d !== 0) return d
        return (a.activity_date || '').localeCompare(b.activity_date || '')
      })
      .slice(0, 5)
  }, [activities])

  return (
    <Panel as="section" aria-labelledby="v3-agenda-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
        <h2 id="v3-agenda-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
          Minha agenda
        </h2>
        <SeeAll href="/atividades">ver todas</SeeAll>
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {loading && <div className="animate-pulse" style={{ height: 160, borderRadius: 12, background: C.bg }} />}
        {!loading && error && (
          <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem', padding: 0 }}>
            Erro ao carregar — tentar novamente
          </button>
        )}
        {!loading && !error && rows.length === 0 && (
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem' }}>Sem atividades pendentes.</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(a => {
              const b = BADGE[bucket(a)]
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setDetail(a)}
                    style={{
                      width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '10px 12px', borderRadius: 12,
                      background: bucket(a) === 0 ? C.redSoft : bucket(a) === 1 ? C.amberSoft : C.bg,
                      border: `0.5px solid ${C.line}`,
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.title || a.type || 'Atividade'}
                        {a.client && <span style={{ color: C.ink2, fontWeight: 500 }}> — {a.client.fantasy_name || a.client.name}</span>}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: C.ink2, marginTop: 2 }}>
                        {a.activity_date ? `${fmtDay(a.activity_date)}${a.activity_time ? ` · ${a.activity_time.slice(0, 5)}` : ''}` : 'Sem data'}
                        {a.responsible?.name ? ` · ${a.responsible.name}` : ''}
                      </span>
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.03em',
                      padding: '4px 8px', borderRadius: 999, background: b.bg, color: b.fg,
                      border: bucket(a) === 2 ? `0.5px solid ${C.line}` : 'none',
                    }}>
                      {b.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.line}`, display: 'flex', gap: 8 }}>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            style={{ flex: 1, height: 36, borderRadius: 12, background: C.navy, color: '#fff', border: 0, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
          >
            + Nova atividade
          </button>
        )}
        {effectiveRole === 'analyst' && (
          <button
            type="button"
            onClick={() => navigate('/atendimento')}
            style={{ flex: 1, height: 36, borderRadius: 12, background: C.surface, color: C.ink, border: `0.5px solid ${C.line}`, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
          >
            + Novo atendimento
          </button>
        )}
      </div>

      {detail && (
        <ActivityDetailModal
          activity={detail}
          onClose={() => setDetail(null)}
          onUpdated={() => setDetail(null)}
        />
      )}
      {showNew && <ActivityModal onClose={() => setShowNew(false)} />}
    </Panel>
  )
}
