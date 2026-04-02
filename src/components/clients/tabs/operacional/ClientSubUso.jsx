import { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { useClientUsageMutations } from '../../../../hooks/useClient'
import { Button } from '../../../ui/Button'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export function ClientSubUso({ client }) {
  const [month, setMonth] = useState(currentMonth())
  const { upsert } = useClientUsageMutations()

  const usageData = client.client_usage || []
  const current = usageData.find(u => u.ref_month === month) || { os_created: 0, active_users: 0 }
  const [form, setForm] = useState({ os_created: current.os_created, active_users: current.active_users })

  const sorted = [...usageData].sort((a,b) => a.ref_month.localeCompare(b.ref_month)).slice(-6)

  const chartData = {
    labels: sorted.map(u => u.ref_month),
    datasets: [
      { label: 'OS Criadas', data: sorted.map(u => u.os_created), backgroundColor: '#59c2ed' },
      { label: 'Usuários Ativos', data: sorted.map(u => u.active_users), backgroundColor: '#1D9E75' },
    ]
  }

  async function handleSave() {
    await upsert.mutateAsync({ client_id: client.id, ref_month: month, ...form })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="label-sm">Mês de Referência</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input-base" />
        </div>
        <div>
          <label className="label-sm">OS Criadas</label>
          <input type="number" value={form.os_created} onChange={e => setForm(p => ({ ...p, os_created: Number(e.target.value) }))}
            className="input-base w-24" min="0" />
        </div>
        <div>
          <label className="label-sm">Usuários Ativos</label>
          <input type="number" value={form.active_users} onChange={e => setForm(p => ({ ...p, active_users: Number(e.target.value) }))}
            className="input-base w-24" min="0" />
        </div>
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>Salvar</Button>
      </div>

      {sorted.length > 0 && (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
          <Bar data={chartData} options={{ responsive: true, plugins: { legend: { position: 'top' } } }} height={120} />
        </div>
      )}
    </div>
  )
}
