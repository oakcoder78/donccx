import { Fragment, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import {
  useBillingClientes, useBillingMotivos,
  useClosePreview, useCloseCompetencia,
} from '../hooks/useBillingCockpit'
import { Icons } from '../lib/icons'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { MotivoBadge } from '../components/ui/StateBadges'
import { EmptyState, ErrorState, ReadOnlyBanner } from '../components/ui/StatusViews'
import { ClienteDetalhe } from '../components/billing/ClienteDetalhe'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_LABEL = { por_licenca: 'Por licença', por_os: 'Por OS', os: 'Por OS', licenca: 'Por licença', fixo: 'Fixo' }

// Tons dos selos, com os tokens status.* do projeto. Cor nunca e a unica
// informacao: o texto do selo ja diz a situacao.
const SELO_TONE = {
  red:   'bg-status-red-bg text-status-red-text',
  blue:  'bg-status-blue-bg text-status-blue-text',
  green: 'bg-status-green-bg text-status-green-text',
  slate: 'bg-status-slate-bg text-status-slate-text',
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
// `projecaoRecorrencia` e o MRR real projetado (so recorrencia); `projecao`
// inclui eventuais, e e o que o fechamento emitiria.
function resumoPorCliente(motivos) {
  const map = new Map()
  for (const r of motivos) {
    const cur = map.get(r.client_id) || { motivo: null, projecao: 0, projecaoRecorrencia: 0 }
    if (r.outcome === 'emitiria') {
      const valor = Number(r.amount || 0)
      cur.projecao += valor
      if (r.kind === 'recorrencia') cur.projecaoRecorrencia += valor
    } else if (r.outcome === 'pulada' && !cur.motivo) cur.motivo = r.reason
    map.set(r.client_id, cur)
  }
  return map
}

// Situacao do cliente: a pior condicao (vencida > aberta > quitada).
function Selo({ cliente, motivo, canWrite }) {
  if (cliente.estado === 'com_fatura') {
    const atraso = Number(cliente.maior_atraso || 0)
    if (atraso > 0) {
      return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SELO_TONE.red}`}>
          Vencida · {atraso} {atraso === 1 ? 'dia' : 'dias'}
        </span>
      )
    }
    if (Number(cliente.n_em_aberto) > 0) {
      return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SELO_TONE.blue}`}>
          Aberta
        </span>
      )
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SELO_TONE.green}`}>
        Quitada
      </span>
    )
  }
  if (canWrite && motivo) return <MotivoBadge motivo={motivo} />
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SELO_TONE.slate}`}>
      Sem fatura
    </span>
  )
}

function Valor({ children, muted = false }) {
  return (
    <span className={`tabular-nums ${muted ? 'text-text-secondary' : 'text-text-primary'}`}>{children}</span>
  )
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
    vencidas: lista.filter(c => Number(c.maior_atraso || 0) > 0).length,
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
                <th scope="col" className="text-left px-3 py-2 font-semibold">Tipo</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">Uso</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">MRR mínimo</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">MRR real</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">Faturas</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">Saldo em aberto</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(c => {
                const aberto = expandido === c.client_id
                const r = resumo.get(c.client_id)
                const fixo = c.tipo === 'fixo'
                // MRR real: o faturado; sem fatura, a projecao de recorrencia (so quem fecha ve).
                const mrrReal = c.mrr_real != null
                  ? Number(c.mrr_real)
                  : (canWrite && r?.projecaoRecorrencia > 0 ? r.projecaoRecorrencia : null)
                return (
                  <Fragment key={c.client_id}>
                    <tr className="border-t border-border-tertiary align-top">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          aria-expanded={aberto}
                          onClick={() => setExpandido(aberto ? null : c.client_id)}
                          className="inline-flex items-start gap-2 text-left"
                        >
                          {aberto
                            ? <Icons.ChevronDown size={14} className="mt-1 shrink-0" aria-hidden="true" />
                            : <Icons.ChevronRight size={14} className="mt-1 shrink-0" aria-hidden="true" />}
                          <span className="flex flex-col gap-1">
                            <span className="font-semibold text-text-primary">{c.client_name}</span>
                            <Selo cliente={c} motivo={r?.motivo} canWrite={canWrite} />
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-text-secondary">{TIPO_LABEL[c.tipo] || c.tipo || '—'}</td>
                      <td className="px-3 py-3 text-right"><Valor muted={fixo}>{fixo ? '—' : (c.uso ?? 0)}</Valor></td>
                      <td className="px-3 py-3 text-right"><Valor muted={fixo}>{fixo ? '—' : BRL.format(Number(c.mrr_minimo || 0))}</Valor></td>
                      <td className="px-3 py-3 text-right">
                        <Valor muted={mrrReal == null}>{mrrReal != null ? BRL.format(mrrReal) : '—'}</Valor>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Valor muted={c.estado !== 'com_fatura'}>
                          {c.estado === 'com_fatura' ? `${c.n_em_aberto} de ${c.m_faturas}` : '—'}
                        </Valor>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        <Valor muted={Number(c.saldo_aberto || 0) === 0}>{BRL.format(Number(c.saldo_aberto || 0))}</Valor>
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="border-t border-border-tertiary bg-bg-primary">
                        <td colSpan={7} className="px-4 pb-4">
                          <ClienteDetalhe
                            cliente={c}
                            competencia={competencia}
                            canWrite={canWrite}
                            selo={<Selo cliente={c} motivo={r?.motivo} canWrite={canWrite} />}
                            projecao={canWrite && r?.projecao > 0 ? r.projecao : null}
                          />
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

      {clientes.isSuccess && lista.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${totais.vencidas > 0 ? 'bg-status-red-text' : 'bg-status-green-text'}`}
          />
          {totais.vencidas > 0
            ? `${totais.vencidas} ${totais.vencidas === 1 ? 'cliente com fatura vencida' : 'clientes com fatura vencida'} · ${BRL.format(totais.saldo)} em aberto nesta competência`
            : `Nenhuma fatura vencida · ${BRL.format(totais.saldo)} em aberto nesta competência`}
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
        onConfirm={() => (fechar.isSuccess ? setFechando(false) : fechar.mutate(competencia))}
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
