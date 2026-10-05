import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useSettle, useDiscount, useDiscountBatch, useWriteOff, useReverse, useAdjust, useCancel } from '../../hooks/useBillingWrites'

// Diálogos de escrita do cockpit novo (SDD §4.3 a §4.7). Cada um valida o que
// pode ser validado na tela; o banco continua sendo a autoridade e a mensagem
// que ele devolve aparece no proprio diálogo.

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const METODOS = [
  ['pix', 'Pix'], ['boleto', 'Boleto'], ['transferencia', 'Transferência'],
  ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro'],
]

const hojeIso = () => new Date().toISOString().slice(0, 10)

function Erro({ error }) {
  if (!error) return null
  return <p role="alert" className="text-sm text-status-red-text">{error.message}</p>
}

function Campo({ id, label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-text-primary">{label}</label>
      {children}
      {hint && <span className="text-xs text-text-secondary">{hint}</span>}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-md border border-border-secondary bg-bg-primary focus:outline-2 focus:outline-donc-blue'

// ---------------------------------------------------------------------------
// Baixa (pagamento)
// ---------------------------------------------------------------------------
export function SettleDialog({ open, onClose, invoice, competencia }) {
  const [amount, setAmount] = useState('')
  const [data, setData] = useState(hojeIso())
  const [metodo, setMetodo] = useState('pix')
  const [ref, setRef] = useState('')
  const settle = useSettle(competencia)

  useEffect(() => {
    if (open && invoice) { setAmount(String(Number(invoice.balance).toFixed(2))); setData(hojeIso()); setMetodo('pix'); setRef(''); settle.reset() }
  }, [open, invoice?.invoice_id])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null
  const valor = parseFloat(amount)
  const invalido = !(valor > 0) || valor > Number(invoice.balance) + 1e-9

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Registrar baixa · ${invoice.number}`}
      description={`Saldo em aberto: ${BRL.format(Number(invoice.balance))}. Pagamento parcial é permitido; valor acima do saldo é recusado.`}
      requireReason={false}
      variant="primary"
      confirmLabel="Registrar baixa"
      busy={settle.isPending}
      onConfirm={() => settle.mutate(
        { invoiceId: invoice.invoice_id, amount: valor, happenedAt: data, method: metodo, externalRef: ref },
        { onSuccess: onClose },
      )}
    >
      <div className="flex flex-col gap-3">
        <Erro error={settle.error} />
        <Campo id="baixa-valor" label="Valor recebido (R$)">
          <input id="baixa-valor" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} aria-invalid={invalido || undefined} />
        </Campo>
        <Campo id="baixa-data" label="Data do pagamento">
          <input id="baixa-data" type="date" value={data} onChange={e => setData(e.target.value)} className={inputCls} />
        </Campo>
        <Campo id="baixa-metodo" label="Forma de pagamento">
          <select id="baixa-metodo" value={metodo} onChange={e => setMetodo(e.target.value)} className={inputCls}>
            {METODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo id="baixa-ref" label="Referência bancária (opcional)">
          <input id="baixa-ref" type="text" value={ref} onChange={e => setRef(e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </ConfirmDialog>
  )
}

// ---------------------------------------------------------------------------
// Desconto: aplicar numa fatura, ou distribuir entre as selecionadas
// ---------------------------------------------------------------------------
export function DiscountDialog({ open, onClose, invoices = [], competencia }) {
  const [modo, setModo] = useState('aplicar')
  const [valor, setValor] = useState('')
  const aplicar = useDiscount(competencia)
  const distribuir = useDiscountBatch(competencia)
  const single = invoices.length === 1 ? invoices[0] : null
  const saldoTotal = invoices.reduce((s, f) => s + Number(f.balance || 0), 0)

  useEffect(() => {
    if (open) { setModo(invoices.length === 1 ? 'aplicar' : 'distribuir'); setValor(''); aplicar.reset(); distribuir.reset() }
  }, [open, invoices.length])  // eslint-disable-line react-hooks/exhaustive-deps

  if (invoices.length === 0) return null
  const n = parseFloat(valor)
  const ok = n > 0 && (modo === 'aplicar' ? n <= Number(single?.balance || 0) + 1e-9 : n <= saldoTotal + 1e-9)
  const pending = aplicar.isPending || distribuir.isPending
  const erro = aplicar.error || distribuir.error

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={modo === 'aplicar' && single ? `Desconto · ${single.number}` : `Desconto em ${invoices.length} faturas`}
      description={modo === 'distribuir'
        ? `O valor é distribuído em proporção ao saldo de cada fatura, sem passar do saldo de nenhuma. Saldo somado: ${BRL.format(saldoTotal)}.`
        : `Saldo desta fatura: ${BRL.format(Number(single?.balance || 0))}.`}
      reasonLabel="Motivo do desconto"
      reasonHint="Fica na fatura e na auditoria."
      variant="primary"
      confirmLabel="Aplicar desconto"
      busy={pending}
      onConfirm={({ reason }) => {
        const done = { onSuccess: onClose }
        if (modo === 'aplicar' && single) aplicar.mutate({ invoiceId: single.invoice_id, amount: n, reason }, done)
        else distribuir.mutate({ invoiceIds: invoices.map(f => f.invoice_id), total: n, reason }, done)
      }}
    >
      <div className="flex flex-col gap-3">
        <Erro error={erro} />
        {invoices.length > 1 && (
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Modo do desconto</legend>
            <label className="flex items-center gap-2"><input type="radio" name="modo" checked={modo === 'distribuir'} onChange={() => setModo('distribuir')} />Distribuir</label>
            <label className="flex items-center gap-2"><input type="radio" name="modo" checked={modo === 'aplicar'} onChange={() => setModo('aplicar')} />Aplicar numa fatura</label>
          </fieldset>
        )}
        <Campo id="desc-valor" label="Valor do desconto (R$)" hint={!ok && valor ? 'Acima do saldo disponível.' : null}>
          <input id="desc-valor" type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} className={inputCls} aria-invalid={!ok && valor ? 'true' : undefined} />
        </Campo>
        {!ok && valor === '' && <span className="text-xs text-text-secondary">Informe um valor positivo.</span>}
      </div>
    </ConfirmDialog>
  )
}

// ---------------------------------------------------------------------------
// Ajuste de valor (valor faturado diferente do devido)
// ---------------------------------------------------------------------------
export function AdjustDialog({ open, onClose, invoice, competencia }) {
  const [novo, setNovo] = useState('')
  const adjust = useAdjust(competencia)

  useEffect(() => {
    if (open && invoice) { setNovo(String(Number(invoice.amount).toFixed(2))); adjust.reset() }
  }, [open, invoice?.invoice_id])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null
  const atual = Number(invoice.amount)
  const liquidado = atual - Number(invoice.balance)
  const valor = parseFloat(novo)
  const abaixo = valor < liquidado - 1e-9

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Ajustar valor · ${invoice.number}`}
      description="Use quando o valor faturado diferente do devido. Não existe crédito: pagamento a maior não é aceito."
      reasonLabel="Motivo do ajuste"
      reasonHint="Fica registrado na auditoria, com o valor de antes."
      variant="warning"
      confirmLabel="Ajustar valor"
      busy={adjust.isPending}
      onConfirm={({ reason }) => adjust.mutate({ invoiceId: invoice.invoice_id, newAmount: valor, reason }, { onSuccess: onClose })}
    >
      <div className="flex flex-col gap-3">
        <Erro error={adjust.error} />
        <div className="rounded-md border border-border-tertiary bg-bg-secondary p-3 text-sm">
          <span className="text-text-secondary">De</span> <strong>{BRL.format(atual)}</strong>
          {' '}<span className="text-text-secondary">para</span>{' '}
          <strong>{Number.isFinite(valor) ? BRL.format(valor) : '—'}</strong>
          {liquidado > 0 && <span className="block text-xs text-text-secondary mt-1">Já liquidado: {BRL.format(liquidado)}. O novo valor não pode ficar abaixo disso.</span>}
        </div>
        <Campo id="ajuste-valor" label="Novo valor (R$)" hint={abaixo ? 'Abaixo do que já foi liquidado.' : null}>
          <input id="ajuste-valor" type="number" step="0.01" min="0" value={novo} onChange={e => setNovo(e.target.value)} className={inputCls} aria-invalid={abaixo || undefined} />
        </Campo>
      </div>
    </ConfirmDialog>
  )
}

// ---------------------------------------------------------------------------
// Baixa por perda (incobravel)
// ---------------------------------------------------------------------------
export function WriteOffDialog({ open, onClose, invoice, competencia }) {
  const [valor, setValor] = useState('')
  const writeOff = useWriteOff(competencia)

  useEffect(() => {
    if (open && invoice) { setValor(String(Number(invoice.balance).toFixed(2))); writeOff.reset() }
  }, [open, invoice?.invoice_id])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null
  const n = parseFloat(valor)
  const invalido = !(n > 0) || n > Number(invoice.balance) + 1e-9

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Baixa por perda · ${invoice.number}`}
      description="Para dívida que não será recebida. Fica separada de desconto, para a estatística de inadimplência não sumir."
      reasonLabel="Motivo da perda"
      variant="warning"
      confirmLabel="Dar baixa por perda"
      busy={writeOff.isPending}
      onConfirm={({ reason }) => writeOff.mutate({ invoiceId: invoice.invoice_id, amount: n, reason }, { onSuccess: onClose })}
    >
      <div className="flex flex-col gap-3">
        <Erro error={writeOff.error} />
        <Campo id="perda-valor" label="Valor a dar como perda (R$)" hint={invalido ? 'Acima do saldo em aberto.' : null}>
          <input id="perda-valor" type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} className={inputCls} aria-invalid={invalido || undefined} />
        </Campo>
      </div>
    </ConfirmDialog>
  )
}

// ---------------------------------------------------------------------------
// Estorno de um lancamento
// ---------------------------------------------------------------------------
export function ReverseDialog({ open, onClose, entry, competencia }) {
  const reverse = useReverse(competencia)
  if (!entry) return null
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Estornar lançamento"
      description={`Estorna ${BRL.format(Number(entry.amount))} (${entry.kind}). O lançamento original fica no histórico; o estorno é um lançamento novo.`}
      reasonLabel="Motivo do estorno"
      variant="warning"
      confirmLabel="Estornar"
      busy={reverse.isPending}
      onConfirm={({ reason }) => reverse.mutate({ entryId: entry.entry_id, reason }, { onSuccess: onClose })}
    >
      <Erro error={reverse.error} />
    </ConfirmDialog>
  )
}

// ---------------------------------------------------------------------------
// Cancelamento de fatura, com substituta opcional (so recorrencia)
// ---------------------------------------------------------------------------
export function CancelDialog({ open, onClose, invoice, clientName, competencia, seriesId, temEventual }) {
  const [substituta, setSubstituta] = useState(false)
  const cancel = useCancel(competencia)
  const isRecorrencia = invoice?.kind === 'recorrencia'

  useEffect(() => {
    if (open) { setSubstituta(isRecorrencia && !temEventual); cancel.reset() }
  }, [open, invoice?.invoice_id])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Cancelar ${invoice.number}?`}
      description="A fatura sai do que está em aberto. Pagamentos já lançados impedem o cancelamento: estorne antes."
      reasonLabel="Motivo do cancelamento"
      reasonHint="Fica registrado na auditoria."
      variant="danger"
      confirmLabel="Cancelar fatura"
      busy={cancel.isPending}
      onConfirm={({ reason }) => cancel.mutate(
        { invoiceId: invoice.invoice_id, reason, substituta: substituta && isRecorrencia, seriesId },
        { onSuccess: onClose },
      )}
      summary={
        <div className="flex flex-col gap-1">
          <div><span className="text-text-secondary">Cliente</span> <strong>{clientName}</strong></div>
          <div><span className="text-text-secondary">Competência</span> {competencia}</div>
          <div><span className="text-text-secondary">Valor</span> <strong>{BRL.format(Number(invoice.amount))}</strong></div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Erro error={cancel.error} />
        {isRecorrencia ? (
          <label className="flex items-start gap-2 text-sm text-text-primary">
            <input type="checkbox" className="mt-0.5" checked={substituta} onChange={e => setSubstituta(e.target.checked)} />
            <span>
              Emitir a substituta para esta competência
              <span className="block text-xs text-text-secondary">
                {temEventual
                  ? 'Desmarcado: esta competência tem parcela eventual e a reemissão a reavaliaria.'
                  : 'O motor recalcula o valor pelo uso atual; pode diferir do cancelado.'}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-text-secondary">Parcela eventual: cancelar não reemite. Para trocar o valor, use Ajustar.</p>
        )}
      </div>
    </ConfirmDialog>
  )
}
