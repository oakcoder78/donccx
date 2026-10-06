import { Spinner } from '../ui/Spinner'
import { ErrorState, EmptyState } from '../ui/StatusViews'
import { FaturasDoCliente } from './FaturasDoCliente'
import { useBillingExtrato } from '../../hooks/useBillingExtrato'
import { BRL } from './BillingWriteDialogs'
import { Button } from '../ui/Button'
import { toCsv, baixarCsv, carimboData } from '../../lib/csv'

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

export function ClienteDetalhe({ cliente, competencia, canWrite, selo, projecao }) {
  const fixo = cliente.tipo === 'fixo'
  const emAberto = Number(cliente.saldo_aberto || 0)
  const faturado = cliente.mrr_real != null ? Number(cliente.mrr_real) : null

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
      </header>

      {/* Contrato: os termos que explicam o valor */}
      <Bloco titulo="Contrato" nota="Como o valor é calculado">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Campo rotulo="Tipo" valor={TIPO_LABEL[cliente.tipo] || cliente.tipo || '—'} />
          {!fixo && <Campo rotulo="Valor unitário" valor={BRL.format(Number(cliente.valor_unitario || 0))} ajuda="por licença" />}
          {!fixo && <Campo rotulo="Piso" valor={`${cliente.piso ?? 0} licenças`} ajuda="mínimo cobrado" />}
          {!fixo && <Campo rotulo="Uso no mês" valor={`${cliente.uso ?? 0} licenças`} ajuda={cliente.uso > cliente.piso ? `${cliente.uso - cliente.piso} acima do piso` : 'dentro do piso'} />}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
          {!fixo && <Campo rotulo="MRR mínimo" valor={BRL.format(Number(cliente.mrr_minimo || 0))} ajuda="piso × valor unitário" />}
          <Campo
            rotulo="MRR real"
            valor={faturado != null ? BRL.format(faturado) : (projecao != null ? BRL.format(projecao) : '—')}
            ajuda={faturado != null ? 'base + excedente, faturado' : (projecao != null ? 'projeção da competência' : 'disponível para quem fecha a competência')}
          />
          {cliente.excedente != null && Number(cliente.excedente) > 0 && (
            <Campo rotulo="Excedente" valor={BRL.format(Number(cliente.excedente))} ajuda="uso acima do piso, a valor cheio" />
          )}
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
