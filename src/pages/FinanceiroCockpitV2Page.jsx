import { Fragment, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import {
  useBillingClientes, useBillingMotivos, useBillingFaturas,
  useClosePreview, useCloseCompetencia,
} from '../hooks/useBillingCockpit'
import { Icons } from '../lib/icons'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { InvoiceStateBadge, MotivoBadge } from '../components/ui/StateBadges'
import { EmptyState, ErrorState, ReadOnlyBanner } from '../components/ui/StatusViews'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function brDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Ultimos 12 meses, o corrente primeiro. Sem meses futuros (SDD §1.8).
function competenciaOptions() {
  const out = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// Motivo e projecao por cliente, a partir das linhas por serie do preview.
function resumoPorCliente(motivos) {
  const map = new Map()
  for (const r of motivos) {
    const cur = map.get(r.client_id) || { motivo: null, projecao: 0 }
    if (r.outcome === 'emitiria') cur.projecao += Number(r.amount || 0)
    else if (r.outcome === 'pulada' && !cur.motivo) cur.motivo = r.reason
    map.set(r.client_id, cur)
  }
  return map
}

export default function FinanceiroCockpitV2Page() {
  const { effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const canWrite = isEnabled('financeiro_cockpit_write', effectiveRole)

  const opcoes = useMemo(competenciaOptions, [])
  const [competencia, setCompetencia] = useState(opcoes[0])
  const [expandido, setExpandido] = useState(null)
  const [fechando, setFechando] = useState(false)

  const clientes = useBillingClientes(competencia)
  const motivos = useBillingMotivos(competencia, canWrite)
  const preview = useClosePreview()
  const fechar = useCloseCompetencia()

  const resumo = useMemo(() => resumoPorCliente(motivos.data || []), [motivos.data])
  const lista = clientes.data || []

  const totais = useMemo(() => ({
    clientes: lista.length,
    comFatura: lista.filter(c => c.estado === 'com_fatura').length,
    semFatura: lista.filter(c => c.estado === 'sem_fatura').length,
    saldo: lista.reduce((s, c) => s + Number(c.saldo_aberto || 0), 0),
  }), [lista])

  function abrirFechamento() {
    setFechando(true)
    preview.reset()
    fechar.reset()
    preview.mutate(competencia)
  }

  const previewResumo = useMemo(() => {
    const rows = preview.data || []
    const emitiria = rows.filter(r => r.outcome === 'emitiria')
    const puladas = rows.filter(r => r.outcome === 'pulada')
    return {
      emitiria: emitiria.length,
      valor: emitiria.reduce((s, r) => s + Number(r.amount || 0), 0),
      puladas: puladas.length,
    }
  }, [preview.data])

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      <PageHeader
        title="Faturamento"
        subtitle="Cockpit novo, em teste. A página atual segue em uso."
        action={
          <select
            aria-label="Competência"
            value={competencia}
            onChange={e => { setCompetencia(e.target.value); setExpandido(null) }}
            className="text-sm rounded-md border border-border-secondary px-2 py-1.5 bg-bg-primary"
          >
            {opcoes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        }
      />

      {!canWrite && (
        <ReadOnlyBanner reason="Seu perfil vê as faturas, mas não fecha competência nem lança pagamentos." />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador titulo="Clientes" valor={totais.clientes} />
        <Indicador titulo="Com fatura" valor={totais.comFatura} />
        <Indicador titulo="Sem fatura" valor={totais.semFatura} />
        <Indicador titulo="Saldo em aberto" valor={BRL.format(totais.saldo)} />
      </div>

      {canWrite && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={abrirFechamento}>
            <Icons.Check size={14} aria-hidden="true" />
            Fechar competência
          </Button>
        </div>
      )}

      {clientes.isPending && <div className="py-10 flex justify-center"><Spinner /></div>}

      {clientes.isError && (
        <ErrorState
          title="Não foi possível carregar o cockpit."
          message={clientes.error?.message}
          onRetry={() => clientes.refetch()}
        />
      )}

      {clientes.isSuccess && lista.length === 0 && (
        <EmptyState
          reason="Sem clientes"
          title="Nenhum cliente com série ativa nesta competência"
          description="Clientes entram aqui quando têm uma série ativa de cliente."
        />
      )}

      {clientes.isSuccess && lista.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-tertiary">
          <table className="w-full text-sm">
            <thead className="bg-donc-navy text-white text-xs uppercase">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Cliente</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Situação</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">Saldo em aberto</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">Faturas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(c => {
                const aberto = expandido === c.client_id
                const r = resumo.get(c.client_id)
                return (
                  <Fragment key={c.client_id}>
                    <tr className="border-t border-border-tertiary">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={aberto}
                          onClick={() => setExpandido(aberto ? null : c.client_id)}
                          className="inline-flex items-center gap-2 text-left font-medium text-text-primary hover:underline"
                        >
                          {aberto ? <Icons.ChevronDown size={14} aria-hidden="true" /> : <Icons.ChevronRight size={14} aria-hidden="true" />}
                          {c.client_name}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {c.estado === 'com_fatura'
                          ? <InvoiceStateBadge state={Number(c.n_em_aberto) > 0 ? 'aberta' : 'quitada'} />
                          : canWrite
                            ? (r?.motivo
                                ? <MotivoBadge motivo={r.motivo} />
                                : <span className="text-xs text-text-secondary">Sem fatura</span>)
                            : <span className="text-xs text-text-secondary">Sem fatura</span>}
                        {c.estado === 'sem_fatura' && canWrite && r?.projecao > 0 && (
                          <span className="block text-xs text-text-secondary mt-1">Projeção {BRL.format(r.projecao)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{BRL.format(Number(c.saldo_aberto || 0))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.estado === 'com_fatura' ? `${c.n_em_aberto} de ${c.m_faturas}` : '—'}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="bg-bg-secondary border-t border-border-tertiary">
                        <td colSpan={4} className="px-3 py-3">
                          <FaturasDoCliente clientId={c.client_id} competencia={competencia} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={fechando}
        title={`Fechar competência ${competencia}?`}
        description="O motor emite as faturas do mês e registra cada decisão no log. Rode de novo e nada é emitido duas vezes."
        requireReason={false}
        variant="warning"
        confirmLabel={fechar.isSuccess ? 'Concluído' : 'Emitir faturas'}
        cancelLabel={fechar.isSuccess ? 'Fechar' : 'Voltar'}
        busy={fechar.isPending}
        onConfirm={() => fechar.mutate(competencia)}
        onClose={() => setFechando(false)}
        summary={
          preview.isPending ? <Spinner size="sm" /> :
          preview.isError ? <span className="text-status-red-text">Não foi possível calcular a prévia: {preview.error?.message}</span> :
          fechar.isSuccess ? <span>Emitidas: {(fechar.data || []).filter(r => r.outcome === 'emitida').length}. Já existentes: {(fechar.data || []).filter(r => r.outcome === 'ja_emitida').length}.</span> :
          preview.isSuccess ? (
            <span>
              Vai emitir <strong>{previewResumo.emitiria}</strong> fatura(s), somando <strong>{BRL.format(previewResumo.valor)}</strong>.
              {' '}Pulam <strong>{previewResumo.puladas}</strong> série(s).
            </span>
          ) : null
        }
      />
    </div>
  )
}

function Indicador({ titulo, valor }) {
  return (
    <div className="rounded-lg border border-border-tertiary bg-bg-primary p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{titulo}</div>
      <div className="mt-1 text-lg font-semibold text-text-primary tabular-nums">{valor}</div>
    </div>
  )
}

function FaturasDoCliente({ clientId, competencia }) {
  const faturas = useBillingFaturas(clientId, competencia)

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
    return <EmptyState reason="Sem fatura" title="Nenhuma fatura nesta competência" />
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map(f => (
        <li key={f.invoice_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border-tertiary bg-bg-primary px-3 py-2 text-sm">
          <InvoiceStateBadge state={f.state} />
          <span className="font-medium text-text-primary">{f.number}</span>
          <span className="text-text-secondary">
            {f.kind === 'eventual'
              ? `Eventual${f.installments_total ? ` · parcela ${f.installment_no} de ${f.installments_total}` : ''}`
              : 'Recorrência'}
          </span>
          <span className="text-text-secondary">vence {brDate(f.due_date)}</span>
          <span className="tabular-nums text-text-primary">Saldo {BRL.format(Number(f.balance || 0))}</span>
          {f.last_settlement && <span className="text-text-secondary">último lançamento {brDate(f.last_settlement)}</span>}
        </li>
      ))}
    </ul>
  )
}
