import { useMemo } from 'react'
import { formatBRL4, diffMonths } from '@/lib/contractRules'
import { Icons } from '@/lib/icons'

const ROW = 'grid grid-cols-[16rem_8rem_9rem_6rem_1fr_2rem] items-center gap-2 min-w-[49rem]'

/**
 * "Cobranças Eventuais" — one-off charges (implantação, setup, treinamento),
 * optionally split into installments starting at a user-chosen date.
 * The date input is primary; startMonth (relative to the series) derives from it.
 * Parent wraps this in a <FormSection>.
 */
export function EventuaisSection({ eventuais, setEventuais, readOnly = false, billingStart = null }) {
  // Mês de início deriva da data (fonte de verdade); sem data, usa o mês guardado
  function startMonthOf(e) {
    if (e.startDate && billingStart) {
      try { return diffMonths(billingStart, e.startDate) } catch { /* fallback abaixo */ }
    }
    return Number(e.startMonth) || 1
  }
  function update(idx, patch) {
    setEventuais(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function remove(idx) {
    setEventuais(prev => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setEventuais(prev => [...prev, { label: 'Implantação', total: '', installments: 1, startMonth: 1, startDate: billingStart || '' }])
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
              type="date"
              value={e.startDate || ''}
              title="Data da primeira parcela"
              onChange={ev => update(idx, { startDate: ev.target.value })}
              disabled={readOnly}
              className="input-base w-full disabled:opacity-50"
            />
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
          {parcelado && ` · parcelado a partir do mês ${Math.min(...eventuais.map(startMonthOf))}`}
        </p>
      )}
    </div>
  )
}
