import { useEffect, useMemo, useState } from 'react'
import { useBillingPayments, useBillingPaymentsMutations } from '@/hooks/useBillingPayments'
import { useContractSeries } from '@/hooks/useContractCharges'
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
 * A competência é selecionável (o Financeiro confirma meses anteriores sem sair do cockpit).
 * Write: admin/finance (RLS `billing_payments_write`); demais leem.
 */
export function PaymentToggle({
  open,
  onClose,
  clientId,
  clientName,
  refMonth,
  months = [],
  canWrite = false,
  onSaved,
}) {
  const { mutateAsync } = useBillingPaymentsMutations(clientId)
  const { data: payments = [] } = useBillingPayments(clientId)
  const { data: allSeries = [] } = useContractSeries(clientId)
  const [month, setMonth] = useState(refMonth)
  const [draft, setDraft] = useState({})
  const [selected, setSelected] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    if (open) setMonth(refMonth)
  }, [open, refMonth])

  const monthOptions = useMemo(() => {
    const set = new Set([...(months || []), refMonth, ...(payments || []).map((p) => p.ref_month)])
    return [...set].filter(Boolean).sort().reverse()
  }, [months, refMonth, payments])

  const series = useMemo(() => {
    if (!month) return []
    const first = `${month}-01`
    const [yy, mm] = month.split('-').map(Number)
    const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10)
    return (allSeries || [])
      .filter((s) => s.status === 'ativa' && s.billing_start <= last && (!s.billing_end || s.billing_end >= first))
      .map((s) => ({ series_id: s.id, label: s.label, kind: s.kind, due_day: s.due_day || 5 }))
  }, [allSeries, month])

  /** Default payment date = due day of the month (clamped to month length). */
  function dueDateOf(seriesMeta) {
    const [yy, mm] = String(month || '').split('-').map(Number)
    if (!yy || !mm) return ''
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    const d = Math.min(Math.max(1, Number(seriesMeta?.due_day) || 5), last)
    return `${month}-${String(d).padStart(2, '0')}`
  }

  const monthPayments = useMemo(
    () => (payments || []).filter((p) => p.ref_month === month),
    [payments, month]
  )

  useEffect(() => {
    if (!open) return
    const init = {}
    const sel = {}
    ;(series || []).forEach((s) => {
      const p = (monthPayments || []).find((x) => x.series_id === s.series_id)
      init[s.series_id] = {
        status: p?.status || '',
        delay_days: p?.delay_days != null ? String(p.delay_days) : '',
        paid_at: p?.paid_at || '',
        note: p?.note || '',
      }
      sel[s.series_id] = true
    })
    setDraft(init)
    setSelected(sel)
  }, [open, series, monthPayments])

  if (!open) return null

  function update(seriesId, patch) {
    setDraft((prev) => ({ ...prev, [seriesId]: { ...(prev[seriesId] || {}), ...patch } }))
  }

  async function saveRow(seriesId, forcePaid = false) {
    const meta = (series || []).find((s) => s.series_id === seriesId)
    const row = draft[seriesId] || {}
    const status = forcePaid ? 'adimplente' : row.status
    if (!status) return
    setSavingId(seriesId)
    try {
      await mutateAsync({
        series_id: seriesId,
        ref_month: month,
        status,
        delay_days: Number(row.delay_days) || 0,
        paid_at: row.paid_at || (forcePaid ? dueDateOf(meta) : null) || null,
        note: row.note || null,
      })
      onSaved?.()
    } catch {
      // hook shows the toast
    } finally {
      setSavingId(null)
    }
  }

  const selectedIds = useMemo(
    () => (series || []).map((s) => s.series_id).filter((id) => selected[id]),
    [series, selected]
  )

  /** Mark all selected series as paid (adimplente, paid on due date by default). */
  async function saveBulkPaid() {
    if (selectedIds.length === 0 || bulkSaving) return
    setBulkSaving(true)
    try {
      for (const id of selectedIds) {
        await saveRow(id, true)
      }
    } finally {
      setBulkSaving(false)
    }
  }

  function toggleAll(on) {
    const next = {}
    ;(series || []).forEach((s) => { next[s.series_id] = on })
    setSelected(next)
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
              {monthLabel(month || refMonth)}
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

        {monthOptions.length > 1 && (
          <div className="mt-3">
            <label className="label-sm">Competência</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input-base w-full"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}

        {!canWrite && (
          <p className="text-[11px] text-text-tertiary mt-3">
            Somente Admin/Financeiro editam — você está no modo leitura.
          </p>
        )}

        {(series || []).length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-sm">
            Nenhuma série ativa em {monthLabel(month || refMonth)}.
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            {canWrite && (series || []).length > 1 && (
              <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === (series || []).length && (series || []).length > 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
                Selecionar todas
              </label>
            )}
            {(series || []).map((s) => {
              const row = draft[s.series_id] || {}
              const label = s.label || KIND_LABELS[s.kind] || 'Série'
              return (
                <div key={s.series_id} className="rounded-lg border border-border-tertiary p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
                      {canWrite && (
                        <input
                          type="checkbox"
                          checked={!!selected[s.series_id]}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [s.series_id]: e.target.checked }))}
                          aria-label={`Selecionar ${label}`}
                        />
                      )}
                      <span className="truncate">{label}</span>
                    </span>
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
            {canWrite && (series || []).length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={saveBulkPaid}
                  disabled={selectedIds.length === 0 || bulkSaving}
                  className="px-3 py-1.5 text-xs rounded-lg bg-donc-verde text-white font-medium hover:bg-donc-verde/90 transition-colors disabled:opacity-50"
                >
                  {bulkSaving ? 'Marcando…' : `Marcar ${selectedIds.length > 0 ? `${selectedIds.length} ` : ''}como quitada${selectedIds.length === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
