import { useMemo } from 'react'
import { formatBRL4 } from '@/lib/contractRules'

export function EventuaisSection({ eventuais, setEventuais }) {
  function update(idx, patch) {
    setEventuais(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }
  function remove(idx) {
    setEventuais(prev => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setEventuais(prev => [...prev, { label: 'Implantação', total: '', installments: 1 }])
  }

  const totalEventuais = useMemo(() => eventuais.reduce((s, e) => s + (Number(e.total) || 0), 0), [eventuais])

  return (
    <div className="border border-border-tertiary rounded-lg overflow-hidden">
      <div className="bg-bg-secondary px-3 py-2 border-b border-border-tertiary">
        <p className="text-sm font-medium text-text-primary">Valores eventuais (ex: implantação)</p>
        <p className="text-xs text-text-tertiary">Cobrança única com parcelamento próprio. Gera <code>contract_charges kind=implantacao</code> com <code>installment_group</code>.</p>
      </div>
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-1">
          <span className="col-span-4">Descrição</span>
          <span className="col-span-3">Total R$</span>
          <span className="col-span-2">Parcelas</span>
          <span className="col-span-2">R$/parcela</span>
          <span className="col-span-1">Ações</span>
        </div>

        {eventuais.length === 0 && (
          <p className="text-xs text-text-tertiary px-1">Nenhum eventual. Ex: Implantação R$15.000 em 3×.</p>
        )}

        {eventuais.map((e, idx) => {
          const per = e.installments > 0 ? (Number(e.total) || 0) / Number(e.installments) : 0
          return (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <input value={e.label} onChange={ev => update(idx, { label: ev.target.value })} placeholder="Implantação" className="input-base col-span-4" />
              <div className="col-span-3 flex items-center gap-1">
                <span className="text-xs text-text-tertiary">R$</span>
                <input type="number" step="0.01" min="0" value={e.total} onChange={ev => update(idx, { total: ev.target.value })} placeholder="15000" className="input-base flex-1 text-right" />
              </div>
              <input type="number" min="1" max="120" value={e.installments} onChange={ev => {
                let v = Math.min(120, Math.max(1, Number(ev.target.value) || 1))
                update(idx, { installments: v })
              }} className="input-base col-span-2 text-center" />
              <div className="col-span-2 text-xs font-medium text-donc-navy bg-bg-secondary border border-border-tertiary rounded px-2 py-1.5 text-center">
                {e.total && e.installments ? formatBRL4(per) : '—'}
              </div>
              <div className="col-span-1 flex justify-center">
                <button type="button" onClick={() => remove(idx)} className="px-2 py-1.5 text-xs border border-border-tertiary rounded hover:bg-bg-secondary">✕</button>
              </div>
            </div>
          )
        })}

        <button type="button" onClick={add} className="px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary">+ Adicionar eventual</button>

        {eventuais.length > 0 && (
          <p className="text-xs text-text-tertiary bg-bg-secondary rounded px-2 py-1">
            Total eventuais: <span className="font-medium text-text-primary">{formatBRL4(totalEventuais)}</span>
            {eventuais.some(e => Number(e.installments) > 1) && ' · parcelado conforme acima (1ª parcela mês 1)'}
          </p>
        )}
      </div>
    </div>
  )
}
