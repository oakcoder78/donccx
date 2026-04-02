import { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { useClientSupportMutations } from '../../../../hooks/useClient'
import { Button } from '../../../ui/Button'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export function ClientSubSuporte({ client }) {
  const [month, setMonth] = useState(currentMonth())
  const { upsert } = useClientSupportMutations()

  const supportData = client.client_support || []
  const current = supportData.find(u => u.ref_month === month) || {
    tickets_opened: 0, tickets_resolved: 0, sla_first_response: 0,
    n1_pct: 0, n2_pct: 0, n3_pct: 0,
  }
  const [form, setForm] = useState({ ...current })

  const sorted = [...supportData].sort((a,b) => a.ref_month.localeCompare(b.ref_month)).slice(-6)

  const chartData = {
    labels: sorted.map(u => u.ref_month),
    datasets: [
      { label: 'Abertos', data: sorted.map(u => u.tickets_opened), backgroundColor: '#E24B4A' },
      { label: 'Resolvidos', data: sorted.map(u => u.tickets_resolved), backgroundColor: '#1D9E75' },
    ]
  }

  function handleChange(e) {
    setForm(p => ({ ...p, [e.target.name]: Number(e.target.value) }))
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { name: 'tickets_opened', label: 'Tickets Abertos' },
          { name: 'tickets_resolved', label: 'Tickets Resolvidos' },
          { name: 'sla_first_response', label: 'SLA 1ª Resp. (%)' },
          { name: 'n1_pct', label: 'N1 (%)' },
          { name: 'n2_pct', label: 'N2 (%)' },
          { name: 'n3_pct', label: 'N3 (%)' },
        ].map(f => (
          <div key={f.name}>
            <label className="label-sm">{f.label}</label>
            <input type="number" name={f.name} value={form[f.name] || 0}
              onChange={handleChange} className="input-base w-full" min="0" />
          </div>
        ))}
      </div>

      <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>Salvar</Button>

      {sorted.length > 0 && (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
          <Bar data={chartData} options={{ responsive: true, plugins: { legend: { position: 'top' } } }} height={120} />
        </div>
      )}
    </div>
  )
}
