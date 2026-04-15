import { Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js'
import { useClientUsageMutations } from '../../../../hooks/useClient'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

export function ClientSubUso({ client, onEdit }) {
  const { remove } = useClientUsageMutations()

  const usageData  = client.client_usage || []
  const sorted     = [...usageData].sort((a, b) => a.ref_month.localeCompare(b.ref_month))
  const chartData6 = sorted.slice(-6)

  function handleDelete(u) {
    if (!window.confirm(`Excluir dados de ${fmtMonth(u.ref_month)}?`)) return
    remove.mutate(u.id)
  }

  const lineChart = {
    labels: chartData6.map(u => fmtMonth(u.ref_month)),
    datasets: [
      {
        label: 'OS Criadas',
        data: chartData6.map(u => u.os_created),
        borderColor: '#59c2ed',
        backgroundColor: 'rgba(89,194,237,0.08)',
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#59c2ed',
      },
      {
        label: 'Usuários Ativos',
        data: chartData6.map(u => u.active_users),
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
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">OS Criadas</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Usuários Ativos</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map(u => (
                  <tr key={u.ref_month} className="border-t border-border-tertiary hover:bg-bg-secondary transition-colors">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{fmtMonth(u.ref_month)}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{(u.os_created ?? 0).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{(u.active_users ?? 0).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEdit(u.ref_month)}
                          className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-donc-sky transition-colors"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={remove.isPending}
                          className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-donc-red transition-colors"
                          title="Excluir"
                        >
                          🗑️
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
