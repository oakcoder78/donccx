import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js'
import { useClientUsageMutations } from '../../../../hooks/useClient'
import { Button } from '../../../ui/Button'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

export function ClientSubUso({ client }) {
  const [month, setMonth] = useState(currentMonth())
  const [osVal, setOsVal] = useState('')
  const [usersVal, setUsersVal] = useState('')
  const [errors, setErrors] = useState({})
  const { upsert } = useClientUsageMutations()

  const usageData = client.client_usage || []
  const sorted = [...usageData].sort((a, b) => a.ref_month.localeCompare(b.ref_month))
  const chartData6 = sorted.slice(-6)

  // Preenche form ao trocar mês
  function handleMonthChange(e) {
    const m = e.target.value
    setMonth(m)
    const existing = usageData.find(u => u.ref_month === m)
    if (existing) {
      setOsVal(String(existing.os_created))
      setUsersVal(String(existing.active_users))
    } else {
      setOsVal('')
      setUsersVal('')
    }
    setErrors({})
  }

  function validate() {
    const errs = {}
    if (osVal === '' || isNaN(Number(osVal)) || Number(osVal) < 0)
      errs.os = 'Informe um número válido'
    if (usersVal === '' || isNaN(Number(usersVal)) || Number(usersVal) < 0)
      errs.users = 'Informe um número válido'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    await upsert.mutateAsync({
      client_id: client.id,
      ref_month: month,
      os_created: Number(osVal),
      active_users: Number(usersVal),
    })
    setErrors({})
  }

  const lineChart = {
    labels: chartData6.map(u => fmtMonth(u.ref_month)),
    datasets: [
      {
        label: 'OS Criadas',
        data: chartData6.map(u => u.os_created),
        borderColor: '#59c2ed',
        backgroundColor: 'rgba(89,194,237,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#59c2ed',
      },
      {
        label: 'Usuários Ativos',
        data: chartData6.map(u => u.active_users),
        borderColor: '#1D9E75',
        backgroundColor: 'rgba(29,158,117,0.06)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#1D9E75',
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } },
    },
  }

  return (
    <div className="space-y-5">
      {/* Formulário de entrada */}
      <div className="bg-bg-secondary border border-border-tertiary rounded-lg p-4">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">Registrar dados do mês</p>
        <div className="flex items-start gap-3 flex-wrap">
          <div>
            <label className="label-sm">Mês de Referência</label>
            <input
              type="month"
              value={month}
              onChange={handleMonthChange}
              className="input-base"
            />
          </div>
          <div>
            <label className="label-sm">OS Criadas</label>
            <input
              type="number"
              value={osVal}
              onChange={e => { setOsVal(e.target.value); setErrors(p => ({ ...p, os: undefined })) }}
              placeholder="—"
              className={`input-base w-28 ${errors.os ? 'border-red-400' : ''}`}
              min="0"
            />
            {errors.os && <p className="text-xs text-red-500 mt-0.5">{errors.os}</p>}
          </div>
          <div>
            <label className="label-sm">Usuários Ativos</label>
            <input
              type="number"
              value={usersVal}
              onChange={e => { setUsersVal(e.target.value); setErrors(p => ({ ...p, users: undefined })) }}
              placeholder="—"
              className={`input-base w-28 ${errors.users ? 'border-red-400' : ''}`}
              min="0"
            />
            {errors.users && <p className="text-xs text-red-500 mt-0.5">{errors.users}</p>}
          </div>
          <div className="pt-5">
            <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>

      {/* Gráfico */}
      {chartData6.length > 0 && (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">Evolução — últimos 6 meses</p>
          <Line data={lineChart} options={lineOptions} height={100} />
        </div>
      )}

      {/* Tabela histórica */}
      {sorted.length > 0 && (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border-tertiary">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Histórico completo</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary">
                <th className="text-left px-4 py-2 text-xs font-medium text-text-tertiary">Mês</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">OS Criadas</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-text-tertiary">Usuários Ativos</th>
              </tr>
            </thead>
            <tbody>
              {[...sorted].reverse().map((u, i) => (
                <tr
                  key={u.ref_month}
                  className={`border-t border-border-tertiary hover:bg-bg-secondary transition-colors cursor-pointer ${u.ref_month === month ? 'bg-donc-sky/5' : ''}`}
                  onClick={() => {
                    setMonth(u.ref_month)
                    setOsVal(String(u.os_created))
                    setUsersVal(String(u.active_users))
                    setErrors({})
                  }}
                >
                  <td className="px-4 py-2.5 font-medium text-text-primary">{fmtMonth(u.ref_month)}</td>
                  <td className="px-4 py-2.5 text-right text-text-secondary">{u.os_created.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right text-text-secondary">{u.active_users.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="text-center py-8 text-text-tertiary text-sm">
          Nenhum dado registrado ainda. Use o formulário acima para começar.
        </div>
      )}
    </div>
  )
}
