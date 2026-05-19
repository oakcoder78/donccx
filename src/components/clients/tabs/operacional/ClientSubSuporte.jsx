import { Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js'
import { useClientSupport, useClientSupportMutations } from '@/hooks/useClient'
import { Icons } from "@/lib/icons"
import { calcSupportPercentages } from '@/lib/supportUtils'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

function calcPct(num, den) {
  if (!den || den === 0) return null
  return Math.round((num / den) * 100)
}

function fmtPct(val) {
  return val == null ? '—' : `${val}%`
}

export function ClientSubSuporte({ client, onEdit }) {
  const { remove }             = useClientSupportMutations()
  const { data: supportData = [] } = useClientSupport(client.id)

  const sorted     = [...supportData].sort((a, b) => a.ref_month.localeCompare(b.ref_month))
  const chartData6 = sorted.slice(-6)

  function handleDelete(u) {
    if (!window.confirm(`Excluir dados de ${fmtMonth(u.ref_month)}?`)) return
    remove.mutate(u.id)
  }

  const lineChart = {
    labels: chartData6.map(u => fmtMonth(u.ref_month)),
    datasets: [
      {
        label: 'Abertos',
        data: chartData6.map(u => u.tickets_opened),
        borderColor: '#E24B4A',
        backgroundColor: 'rgba(226,75,74,0.08)',
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#E24B4A',
      },
      {
        label: 'Resolvidos',
        data: chartData6.map(u => u.tickets_resolved),
        borderColor: '#1D9E75',
        backgroundColor: 'rgba(29,158,117,0.06)',
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#1D9E75',
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } },
    },
  }

  return (
    <div className="space-y-5">

      {/* Gráfico */}
      {chartData6.length > 0 && (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">Evolução — últimos 6 meses</p>
          <Line data={lineChart} options={lineOptions} height={100} />
        </div>
      )}

      {/* Tabela histórica */}
      {sorted.length > 0 ? (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border-tertiary">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Histórico completo</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-secondary">
                  <th className="text-left px-4 py-2 text-xs font-medium text-text-tertiary">Mês</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Abertos</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Resolvidos</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Taxa Resol.</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">SLA 1ª (min)</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">N1</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">N2</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">N3</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">%N1</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">%N2</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">%N3</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map(u => (
                  <tr key={u.ref_month} className="border-t border-border-tertiary hover:bg-bg-secondary transition-colors">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{fmtMonth(u.ref_month)}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.tickets_opened}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.tickets_resolved}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcPct(u.tickets_resolved, u.tickets_opened))}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.sla_first_response ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.n1_pct ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.n2_pct ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.n3_pct ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcSupportPercentages(u.n1_pct, u.n2_pct, u.n3_pct).pct1)}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcSupportPercentages(u.n1_pct, u.n2_pct, u.n3_pct).pct2)}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcSupportPercentages(u.n1_pct, u.n2_pct, u.n3_pct).pct3)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEdit(u.ref_month)}
                          className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-donc-sky transition-colors"
                          title="Editar"
                        >
                          <Icons.Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={remove.isPending}
                          className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-donc-red transition-colors"
                          title="Excluir"
                        >
                          <Icons.Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-text-tertiary text-sm">
          Nenhum dado registrado ainda. Clique em "Registrar Dados" para começar.
        </div>
      )}
    </div>
  )
}
