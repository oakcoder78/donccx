import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { useContractSeries, useContractCharges } from '@/hooks/useContractCharges'
import { useBillingPayments } from '@/hooks/useBillingPayments'
import { fmtMonthShortYear } from '@/lib/scoring'
import { formatBRL4 } from '@/lib/contractRules'

const KIND_LABELS = { original: 'Contrato original', aditivo: 'Aditivo', renegociacao: 'Renegociação' }

function chargeValue(c, baseTotal) {
  if (c.mode === 'percent') return ((Number(baseTotal) || 0) * Number(c.percent || 0)) / 100
  return Number(c.amount) || 0
}

function StatusBadge({ status }) {
  if (status === 'adimplente') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Adimplente</span>
  }
  if (status === 'inadimplente') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">Inadimplente</span>
  }
  return <span className="text-text-tertiary text-xs">—</span>
}

/**
 * "Cronograma de cobrança" — read-only ledger por (série, competência).
 * Mensalidade (renegociação) exibe 3 linhas: original − desconto = a pagar.
 */
export function BillingSchedule({ client }) {
  const [open, setOpen] = useState(true)
  const { data: series = [] } = useContractSeries(client.id)
  const { data: charges = [] } = useContractCharges(client.id)
  const { data: payments = [] } = useBillingPayments(client.id)

  const clientBase = (Number(client.billing_floor) || 0) > 0
    ? Number(client.billing_base_value || 0) * Number(client.billing_floor)
    : Number(client.billing_base_value || 0)
  const baseBySeries = useMemo(() => {
    const m = {}
    series.forEach(s => {
      const per = Number(s.billing_base_value ?? client.billing_base_value) || 0
      const floor = Number(s.billing_floor ?? client.billing_floor) || 0
      m[s.id] = floor > 0 ? per * floor : per
    })
    return m
  }, [series, client.billing_base_value, client.billing_floor])

  const rows = useMemo(() => {
    if (series.length === 0) return []
    const bySeriesMonth = {}
    charges.forEach(c => {
      if (!c.series_id || !c.ref_month) return
      const k = `${c.series_id}|${c.ref_month}`
      if (!bySeriesMonth[k]) bySeriesMonth[k] = { seriesId: c.series_id, ref: c.ref_month, rec: 0, imp: 0 }
      const base = baseBySeries[c.series_id] ?? clientBase
      if (c.kind === 'recorrencia') bySeriesMonth[k].rec += chargeValue(c, base)
      else bySeriesMonth[k].imp += chargeValue(c, base)
    })
    const seriesById = Object.fromEntries(series.map(s => [s.id, s]))
    const origByMonth = {}
    let origHasAnyRec = false
    Object.values(bySeriesMonth).forEach(r => {
      if (seriesById[r.seriesId]?.kind === 'original') {
        origByMonth[r.ref] = r.rec
        if (r.rec > 0) origHasAnyRec = true
      }
    })
    const order = { original: 0, aditivo: 1, renegociacao: 2 }
    return Object.values(bySeriesMonth)
      .map(r => {
        const s = seriesById[r.seriesId]
        if (!s) return null
        const pay = payments.find(p => p.series_id === r.seriesId && p.ref_month === r.ref)
        const isReneg = s.kind === 'renegociacao'
        // Referência: recorrência original no mês; sem regra na original, vale o MRR base
        const original = isReneg ? (origByMonth[r.ref] ?? (origHasAnyRec ? null : clientBase)) : null
        const total = r.rec + r.imp
        const desconto = isReneg && original != null ? original - r.rec : null
        return { ...r, series: s, original, desconto, total, status: pay?.status || null }
      })
      .filter(Boolean)
      .sort((a, b) => a.ref.localeCompare(b.ref) || (order[a.series.kind] ?? 9) - (order[b.series.kind] ?? 9))
  }, [series, charges, payments, baseBySeries, clientBase])

  if (series.length === 0 && charges.length === 0) return null

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full mb-1"
      >
        <p className="text-xs text-text-tertiary font-semibold uppercase tracking-wider">
          Cronograma de cobrança {rows.length > 0 && `· ${rows.length} fatura${rows.length !== 1 ? 's' : ''}`}
        </p>
        <span className="text-xs text-text-tertiary">{open ? 'Ocultar' : 'Ver'}</span>
      </button>
      {open && (
        rows.length === 0 ? (
          <p className="text-sm text-text-tertiary py-4 text-center">Nenhum lançamento nas séries.</p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-96 border border-border-tertiary rounded">
            <table className="w-full text-xs min-w-[42rem]">
              <thead className="bg-bg-secondary sticky top-0">
                <tr className="text-left text-text-tertiary">
                  <th className="px-3 py-1.5 font-medium">Competência</th>
                  <th className="px-3 py-1.5 font-medium">Série</th>
                  <th className="px-3 py-1.5 font-medium text-right">Original</th>
                  <th className="px-3 py-1.5 font-medium text-right">Desconto</th>
                  <th className="px-3 py-1.5 font-medium text-right">Total</th>
                  <th className="px-3 py-1.5 font-medium text-center">Venc.</th>
                  <th className="px-3 py-1.5 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.seriesId}-${r.ref}`} className="border-t border-border-tertiary/50">
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtMonthShortYear(r.ref)}</td>
                    <td className="px-3 py-1.5">
                      {r.series.label || KIND_LABELS[r.series.kind]}
                      {r.series.status === 'encerrada' && (
                        <span className="ml-1.5 text-[10px] text-amber-700">· encerrada</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-text-secondary">
                      {r.original != null ? formatBRL4(r.original) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-green-700">
                      {r.desconto != null && r.desconto !== 0 ? `− ${formatBRL4(r.desconto)}` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium text-donc-navy">{formatBRL4(r.total)}</td>
                    <td className="px-3 py-1.5 text-center text-text-secondary">dia {r.series.due_day}</td>
                    <td className="px-3 py-1.5 text-center"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  )
}
