import { useState } from 'react'
import { Icons } from '../../lib/icons'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { InvoiceStateBadge } from '../ui/StateBadges'
import { EmptyState, ErrorState } from '../ui/StatusViews'
import { useBillingFaturas, useBillingComposicao, useCloseSeries } from '../../hooks/useBillingCockpit'
import { useBillingLancamentos } from '../../hooks/useBillingWrites'
import {
  SettleDialog, DiscountDialog, AdjustDialog, WriteOffDialog, ReverseDialog, CancelDialog, BRL,
} from './BillingWriteDialogs'

// Faturas de um cliente na competencia, com as acoes de escrita de cada uma.
// A regra de quando cada acao vale fica no banco; aqui so escondemos o que e
// claramente impossivel (fatura cancelada, saldo zero), para nao oferecer erro.

function brDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const METODO_LABEL = { pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro' }
const KIND_LABEL = { pagamento: 'Pagamento', desconto: 'Desconto', baixa: 'Baixa por perda', estorno: 'Estorno' }

export function FaturasDoCliente({ clientId, clientName, competencia, canWrite, seriesIds = [] }) {
  const faturas = useBillingFaturas(clientId, competencia)
  const [selecionadas, setSelecionadas] = useState([])
  const [dialogo, setDialogo] = useState(null) // { tipo, fatura?, faturas?, entry? }

  if (faturas.isPending) return <Spinner size="sm" />
  if (faturas.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar as faturas deste cliente."
        message={faturas.error?.message}
        onRetry={() => faturas.refetch()}
      />
    )
  }

  const rows = faturas.data || []
  if (rows.length === 0) {
    return <FecharSoEsteCliente clientName={clientName} competencia={competencia} canWrite={canWrite} seriesIds={seriesIds} />
  }

  const abertas = rows.filter(f => f.state !== 'cancelada' && Number(f.balance) > 0)
  const selecionadasObj = abertas.filter(f => selecionadas.includes(f.invoice_id))
  const fechar = () => setDialogo(null)
  const temEventualNaSerie = (f) => rows.some(r => r.kind === 'eventual' && r.series_id === f.series_id)
  // Selecao so faz sentido com 2 ou mais faturas abertas para distribuir um desconto.
  const podeSelecionar = canWrite && abertas.length >= 2

  function alternar(id) {
    setSelecionadas(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  return (
    <div className="flex flex-col gap-3">
      {podeSelecionar && selecionadasObj.length < 2 && (
        <span className="text-xs text-text-secondary">Marque duas ou mais faturas abertas para distribuir um desconto entre elas.</span>
      )}
      {podeSelecionar && selecionadasObj.length >= 2 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border-tertiary bg-bg-primary px-3 py-2 text-sm">
          <span>{selecionadasObj.length} faturas selecionadas</span>
          <Button variant="secondary" size="sm" onClick={() => setDialogo({ tipo: 'desconto', faturas: selecionadasObj })}>
            Distribuir desconto
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map(f => {
          const cancelada = f.state === 'cancelada'
          const aberta = !cancelada && Number(f.balance) > 0
          const liquidado = Number(f.amount) - Number(f.balance)
          return (
            <li key={f.invoice_id} className="rounded-md border border-border-tertiary bg-bg-primary px-3 py-2 text-sm flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {podeSelecionar && aberta && (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${f.number} para distribuir desconto`}
                    checked={selecionadas.includes(f.invoice_id)}
                    onChange={() => alternar(f.invoice_id)}
                  />
                )}
                <InvoiceStateBadge state={f.state} />
                <span className="font-medium text-text-primary">{f.number}</span>
                <span className="text-text-secondary">
                  {f.kind === 'eventual'
                    ? `Eventual${f.installments_total ? ` · parcela ${f.installment_no} de ${f.installments_total}` : ''}`
                    : 'Recorrência'}
                </span>
                <span className="text-text-secondary">vence {brDate(f.due_date)}</span>
                <span className="tabular-nums text-text-primary">Valor {BRL.format(Number(f.amount))}</span>
                <span className="tabular-nums text-text-primary">Saldo {BRL.format(Number(f.balance))}</span>
                {f.last_settlement && <span className="text-text-secondary">último lançamento {brDate(f.last_settlement)}</span>}
              </div>

              {f.kind === 'recorrencia' && <Composicao invoiceId={f.invoice_id} />}

              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  {aberta && <Button variant="primary" size="xs" onClick={() => setDialogo({ tipo: 'baixa', fatura: f })}>Registrar baixa</Button>}
                  {aberta && <Button variant="secondary" size="xs" onClick={() => setDialogo({ tipo: 'desconto', faturas: [f] })}>Desconto</Button>}
                  {aberta && <Button variant="warning" size="xs" onClick={() => setDialogo({ tipo: 'perda', fatura: f })}>Baixa por perda</Button>}
                  {!cancelada && <Button variant="secondary" size="xs" onClick={() => setDialogo({ tipo: 'ajuste', fatura: f })}>Ajustar valor</Button>}
                  {!cancelada && liquidado === 0 && <Button variant="danger" size="xs" onClick={() => setDialogo({ tipo: 'cancelar', fatura: f })}>Cancelar fatura</Button>}
                </div>
              )}

              <Lancamentos
                invoiceId={f.invoice_id}
                canWrite={canWrite}
                onEstornar={(entry) => setDialogo({ tipo: 'estorno', entry })}
              />
            </li>
          )
        })}
      </ul>

      <SettleDialog
        open={dialogo?.tipo === 'baixa'}
        onClose={fechar}
        invoice={dialogo?.fatura}
        competencia={competencia}
      />
      <DiscountDialog
        open={dialogo?.tipo === 'desconto'}
        onClose={fechar}
        invoices={dialogo?.faturas || []}
        competencia={competencia}
      />
      <WriteOffDialog
        open={dialogo?.tipo === 'perda'}
        onClose={fechar}
        invoice={dialogo?.fatura}
        competencia={competencia}
      />
      <AdjustDialog
        open={dialogo?.tipo === 'ajuste'}
        onClose={fechar}
        invoice={dialogo?.fatura}
        competencia={competencia}
      />
      <CancelDialog
        open={dialogo?.tipo === 'cancelar'}
        onClose={fechar}
        invoice={dialogo?.fatura}
        clientName={clientName}
        competencia={competencia}
        seriesId={dialogo?.fatura?.series_id}
        temEventual={dialogo?.fatura ? temEventualNaSerie(dialogo.fatura) : false}
      />
      <ReverseDialog
        open={dialogo?.tipo === 'estorno'}
        onClose={fechar}
        entry={dialogo?.entry}
        competencia={competencia}
      />
    </div>
  )
}

// Composicao da recorrencia (SDD §3.2): base da faixa mais excedente do uso.
function Composicao({ invoiceId }) {
  const comp = useBillingComposicao(invoiceId)
  if (comp.isPending || !comp.data) return null
  const c = comp.data
  const excedente = Number(c.excedente || 0)
  return (
    <span className="text-xs text-text-secondary">
      Base {BRL.format(Number(c.base))}
      {excedente > 0 && <> + excedente {BRL.format(excedente)}</>}
      {' '}· uso {c.uso} {c.uso === 1 ? 'licença' : 'licenças'}, piso {c.piso}, {BRL.format(Number(c.unit))} por licença
    </span>
  )
}

// Competencia sem fatura para o cliente: pode fechar so ele (SDD §4.2, por serie).
function FecharSoEsteCliente({ clientName, competencia, canWrite, seriesIds }) {
  const [aberto, setAberto] = useState(false)
  const fechar = useCloseSeries()
  const podeFechar = canWrite && seriesIds.length > 0

  const resultado = fechar.data || []
  const emitidas = resultado.filter(r => r.outcome === 'emitida').length
  const puladas = resultado.filter(r => r.outcome === 'pulada')
  const motivosPuladas = [...new Set(puladas.map(r => r.reason))].join(', ')

  return (
    <div className="flex flex-col gap-3">
      <EmptyState reason="Sem fatura" title="Nenhuma fatura nesta competência" />
      {podeFechar && (
        <div>
          <Button variant="secondary" size="sm" onClick={() => { fechar.reset(); setAberto(true) }}>
            Fechar só este cliente
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={aberto}
        onClose={() => setAberto(false)}
        title={`Fechar ${competencia} só para ${clientName}?`}
        description="Emite as faturas deste cliente nesta competência. As demais continuam como estão."
        requireReason={false}
        variant="warning"
        confirmLabel={fechar.isSuccess ? 'Concluído' : 'Emitir só este cliente'}
        cancelLabel={fechar.isSuccess ? 'Fechar' : 'Voltar'}
        busy={fechar.isPending}
        onConfirm={() => (fechar.isSuccess
          ? setAberto(false)
          : fechar.mutate({ competencia, seriesIds }))}
        summary={
          fechar.isSuccess ? (
            <span>Emitidas: {emitidas}. {puladas.length > 0 ? `Puladas: ${puladas.length} (${motivosPuladas}).` : ''}</span>
          ) : fechar.isError ? (
            <span className="text-status-red-text">Não foi possível fechar: {fechar.error?.message}</span>
          ) : null
        }
      />
    </div>
  )
}

// Lancamentos de uma fatura, abertos sob demanda. Estorno so onde o banco aceita.
function Lancamentos({ invoiceId, canWrite, onEstornar }) {
  const [aberto, setAberto] = useState(false)
  const lanc = useBillingLancamentos(invoiceId, aberto)

  return (
    <div>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto(v => !v)}
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:underline"
      >
        {aberto ? <Icons.ChevronDown size={12} aria-hidden="true" /> : <Icons.ChevronRight size={12} aria-hidden="true" />}
        Lançamentos
      </button>

      {aberto && (
        <div className="mt-2">
          {lanc.isPending && <Spinner size="sm" />}
          {lanc.isError && <ErrorState title="Não foi possível carregar os lançamentos." message={lanc.error?.message} onRetry={() => lanc.refetch()} />}
          {lanc.isSuccess && (lanc.data || []).length === 0 && (
            <span className="text-xs text-text-secondary">Nenhum lançamento.</span>
          )}
          {lanc.isSuccess && (lanc.data || []).length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-text-secondary">
                <tr>
                  <th scope="col" className="text-left py-1 font-semibold">Data</th>
                  <th scope="col" className="text-left py-1 font-semibold">Tipo</th>
                  <th scope="col" className="text-left py-1 font-semibold">Detalhe</th>
                  <th scope="col" className="text-right py-1 font-semibold">Valor</th>
                  {canWrite && <th scope="col" className="py-1" />}
                </tr>
              </thead>
              <tbody>
                {lanc.data.map(e => (
                  <tr key={e.entry_id} className="border-t border-border-tertiary">
                    <td className="py-1">{brDate(e.happened_at)}</td>
                    <td className="py-1">{e.reverses_id ? 'Estorno' : (KIND_LABEL[e.kind] || e.kind)}</td>
                    <td className="py-1 text-text-secondary">
                      {e.kind === 'pagamento' && e.method ? METODO_LABEL[e.method] || e.method : ''}
                      {e.reason ? ` ${e.reason}` : ''}
                    </td>
                    <td className="py-1 text-right tabular-nums">{BRL.format(Number(e.amount))}</td>
                    {canWrite && (
                      <td className="py-1 text-right">
                        {e.reversible && (
                          <Button variant="ghost" size="xs" onClick={() => onEstornar(e)}>Estornar</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
