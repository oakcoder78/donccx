import { C, fmtMonthLong, ymOffset } from '@/lib/scoring'

// Period + "as of" strip. The dashboard mixes timeframes (operacional closes
// monthly, CS is live) — this header declares that (UX critique).

function fmtStamp(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function DashboardHeader({ updatedAt }) {
  const stamp = fmtStamp(updatedAt)
  const periodo = fmtMonthLong(ymOffset(1)) // last closed month

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.ink, background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 999, padding: '4px 12px' }}>
        Fechamento de {periodo}
      </span>
      {stamp && (
        <span style={{ fontSize: '0.75rem', color: C.ink2 }}>
          Operacional fecha mensal · CS ao vivo · atualizado em {stamp}
        </span>
      )}
    </div>
  )
}
