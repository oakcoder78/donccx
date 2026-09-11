import { useEffect, useState } from 'react'
import { useBillingPaymentsMutations } from '@/hooks/useBillingPayments'
import { monthLabel } from '@/lib/financeiro'
import { Icons } from '@/lib/icons'

const STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'adimplente', label: 'Adimplente' },
  { value: 'inadimplente', label: 'Inadimplente' },
]

const KIND_LABELS = { original: 'Contrato original', aditivo: 'Aditivo', renegociacao: 'Renegociação' }

function StatusBadge({ status, delayDays }) {
  if (status === 'adimplente') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-donc-verde/10 text-donc-verde">
        Adimplente
      </span>
    )
  }
  if (status === 'inadimplente') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-donc-red/10 text-donc-red">
        Inadimplente{Number(delayDays) > 0 ? ` ${delayDays}d` : ''}
      </span>
    )
  }
  return <span className="text-text-tertiary text-xs">—</span>
}

/**
 * Adimplência por fatura = (cliente, série, mês).
 * Write: admin/finance (RLS `billing_payments_write`); demais leem.
 */
export function PaymentToggle({
  open,
  onClose,
  clientId,
  clientName,
  refMonth,
  series = [],
  payments = [],
  canWrite = false,
  onSaved,
}) {
  const { mutateAsync } = useBillingPaymentsMutations(clientId)
  const [draft, setDraft] = useState({})
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    if (!open) return
    const init = {}
    ;(series || []).forEach((s) => {
      const p = (payments || []).find((x) => x.series_id === s.series_id)
      init[s.series_id] = {
        status: p?.status || '',
        delay_days: p?.delay_days != null ? String(p.delay_days) : '',
        paid_at: p?.paid_at || '',
        note: p?.note || '',
      }
    })
    setDraft(init)
  }, [open, series, payments])

  if (!open) return null

  function update(seriesId, patch) {
    setDraft((prev) => ({ ...prev, [seriesId]: { ...(prev[seriesId] || {}), ...patch } }))
  }

  async function saveRow(seriesId) {
    const row = draft[seriesId] || {}
    if (!row.status) return
    setSavingId(seriesId)
    try {
      await mutateAsync({
        series_id: seriesId,
        ref_month: refMonth,
        status: row.status,
        delay_days: Number(row.delay_days) || 0,
        paid_at: row.paid_at || null,
        note: row.note || null,
      })
      onSaved?.()
    } catch {
      // hook shows the toast
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border-tertiary rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="text-base font-bold text-text-primary">Adimplência</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {clientName ? `${clientName} · ` : ''}
              {monthLabel(refMonth)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        {!canWrite && (
          <p className="text-[11px] text-text-tertiary mb-3">
            Somente Admin/Financeiro editam — você está no modo leitura.
          </p>
        )}

        {(series || []).length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-sm">
            Nenhuma série ativa neste mês.
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {(series || []).map((s) => {
              const row = draft[s.series_id] || {}
              const label = s.label || KIND_LABELS[s.kind] || 'Série'
              return (
                <div key={s.series_id} className="rounded-lg border border-border-tertiary p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-text-primary truncate">{label}</span>
                    {!canWrite && <StatusBadge status={row.status} delayDays={row.delay_days} />}
                  </div>
                  {canWrite ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label-sm">Status</label>
                        <select
                          value={row.status || ''}
                          onChange={(e) => update(s.series_id, { status: e.target.value })}
                          className="input-base w-full"
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label-sm">Dias de atraso</label>
                        <input
                          type="number"
                          min="0"
                          value={row.delay_days ?? ''}
                          onChange={(e) => update(s.series_id, { delay_days: e.target.value })}
                          className="input-base w-full"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="label-sm">Pago em</label>
                        <input
                          type="date"
                          value={row.paid_at || ''}
                          onChange={(e) => update(s.series_id, { paid_at: e.target.value })}
                          className="input-base w-full"
                        />
                      </div>
                      <div>
                        <label className="label-sm">Observação</label>
                        <input
                          value={row.note || ''}
                          onChange={(e) => update(s.series_id, { note: e.target.value })}
                          className="input-base w-full"
                          placeholder="—"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => saveRow(s.series_id)}
                          disabled={!row.status || savingId === s.series_id}
                          className="px-3 py-1.5 text-xs rounded-lg bg-donc-navy text-white font-medium hover:bg-donc-navy/90 transition-colors disabled:opacity-50"
                        >
                          {savingId === s.series_id ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-text-tertiary">
                      {row.paid_at ? `Pago em ${row.paid_at}` : 'Sem data de pagamento'}
                      {row.note ? ` · ${row.note}` : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
