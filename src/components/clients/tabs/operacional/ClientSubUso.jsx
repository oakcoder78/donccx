import { useState } from 'react'
import { Icons } from "../../../../lib/icons"
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

function fmtNum(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('pt-BR')
}

function isCurrentMonth(ym) {
  if (!ym) return false
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return ym === cur
}

export function ClientSubUso({ client, onEdit }) {
  const { remove } = useClientUsageMutations()
  const [showOsTypes, setShowOsTypes] = useState(true)

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
        data: chartData6.map(u => u.os_created ?? null),
        borderColor: '#59c2ed',
        backgroundColor: 'rgba(89,194,237,0.08)',
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#59c2ed',
      },
      {
        label: 'Usuários Ativos',
        data: chartData6.map(u => u.active_users ?? null),
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

  // Agrupa por ref_month (mais recente primeiro)
  const monthGroups = []
  const monthSeen = new Set()
  for (const u of [...sorted].reverse()) {
    if (!monthSeen.has(u.ref_month)) {
      monthSeen.add(u.ref_month)
      monthGroups.push({
        month: u.ref_month,
        rows: [...sorted].reverse().filter(r => r.ref_month === u.ref_month),
      })
    }
  }

  const today = new Date().getDate()
  const COL_COUNT = 8

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
          <div className="px-4 py-3 border-b border-border-tertiary flex items-center justify-between">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Histórico completo</p>
            <button onClick={() => setShowOsTypes(p => !p)}
              className="text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors">
              {showOsTypes ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
              Tipos de OS
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-secondary">
                  <th className="text-left px-4 py-2 text-xs font-medium text-text-tertiary" style={{ minWidth: 100 }}>Mês</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary" style={{ width: 80 }}>OS Criadas</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary" style={{ width: 80 }}>Usuários At.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary" style={{ width: 80 }}>OS Finaliz.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary" style={{ width: 80 }}>OS Abertas</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary" style={{ width: 80 }}>OS Cancel.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary" style={{ width: 80 }}>Unidades</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary" style={{ width: 72 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {monthGroups.flatMap(({ month, rows }) => {
                  const multiInst = rows.length > 1
                  const partial   = rows[0]?.partial_day != null
                  const partialDay = rows[0]?.partial_day ?? today
                  const entries   = []

                  // Cabeçalho de mês quando há múltiplas instâncias
                  if (multiInst) {
                    entries.push(
                      <tr key={`mhdr-${month}`} className="bg-bg-secondary border-t border-border-tertiary">
                        <td colSpan={COL_COUNT} className="px-4 py-1.5">
                          <span className="text-xs font-semibold text-text-primary">{fmtMonth(month)}</span>
                          {partial && (
                            <span className="ml-2 text-xs font-medium" style={{ color: '#b45309' }}>
                              (dados até dia {partialDay})
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  }

                  rows.forEach((u, idx) => {
                    const instLabel  = u.client_donc_instances?.label
                    const osPorTipo  = Array.isArray(u.os_por_tipo) && u.os_por_tipo.length > 0 ? u.os_por_tipo : null

                    const firstColContent = multiInst
                      ? (instLabel || `Instância ${u.instance_id ?? idx + 1}`)
                      : fmtMonth(month)

                    const rowPartialDay = u.partial_day ?? today
                    const partialNote = !multiInst && u.partial_day != null
                      ? <span className="ml-1 text-xs" style={{ color: '#b45309', fontWeight: 500 }}
                              title={`Dados coletados até ${rowPartialDay}/${String(new Date().getMonth() + 1).padStart(2, '0')}`}>(até dia {rowPartialDay})</span>
                      : null

                    entries.push(
                      <tr key={u.id || `${month}-${idx}`} className="border-t border-border-tertiary hover:bg-bg-secondary transition-colors">
                        <td className="px-4 py-2.5 font-medium text-text-primary" style={{ minWidth: 100 }}>
                          {firstColContent}{partialNote}
                        </td>
                        <td className="px-3 py-2.5 text-right text-text-secondary" style={{ width: 80 }}>{fmtNum(u.os_created)}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary" style={{ width: 80 }}>{fmtNum(u.active_users)}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary" style={{ width: 80 }}>{fmtNum(u.os_finalizadas)}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary" style={{ width: 80 }}>{fmtNum(u.os_abertas)}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary" style={{ width: 80 }}>{fmtNum(u.os_canceladas)}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary" style={{ width: 80 }}>{fmtNum(u.unidades)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ width: 72 }}>
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
                    )

                    // Chips de OS por tipo
                    if (showOsTypes && osPorTipo) {
                      entries.push(
                        <tr key={`chips-${u.id || `${month}-${idx}`}`} className="border-t border-border-tertiary bg-bg-secondary">
                          <td colSpan={COL_COUNT} className="px-4 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              {osPorTipo.map((t, ti) => (
                                <span
                                  key={ti}
                                  className="text-xs rounded px-2 py-0.5"
                                  style={{ backgroundColor: '#e8e7e3', color: '#1a1a18' }}
                                >
                                  {t.tipo ?? t.type ?? '?'}: {fmtNum(t.quantidade ?? t.count ?? t.total)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    }
                  })

                  return entries
                })}
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
