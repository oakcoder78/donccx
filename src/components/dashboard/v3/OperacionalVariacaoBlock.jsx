import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, fmtMonthShortYear } from '@/lib/scoring'
import { Panel, StripHead, SeeAll, DeltaBadge } from './primitives'
import { ScopeLabel } from './ScopeLabel'
import { canDrillIn } from './gating'
import { Drawer } from '@/components/ui/Drawer'
import { OperationalHistoryDrawer } from './OperationalHistoryDrawer'

function Row({ r, kind, prevShort, prev2Short, onRow, clickable }) {
  const isHealth = kind === 'health'
  const inner = (
    <>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
        <span style={{ display: 'block', fontSize: '0.6875rem', color: C.ink2 }}>
          {isHealth
            ? `${prevShort} ${r.cur} · ${prev2Short} ${r.prev ?? '—'}`
            : `${prevShort} ${Number(r.curVal).toLocaleString('pt-BR')} · ${prev2Short} ${Number(r.prevVal).toLocaleString('pt-BR')}`}
        </span>
      </span>
      {isHealth
        ? (r.delta === 0 ? <span style={{ fontSize: '0.75rem', color: C.ink2 }}>—</span> : <DeltaBadge absolute={r.delta} unit="pts" />)
        : (r.state === 'new' ? <DeltaBadge neutralLabel="Início de uso" /> : <DeltaBadge pct={r.delta} />)}
    </>
  )
  const style = { width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }
  if (!clickable) return <div style={style}>{inner}</div>
  return <button type="button" onClick={onRow} style={{ ...style, font: 'inherit', cursor: 'pointer' }}>{inner}</button>
}

export function OperacionalVariacaoBlock({ deltas, effectiveRole, profileId, syncStatus }) {
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(null) // { mode, data?, rows? }
  const { osRows = [], usersRows = [], healthRows = [], prevMonthShort, prevMonth2Short, hasData, isLoading, error, refetch } = deltas || {}
  const isAdminManager = effectiveRole === 'admin' || effectiveRole === 'manager'

  const panels = [
    { kind: 'os', mode: 'op-os', title: 'OS criadas', rows: osRows },
    { kind: 'users', mode: 'op-users', title: 'Profissionais ativos', rows: usersRows },
    { kind: 'health', mode: 'op-health', title: 'Health score', rows: healthRows },
  ]

  const openRow = (mode, r) => setDrawer({ mode, data: { clientId: r.clientId, clientName: r.name } })
  const openList = (mode, rows) => setDrawer({ mode: `${mode}-list`, rows })

  return (
    <Panel as="section" aria-labelledby="v3-op-title" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <span style={{ minWidth: 0 }}>
          <h2 id="v3-op-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
            Operacional — variação mensal
          </h2>
          <span style={{ fontSize: '0.75rem', color: C.ink2 }}>
            DONC API{prevMonthShort ? ` · ${prevMonthShort} vs ${prevMonth2Short}` : ''}
          </span>
        </span>
        <ScopeLabel scope="base" />
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {isLoading && <div className="animate-pulse" style={{ height: 200, borderRadius: 12, background: C.bg }} />}
        {!isLoading && error && (
          <button type="button" onClick={refetch} style={{ background: 'none', border: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem', padding: 0 }}>
            Erro ao carregar — tentar novamente
          </button>
        )}
        {!isLoading && !error && !hasData && (
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem' }}>
            Sem dados sincronizados para o mês. <button type="button" onClick={() => navigate('/configuracoes')} style={{ background: 'none', border: 0, padding: 0, color: C.navy, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>Verificar sincronização</button>
          </p>
        )}
        {!isLoading && !error && hasData && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {panels.map(p => (
              <div key={p.kind}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <h3 style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink }}>{p.title}</h3>
                  <StripHead style={{ fontSize: '0.625rem' }}>top 5</StripHead>
                </div>
                {p.rows.length === 0
                  ? <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem' }}>Sem variação no período.</p>
                  : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {p.rows.slice(0, 5).map(r => (
                        <li key={r.clientId}>
                          <Row
                            r={r} kind={p.kind} prevShort={prevMonthShort} prev2Short={prevMonth2Short}
                            clickable={canDrillIn(r, effectiveRole, profileId)}
                            onRow={() => openRow(p.mode, r)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                {p.rows.length > 5 && (
                  <div style={{ marginTop: 8 }}>
                    <SeeAll onClick={() => openList(p.mode, p.rows)}>ver todos</SeeAll>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdminManager && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: C.ink2 }}>
              {syncStatus?.status === 'success' && syncStatus.summary?.ref_month
                ? `Sincronização de dados — última: ${fmtMonthShortYear(syncStatus.summary.ref_month)}`
                : syncStatus?.status === 'running'
                  ? 'Sincronização em andamento…'
                  : 'Sincronização de dados'}
            </span>
            <SeeAll onClick={() => navigate('/configuracoes')}>gerenciar sincronização</SeeAll>
          </div>
        )}
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} ariaLabel="Histórico operacional">
        {drawer && (
          <OperationalHistoryDrawer
            {...drawer}
            prevMonthShort={prevMonthShort}
            prevMonth2Short={prevMonth2Short}
            effectiveRole={effectiveRole}
            profileId={profileId}
            onClose={() => setDrawer(null)}
          />
        )}
      </Drawer>
    </Panel>
  )
}
