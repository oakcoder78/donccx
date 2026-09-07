import { useMemo } from 'react'
import { formatBRL4, refMonth, diffMonths } from '@/lib/contractRules'
import { fmtMonthShortYear } from '@/lib/scoring'
import { Icons } from '@/lib/icons'

const ROW = 'grid grid-cols-[16rem_8rem_9rem_5rem_6rem_1fr_2rem] items-center gap-2 min-w-[54rem]'

/**
 * "Cobranças Eventuais" — one-off charges (implantação, setup, treinamento),
 * optionally split into installments starting at a user-chosen date.
 * The date input is primary; startMonth (relative to the series) derives from it.
 * Parent wraps this in a <FormSection>.
 */
export function EventuaisSection({ eventuais, setEventuais, readOnly = false, billingStart = null, dueDay = 5 }) {
  function refLabel(monthIndex) {
    if (!billingStart) return null
    try { return fmtMonthShortYear(refMonth(billingStart, monthIndex)) } catch { return null }
  }
  // Data cheia de vencimento: dia da série + competência (o dia se edita em "Dia do vencimento")
  function fullDate(monthIndex) {
    if (!billingStart) return null
    try {
      const [y, m] = refMonth(billingStart, monthIndex).split('-')
      return `${String(dueDay).padStart(2, '0')}/${m}/${y}`
    } catch { return null }
  }
  function monthValue(startMonth) {
    if (!billingStart) return ''
    try { return refMonth(billingStart, startMonth ?? 1) } catch { return '' }
  }
  function update(idx, patch) {
    setEventuais(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function onDateChange(idx, iso) {
    if (!iso || !billingStart) return
    const m = Math.min(120, diffMonths(billingStart, iso))
    update(idx, { startMonth: m })
  }
  function remove(idx) {
    setEventuais(prev => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setEventuais(prev => [...prev, { label: 'Implantação', total: '', installments: 1, startMonth: 1 }])
  }

  const totalEventuais = useMemo(
    () => eventuais.reduce((s, e) => s + (Number(e.total) || 0), 0),
    [eventuais],
  )
  const parcelado = eventuais.some(e => Number(e.installments) > 1)

  return (
    <div className="space-y-1.5 overflow-x-auto">
      {eventuais.length === 0 && (
        <p className="text-xs text-text-tertiary">Nenhuma cobrança eventual. Ex: implantação de R$ 15.000 em 3×.</p>
      )}

      {eventuais.length > 0 && (
        <div className={`${ROW} text-[11px] font-medium uppercase tracking-wide text-text-tertiary`}>
          <span>Descrição</span>
          <span>Valor total</span>
          <span>Data</span>
          <span>Início</span>
          <span>Parcelas</span>
          <span className="text-right">Por parcela</span>
          <span />
        </div>
      )}

      {eventuais.map((e, idx) => {
        const per = e.installments > 0 ? (Number(e.total) || 0) / Number(e.installments) : 0
        return (
          <div key={idx} className={ROW}>
            <input
              value={e.label}
              onChange={ev => update(idx, { label: ev.target.value })}
              placeholder="Implantação"
              className="input-base w-full disabled:opacity-50"
              disabled={readOnly}
            />
            <div className="flex items-center gap-1">
              <span className="w-4 text-xs text-text-tertiary">R$</span>
              <input
                type="number" step="0.01" min="0" value={e.total}
                onChange={ev => update(idx, { total: ev.target.value })}
                placeholder="15000"
                className="input-base w-full text-right disabled:opacity-50"
                disabled={readOnly}
              />
            </div>
            <input
              type="month"
              value={monthValue(e.startMonth ?? 1)}
              title="Mês da primeira parcela (define o mês de início)"
              onChange={ev => onDateChange(idx, ev.target.value ? `${ev.target.value}-01` : '')}
              disabled={readOnly || !billingStart}
              className="input-base w-full disabled:opacity-50"
            />
            <div className="flex flex-col gap-0.5">
              <input
                type="number" min="1" max="120" value={e.startMonth ?? 1}
                title="Mês de início (relativo à série)"
                onChange={ev => update(idx, { startMonth: Math.min(120, Math.max(1, Number(ev.target.value) || 1)) })}
                className="input-base w-full text-center disabled:opacity-50"
                disabled={readOnly}
              />
              {fullDate(e.startMonth ?? 1) && (
                <span className="text-[10px] text-text-tertiary text-center leading-none">
                  vence {fullDate(e.startMonth ?? 1)}{Number(e.installments) > 1 && fullDate((e.startMonth ?? 1) + Number(e.installments) - 1) ? ` → ${fullDate((e.startMonth ?? 1) + Number(e.installments) - 1)}` : ''}
                </span>
              )}
            </div>
            <input
              type="number" min="1" max="120" value={e.installments}
              onChange={ev => update(idx, { installments: Math.min(120, Math.max(1, Number(ev.target.value) || 1)) })}
              className="input-base w-full text-center disabled:opacity-50"
              disabled={readOnly}
            />
            <span className="text-right text-xs text-text-secondary">
              {e.total && e.installments ? `${formatBRL4(per)}` : '—'}
            </span>
            {!readOnly && (
              <button
                type="button" onClick={() => remove(idx)}
                className="inline-flex items-center justify-center h-8 w-8 rounded border border-border-tertiary text-text-tertiary hover:bg-bg-secondary hover:text-donc-red"
                aria-label="Remover cobrança"
              >
                <Icons.X size={14} />
              </button>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary">
          <Icons.Plus size={13} /> Adicionar cobrança eventual
        </button>
      )}

      {eventuais.length > 0 && (
        <p className="text-xs text-text-tertiary">
          Total: <span className="font-medium text-text-primary">{formatBRL4(totalEventuais)}</span>
          {parcelado && ` · parcelado a partir do mês ${Math.min(...eventuais.map(e => Number(e.startMonth) || 1))}`}
        </p>
      )}
    </div>
  )
}
