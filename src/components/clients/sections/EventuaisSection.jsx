import { useMemo } from 'react'
import { formatBRL4 } from '@/lib/contractRules'
import { Icons } from '@/lib/icons'

const ROW = 'grid grid-cols-[1fr_9rem_7.5rem_9rem_2rem] items-center gap-2 min-w-[34rem]'

/**
 * "Cobranças Eventuais" — one-off charges (implantação, setup, treinamento),
 * optionally split into installments. Business language only.
 * Parent wraps this in a <FormSection>.
 */
export function EventuaisSection({ eventuais, setEventuais }) {
  function update(idx, patch) {
    setEventuais(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function remove(idx) {
    setEventuais(prev => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setEventuais(prev => [...prev, { label: 'Implantação', total: '', installments: 1 }])
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
              className="input-base w-full"
            />
            <div className="flex items-center gap-1">
              <span className="w-4 text-xs text-text-tertiary">R$</span>
              <input
                type="number" step="0.01" min="0" value={e.total}
                onChange={ev => update(idx, { total: ev.target.value })}
                placeholder="15000"
                className="input-base w-full text-right"
              />
            </div>
            <input
              type="number" min="1" max="120" value={e.installments}
              onChange={ev => update(idx, { installments: Math.min(120, Math.max(1, Number(ev.target.value) || 1)) })}
              className="input-base w-full text-center"
            />
            <span className="text-right text-xs text-text-secondary">
              {e.total && e.installments ? `${formatBRL4(per)}` : '—'}
            </span>
            <button
              type="button" onClick={() => remove(idx)}
              className="inline-flex items-center justify-center h-8 w-8 rounded border border-border-tertiary text-text-tertiary hover:bg-bg-secondary hover:text-donc-red"
              aria-label="Remover cobrança"
            >
              <Icons.X size={14} />
            </button>
          </div>
        )
      })}

      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary">
        <Icons.Plus size={13} /> Adicionar cobrança eventual
      </button>

      {eventuais.length > 0 && (
        <p className="text-xs text-text-tertiary">
          Total: <span className="font-medium text-text-primary">{formatBRL4(totalEventuais)}</span>
          {parcelado && ' · parcelado a partir do início do contrato'}
        </p>
      )}
    </div>
  )
}
