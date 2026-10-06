import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Spinner } from '../ui/Spinner'
import { ErrorState, EmptyState } from '../ui/StatusViews'
import { FaturasDoCliente } from './FaturasDoCliente'
import { useBillingExtrato } from '../../hooks/useBillingExtrato'
import { BRL } from './BillingWriteDialogs'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useEncerrarComCorte } from '../../hooks/useBillingWrites'
import { toCsv, baixarCsv, carimboData } from '../../lib/csv'
import { syncClient } from '../../lib/clientSync'

// Painel expandido de um cliente: contrato, faturas e extrato, nessa ordem.
// Cada bloco tem titulo proprio e um filete separando do anterior.

const TIPO_LABEL = { por_licenca: 'Por licença', por_os: 'Por OS', os: 'Por OS', licenca: 'Por licença', fixo: 'Fixo' }

function Bloco({ titulo, nota, children }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border-tertiary pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{titulo}</h3>
        {nota && <span className="text-xs text-text-secondary">{nota}</span>}
      </div>
      {children}
    </section>
  )
}

function Campo({ rotulo, valor, ajuda }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{rotulo}</span>
      <span className="text-sm font-semibold tabular-nums text-text-primary">{valor}</span>
      {ajuda && <span className="text-xs text-text-secondary">{ajuda}</span>}
    </div>
  )
}

// Faixa de calculo: BASE + EXCEDENTE = MRR REAL. Contrato fixo mostra so o valor.
// Sem fatura e sem projecao, a faixa mostra o minimo garantido e diz quando o real aparece.
function Celula({ rotulo, valor, destaque = false, ajuda }) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-4 py-3 ${destaque ? 'bg-bg-secondary' : 'border border-border-tertiary bg-bg-primary'}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{rotulo}</span>
      <span className={`text-lg font-semibold tabular-nums ${destaque ? 'text-text-primary' : 'text-text-primary'}`}>{valor}</span>
      {ajuda && <span className="text-xs text-text-secondary">{ajuda}</span>}
    </div>
  )
}

function Operador({ simbolo }) {
  return <span aria-hidden="true" className="self-center text-lg font-semibold text-text-secondary">{simbolo}</span>
}

function CalculoMrr({ cliente, fixo, projecao }) {
  const real = cliente.mrr_real != null ? Number(cliente.mrr_real) : null
  const excedente = Number(cliente.excedente || 0)

  if (fixo) {
    return (
      <Celula
        rotulo="Valor fixo do mês"
        valor={real != null ? BRL.format(real) : (projecao != null ? BRL.format(projecao) : '—')}
        ajuda="contrato de valor fixo, sem licenças"
      />
    )
  }

  if (real == null) {
    return (
      <div className="flex flex-wrap items-stretch gap-2">
        <Celula
          rotulo="Mínimo garantido"
          valor={BRL.format(Number(cliente.mrr_minimo || 0))}
          ajuda={`piso ${cliente.piso ?? 0} × ${BRL.format(Number(cliente.valor_unitario || 0))} por licença`}
        />
        <Celula
          rotulo="MRR real"
          valor={projecao != null ? BRL.format(projecao) : '—'}
          ajuda={projecao != null ? 'projeção; vira faturado ao fechar' : 'aparece depois do fechamento'}
        />
      </div>
    )
  }

  const base = real - excedente
  const acimaDoPiso = Math.max(0, Number(cliente.uso || 0) - Number(cliente.piso || 0))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-stretch gap-2">
        <Celula
          rotulo="Base do plano"
          valor={BRL.format(base)}
          ajuda={`mínimo garantido ${BRL.format(Number(cliente.mrr_minimo || 0))}`}
        />
        <Operador simbolo="+" />
        <Celula
          rotulo="Excedente"
          valor={BRL.format(excedente)}
          ajuda={excedente > 0 ? `${acimaDoPiso} licenças acima do piso × ${BRL.format(Number(cliente.valor_unitario || 0))}` : 'uso dentro do piso'}
        />
        <Operador simbolo="=" />
        <Celula destaque rotulo="MRR real" valor={BRL.format(real)} ajuda="faturado no mês" />
      </div>
    </div>
  )
}

// Mes corrente no fuso de Sao Paulo, no formato YYYY-MM.
function mesAtualSp() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
      .formatToParts(new Date()).map(x => [x.type, x.value])
  )
  return `${p.year}-${p.month}`
}

export function ClienteDetalhe({ cliente, competencia, canWrite, selo, projecao }) {
  const fixo = cliente.tipo === 'fixo'
  const emAberto = Number(cliente.saldo_aberto || 0)
  const faturado = cliente.mrr_real != null ? Number(cliente.mrr_real) : null
// Corte so com uma serie: com mais de uma, o operador escolhe pela fatura.
  const serieUnica = (cliente.series_ids || []).length === 1 && cliente.tem_regra !== false
  const [corteAberto, setCorteAberto] = useState(false)
  const [confirmoUso, setConfirmoUso] = useState(false)
  const corte = useEncerrarComCorte(competencia)
  const qc = useQueryClient()
  const [sincronizando, setSincronizando] = useState(false)
  const [erroSync, setErroSync] = useState(null)
  // O corte sempre cobra o mes corrente (America/Sao_Paulo), entao so aparece nele.
  const mesCorrente = mesAtualSp()
  const corteDisponivel = competencia === mesCorrente && serieUnica

  async function sincronizarUso() {
    setSincronizando(true)
    setErroSync(null)
    try {
      const result = await syncClient({ id: cliente.client_id, health_total: null })
      if (result.errors?.length) setErroSync(result.errors.join(' · '))
      qc.invalidateQueries({ queryKey: ['billing_clientes'] })
      qc.invalidateQueries({ queryKey: ['billing_motivos'] })
    } catch (e) {
      setErroSync(e.message)
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 px-1 py-2">
      {/* Cabecalho: valor principal e situacao */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">{cliente.client_name} · competência {competencia}</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums text-text-primary">{BRL.format(emAberto)} em aberto</span>
            {selo}
          </div>
          {cliente.estado === 'com_fatura' && faturado != null && (
            <span className="text-xs text-text-secondary">
              de {BRL.format(faturado)} faturados · {cliente.n_em_aberto} de {cliente.m_faturas} faturas em aberto
            </span>
          )}
        </div>
        {canWrite && competencia === mesCorrente && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!corteDisponivel}
            title={corteDisponivel ? 'Cobra o uso até hoje e encerra o contrato' : 'Disponível para cliente com uma única série e regra lançada'}
            onClick={() => { setConfirmoUso(false); corte.reset(); setCorteAberto(true) }}
          >
            Encerrar com corte
          </Button>
        )}
      </header>

      <ConfirmDialog
        open={corteAberto}
        title={`Encerrar ${cliente.client_name} com corte?`}
        description={`Emite a competência ${competencia} desta série (base integral e excedente até hoje) e encerra o contrato. Depois disso o contrato não cobra mais.`}
        requireReason
        reasonLabel="Motivo do encerramento"
        reasonHint="Fica registrado na auditoria. Mínimo de 10 caracteres."
        variant="danger"
        confirmLabel={corte.isSuccess ? 'Concluído' : 'Cobrar corte e encerrar'}
        cancelLabel={corte.isSuccess ? 'Fechar' : 'Voltar'}
        busy={corte.isPending}
        onConfirm={({ reason }) => {
          if (corte.isSuccess) { setCorteAberto(false); return }
          corte.mutate({ seriesId: cliente.series_ids[0], motivo: reason, confirmoUso })
        }}
        onClose={() => setCorteAberto(false)}
        summary={
          corte.isError ? <span role="alert" className="text-status-red-text">Não foi possível encerrar: {corte.error?.message}</span> :
          corte.isSuccess ? <span>Corte emitido e contrato encerrado.</span> :
          <span>Conferir antes: o uso até hoje precisa estar sincronizado e sem pendências.</span>
        }
      >
        {!corte.isSuccess && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" onClick={sincronizarUso} disabled={sincronizando || corte.isPending}>
                {sincronizando ? 'Sincronizando…' : 'Sincronizar uso agora'}
              </Button>
              {erroSync && <span role="alert" className="text-xs text-status-red-text">{erroSync}</span>}
            </div>
            <label className="flex items-start gap-2 text-sm text-text-primary">
              <input type="checkbox" className="mt-1" checked={confirmoUso} onChange={e => setConfirmoUso(e.target.checked)} />
              Conferi o uso deste cliente até hoje.
            </label>
          </div>
        )}
      </ConfirmDialog>

      {/* Contrato e calculo: a conta que forma o valor, e os termos do contrato */}
      <Bloco titulo="Contrato e cálculo">
        <CalculoMrr cliente={cliente} fixo={fixo} projecao={projecao} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border-tertiary pt-3 md:grid-cols-4">
          <Campo rotulo="Tipo" valor={TIPO_LABEL[cliente.tipo] || cliente.tipo || '—'} />
          {!fixo && <Campo rotulo="Valor por licença" valor={BRL.format(Number(cliente.valor_unitario || 0))} />}
          {!fixo && <Campo rotulo="Piso" valor={`${cliente.piso ?? 0} licenças`} />}
          {!fixo && <Campo rotulo="Uso no mês" valor={`${cliente.uso ?? 0} licenças`} />}
        </div>
      </Bloco>

      {/* Faturas do mes */}
      <Bloco titulo="Faturas do mês" nota={`${cliente.m_faturas || 0} emitida(s)`}>
        <FaturasDoCliente
          clientId={cliente.client_id}
          clientName={cliente.client_name}
          competencia={competencia}
          canWrite={canWrite}
          seriesIds={cliente.series_ids || []}
        />
      </Bloco>

      {/* Extrato: a linha do tempo com saldo acumulado */}
      <Bloco titulo="Extrato" nota="emissões, pagamentos e ajustes em ordem">
        <Extrato clientId={cliente.client_id} clientName={cliente.client_name} competencia={competencia} />
      </Bloco>
    </div>
  )
}

const COLUNAS_EXTRATO_CSV = [
  { titulo: 'Data', campo: 'data_br' },
  { titulo: 'Descrição', campo: 'descricao' },
  { titulo: 'Valor (R$)', campo: 'valor', tipo: 'numero' },
  { titulo: 'Saldo acumulado (R$)', campo: 'saldo_acumulado', tipo: 'numero' },
]

function Extrato({ clientId, clientName, competencia }) {
  const extrato = useBillingExtrato(clientId, competencia)

  if (extrato.isPending) return <Spinner size="sm" />
  if (extrato.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o extrato."
        message={extrato.error?.message}
        onRetry={() => extrato.refetch()}
      />
    )
  }
  const linhas = extrato.data || []
  if (linhas.length === 0) {
    return <EmptyState reason="Sem movimento" title="Nenhum movimento nesta competência" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const exportadas = linhas.map(l => ({ ...l, data_br: brDate(l.data) }))
            const slug = String(clientName || 'cliente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            baixarCsv(`financeiro-extrato-${slug}-${competencia}-${carimboData()}.csv`, toCsv(exportadas, COLUNAS_EXTRATO_CSV))
          }}
        >
          Exportar CSV
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-secondary text-left">
            <th scope="col" className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Data</th>
            <th scope="col" className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Descrição</th>
            <th scope="col" className="py-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Valor</th>
            <th scope="col" className="py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-border-tertiary">
              <td className="py-2 pr-4 tabular-nums text-text-secondary">{brDate(l.data)}</td>
              <td className="py-2 pr-4 text-text-primary">{l.descricao}</td>
              <td className={`py-2 pr-4 text-right tabular-nums ${Number(l.valor) < 0 ? 'text-text-secondary' : 'text-text-primary'}`}>
                {Number(l.valor) > 0 ? '+' : ''}{BRL.format(Number(l.valor))}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums text-text-primary">{BRL.format(Number(l.saldo_acumulado))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-text-secondary">O saldo mostra quanto o cliente ainda deve, depois de cada movimento.</p>
    </div>
  )
}

function brDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
