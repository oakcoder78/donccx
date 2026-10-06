import { Fragment, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import {
  useBillingClientes, useBillingMotivos, useBillingConsolidacao,
  useClosePreview, useCloseCompetencia,
} from '../hooks/useBillingCockpit'
import { Icons } from '../lib/icons'
import { toCsv, baixarCsv, carimboData } from '../lib/csv'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { MotivoBadge } from '../components/ui/StateBadges'
import { EmptyState, ErrorState, ReadOnlyBanner } from '../components/ui/StatusViews'
import { ClienteDetalhe } from '../components/billing/ClienteDetalhe'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_LABEL = { por_licenca: 'Por licença', por_os: 'Por OS', os: 'Por OS', licenca: 'Por licença', fixo: 'Fixo' }

// Tons dos selos, com os tokens status.* do projeto. A cor nunca e a unica
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
function situacaoDo(cliente) {
  if (cliente.estado === 'com_fatura') {
    const atraso = Number(cliente.maior_atraso || 0)
    if (atraso > 0) return { chave: 'vencida', rotulo: `Vencida · ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`, tone: 'red' }
    if (Number(cliente.n_em_aberto) > 0) return { chave: 'aberta', rotulo: 'Aberta', tone: 'blue' }
    return { chave: 'quitada', rotulo: 'Quitada', tone: 'green' }
  }
  return { chave: 'sem_fatura', rotulo: 'Sem fatura', tone: 'slate' }
}

function Selo({ cliente, motivo, canWrite }) {
  // Sem regra lancada o cliente nao fatura: o selo diz isso, para qualquer perfil.
  if (cliente.tem_regra === false) return <MotivoBadge motivo="sem_regra" />
  if (cliente.estado !== 'com_fatura' && canWrite && motivo) return <MotivoBadge motivo={motivo} />
  const s = situacaoDo(cliente)
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SELO_TONE[s.tone]}`}>
      {s.rotulo}
    </span>
  )
}

function Valor({ children, muted = false }) {
  return (
    <span className={`tabular-nums ${muted ? 'text-text-secondary' : 'text-text-primary'}`}>{children}</span>
  )
}

// Bloco do topo: rotulo pequeno, valor em destaque e uma linha de contexto.
function Indicador({ rotulo, valor, contexto, destaque = false }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{rotulo}</span>
      <span className={`text-xl font-semibold tabular-nums ${destaque ? 'text-status-red-text' : 'text-text-primary'}`}>{valor}</span>
      {contexto && <span className="text-xs text-text-secondary">{contexto}</span>}
    </div>
  )
}

// Filtros da lista. A situacao vem do estado real do cliente, nao do selo.
const FILTRO_INICIAL = { busca: '', situacao: 'todas', tipo: 'todos', soComSaldo: false }

function aplicaFiltros(lista, f) {
  const termo = f.busca.trim().toLowerCase()
  return lista.filter(c => {
    if (termo && !String(c.client_name || '').toLowerCase().includes(termo)) return false
    if (f.situacao !== 'todas' && situacaoDo(c).chave !== f.situacao) return false
    if (f.tipo !== 'todos' && c.tipo !== f.tipo && !(f.tipo === 'por_os' && c.tipo === 'os')) return false
    if (f.soComSaldo && !(Number(c.saldo_aberto) > 0)) return false
    return true
  })
}

// Texto do motivo de cada serie pulada no fechamento.
const MOTIVO_PULA = {
  sem_regra: 'sem regra lançada',
  usage_incomplete: 'uso não consolidado',
  fora_janela: 'fora da janela do contrato',
  nao_bilhetavel: 'não bilhetável',
  valor_zero: 'valor zero',
}

// Primeiro dia do mes seguinte: quando o uso do mes e consolidado pelo cron.
function dataConsolidacao(competencia) {
  const [ano, mes] = competencia.split('-').map(Number)
  const d = new Date(ano, mes, 1)
  return d.toLocaleDateString('pt-BR')
}

const COLUNAS_CSV = [
  { titulo: 'Cliente', campo: 'client_name' },
  { titulo: 'Situação', campo: 'situacao' },
  { titulo: 'Dias de atraso', campo: 'atraso', tipo: 'numero' },
  { titulo: 'Tipo', campo: 'tipo_label' },
  { titulo: 'Uso', campo: 'uso' },
  { titulo: 'MRR mínimo (R$)', campo: 'mrr_minimo', tipo: 'numero' },
  { titulo: 'MRR real (R$)', campo: 'mrr_real', tipo: 'numero' },
  { titulo: 'Faturado (R$)', campo: 'faturado', tipo: 'numero' },
  { titulo: 'Faturas em aberto', campo: 'n_em_aberto' },
  { titulo: 'Faturas emitidas', campo: 'm_faturas' },
  { titulo: 'Saldo em aberto (R$)', campo: 'saldo_aberto', tipo: 'numero' },
]

export default function FinanceiroCockpitV2Page() {
  const { effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const canWrite = isEnabled('financeiro_cockpit_write', effectiveRole)

  const opcoes = useMemo(competenciaOptions, [])
  const [competencia, setCompetencia] = useState(opcoes[0])
  const [expandido, setExpandido] = useState(null)
  const [fechando, setFechando] = useState(false)
  const [filtro, setFiltro] = useState(FILTRO_INICIAL)

  const clientes = useBillingClientes(competencia)
  const motivos = useBillingMotivos(competencia, canWrite)
  const consolidacao = useBillingConsolidacao(competencia, canWrite)
  const consolidada = consolidacao.data?.consolidada === true
  const preview = useClosePreview()
  const fechar = useCloseCompetencia()

  const resumo = useMemo(() => resumoPorCliente(motivos.data || []), [motivos.data])
  const lista = clientes.data || []
  const filtrada = useMemo(() => aplicaFiltros(lista, filtro), [lista, filtro])
  const filtrosAtivos = filtro.busca.trim() !== '' || filtro.situacao !== 'todas' || filtro.tipo !== 'todos' || filtro.soComSaldo

  // Topo: sempre sobre a competencia inteira, nao sobre o filtro da lista.
  const topo = useMemo(() => {
    const faturado = lista.reduce((s, c) => s + Number(c.faturado || 0), 0)
    const excedente = lista.reduce((s, c) => s + Number(c.excedente || 0), 0)
    const saldo = lista.reduce((s, c) => s + Number(c.saldo_aberto || 0), 0)
    const faturas = lista.reduce((s, c) => s + Number(c.m_faturas || 0), 0)
    const emAberto = lista.reduce((s, c) => s + Number(c.n_em_aberto || 0), 0)
    const vencido = lista.reduce((s, c) => s + Number(c.vencido_valor || 0), 0)
    const vencidos = lista.filter(c => Number(c.maior_atraso || 0) > 0)
    const maiorAtraso = vencidos.reduce((m, c) => Math.max(m, Number(c.maior_atraso || 0)), 0)
    return { faturado, excedente, saldo, faturas, emAberto, vencido, vencidos: vencidos.length, maiorAtraso }
  }, [lista])

  // Projecao do proximo fechamento: so quem fecha a competencia ve.
  const aEmitir = useMemo(() => {
    if (!canWrite) return null
    const semFatura = lista.filter(c => c.estado === 'sem_fatura')
    let valor = 0
    let semRegra = 0
    for (const c of semFatura) {
      const r = resumo.get(c.client_id)
      valor += Number(r?.projecaoRecorrencia || 0)
      if (r?.motivo === 'sem_regra') semRegra += 1
    }
    return { valor, series: semFatura.length, semRegra }
  }, [canWrite, lista, resumo])

  function abrirFechamento() {
    setFechando(true)
    preview.reset()
    fechar.reset()
    preview.mutate(competencia)
  }

  function exportarLista() {
    const linhas = filtrada.map(c => {
      const r = resumo.get(c.client_id)
      const s = situacaoDo(c)
      return {
        client_name: c.client_name,
        situacao: s.rotulo,
        atraso: c.maior_atraso,
        tipo_label: TIPO_LABEL[c.tipo] || c.tipo || '',
        uso: c.uso ?? '',
        mrr_minimo: c.mrr_minimo,
        mrr_real: c.mrr_real != null ? c.mrr_real : (canWrite ? (r?.projecaoRecorrencia > 0 ? r.projecaoRecorrencia : null) : null),
        faturado: c.estado === 'com_fatura' ? c.faturado : null,
        n_em_aberto: c.estado === 'com_fatura' ? c.n_em_aberto : '',
        m_faturas: c.estado === 'com_fatura' ? c.m_faturas : '',
        saldo_aberto: c.saldo_aberto,
      }
    })
    baixarCsv(`financeiro-clientes-${competencia}-${carimboData()}.csv`, toCsv(linhas, COLUNAS_CSV))
  }

  const previewResumo = useMemo(() => {
    const rows = preview.data || []
    const emitiria = rows.filter(r => r.outcome === 'emitiria')
    const puladas = rows.filter(r => r.outcome === 'pulada')
    // Conta por motivo, para o operador saber por que cada serie ficou de fora.
    const porMotivo = {}
    for (const r of puladas) porMotivo[r.reason] = (porMotivo[r.reason] || 0) + 1
    const motivos = Object.entries(porMotivo)
      .map(([m, n]) => `${n} ${MOTIVO_PULA[m] || m}`)
      .join(', ')
    return {
      emitiria: emitiria.length,
      valor: emitiria.reduce((s, r) => s + Number(r.amount || 0), 0),
      puladas: puladas.length,
      motivos,
    }
  }, [preview.data])

  return (
    <div className="min-h-full bg-bg-secondary p-4 md:p-6 flex flex-col gap-5">
      <PageHeader
        title="Faturamento"
        subtitle={`Competência ${competencia} · cockpit novo, em teste`}
      />

      {!canWrite && (
        <ReadOnlyBanner reason="Seu perfil vê as faturas, mas não fecha competência nem lança pagamentos." />
      )}

      {canWrite && consolidacao.isSuccess && !consolidada && (
        <div role="status" className="rounded-lg border border-status-amber-line bg-status-amber-bg px-4 py-3 text-sm text-status-amber-text">
          <strong>Não é possível fechar {competencia} ainda.</strong>{' '}
          O uso não foi sincronizado. O fechamento libera depois da sincronização de {dataConsolidacao(competencia)}. Se precisar encerrar um contrato antes disso, solicite ao administrador.
        </div>
      )}

      {clientes.isSuccess && lista.length > 0 && (
        <section aria-label="Resumo da competência" className="grid grid-cols-2 divide-x divide-y divide-border-tertiary rounded-lg border border-border-tertiary bg-bg-primary md:grid-cols-4 md:divide-y-0">
          <Indicador
            rotulo="Faturado no mês"
            valor={BRL.format(topo.faturado)}
            contexto={`${topo.faturas} fatura(s) emitida(s)${topo.excedente > 0 ? ` · inclui ${BRL.format(topo.excedente)} de excedente` : ''}`}
          />
          <Indicador
            rotulo="Em aberto"
            valor={BRL.format(topo.saldo)}
            contexto={`${topo.emAberto} de ${topo.faturas} faturas não quitadas`}
          />
          <Indicador
            rotulo="Vencido"
            valor={BRL.format(topo.vencido)}
            destaque={topo.vencido > 0}
            contexto={topo.vencidos > 0 ? `${topo.vencidos} cliente(s) · maior atraso ${topo.maiorAtraso} dias` : 'Nenhuma fatura vencida'}
          />
          <Indicador
            rotulo="Recorrência a emitir"
            valor={aEmitir ? BRL.format(aEmitir.valor) : '—'}
            contexto={aEmitir
              ? `${aEmitir.series} série(s) sem fatura${aEmitir.semRegra > 0 ? ` · ${aEmitir.semRegra} sem regra lançada` : ''}`
              : 'Disponível para quem fecha a competência'}
          />
        </section>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border-tertiary bg-bg-primary p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Competência
            <select
              value={competencia}
              onChange={e => { setCompetencia(e.target.value); setExpandido(null) }}
              className="rounded-md border border-border-secondary px-2 py-1.5 text-sm text-text-primary bg-bg-primary"
            >
              {opcoes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Buscar cliente
            <input
              type="search"
              value={filtro.busca}
              onChange={e => setFiltro(f => ({ ...f, busca: e.target.value }))}
              placeholder="Nome do cliente"
              className="w-56 rounded-md border border-border-secondary px-2 py-1.5 text-sm text-text-primary bg-bg-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Situação
            <select
              value={filtro.situacao}
              onChange={e => setFiltro(f => ({ ...f, situacao: e.target.value }))}
              className="rounded-md border border-border-secondary px-2 py-1.5 text-sm text-text-primary bg-bg-primary"
            >
              <option value="todas">Todas</option>
              <option value="vencida">Vencida</option>
              <option value="aberta">Aberta</option>
              <option value="quitada">Quitada</option>
              <option value="sem_fatura">Sem fatura</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Tipo
            <select
              value={filtro.tipo}
              onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}
              className="rounded-md border border-border-secondary px-2 py-1.5 text-sm text-text-primary bg-bg-primary"
            >
              <option value="todos">Todos</option>
              <option value="por_licenca">Por licença</option>
              <option value="por_os">Por OS</option>
              <option value="fixo">Fixo</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={filtro.soComSaldo}
              onChange={e => setFiltro(f => ({ ...f, soComSaldo: e.target.checked }))}
            />
            Só com saldo
          </label>
          {filtrosAtivos && (
            <Button variant="ghost" size="sm" onClick={() => setFiltro(FILTRO_INICIAL)}>Limpar filtros</Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
            <Button
              variant="primary"
              onClick={abrirFechamento}
              disabled={!consolidada}
              title={consolidada ? undefined : 'Só fecha depois da sincronização de uso do mês'}
            >
              <Icons.Check size={14} aria-hidden="true" />
              Fechar competência
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={exportarLista}
            disabled={filtrada.length === 0}
            title={filtrada.length === 0 ? 'Nenhum cliente com os filtros atuais' : 'Exporta os clientes da lista, com os filtros aplicados'}
          >
            Exportar CSV
          </Button>
        </div>
      </div>

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

      {clientes.isSuccess && lista.length > 0 && filtrada.length === 0 && (
        <EmptyState
          reason="Sem resultado"
          title="Nenhum cliente com os filtros atuais"
          description="Ajuste ou limpe os filtros para ver os clientes da competência."
        />
      )}

      {clientes.isSuccess && filtrada.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-tertiary bg-bg-primary">
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
              {filtrada.map(c => {
                const aberto = expandido === c.client_id
                const r = resumo.get(c.client_id)
                const fixo = c.tipo === 'fixo'
                // Sem regra lancada: nao ha uso nem minimo a mostrar (o cliente nao fatura).
                const semRegra = c.tem_regra === false
                // MRR real: o faturado; sem fatura, a projecao de recorrencia (so quem fecha ve).
                const mrrReal = semRegra ? null : c.mrr_real != null
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
                      <td className="px-3 py-3 text-right"><Valor muted={fixo || semRegra}>{fixo || semRegra ? '—' : (c.uso ?? 0)}</Valor></td>
                      <td className="px-3 py-3 text-right"><Valor muted={fixo || semRegra}>{fixo || semRegra ? '—' : BRL.format(Number(c.mrr_minimo || 0))}</Valor></td>
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
                            podeCorte={effectiveRole === 'admin'}
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
          fechar.isError ? <span role="alert" className="text-status-red-text">Não foi possível fechar: {fechar.error?.message}</span> :
          preview.isPending ? <Spinner size="sm" /> :
          preview.isError ? <span className="text-status-red-text">Não foi possível calcular a prévia: {preview.error?.message}</span> :
          fechar.isSuccess ? <span>Emitidas: {(fechar.data || []).filter(r => r.outcome === 'emitida').length}. Já existentes: {(fechar.data || []).filter(r => r.outcome === 'ja_emitida').length}.</span> :
          preview.isSuccess ? (
            <span>
              Vai emitir <strong>{previewResumo.emitiria}</strong> fatura(s), somando <strong>{BRL.format(previewResumo.valor)}</strong>.
              {previewResumo.puladas > 0 && (
                <>
                  {' '}Pulam <strong>{previewResumo.puladas}</strong> série(s): {previewResumo.motivos}.
                </>
              )}
            </span>
          ) : null
        }
      />
    </div>
  )
}
