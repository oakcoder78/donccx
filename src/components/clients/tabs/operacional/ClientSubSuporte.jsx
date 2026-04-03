import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js'
import { useClientSupport, useClientSupportMutations } from '../../../../hooks/useClient'
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

function calcPct(num, den) {
  if (!den || den === 0) return null
  return Math.round((num / den) * 100)
}

function fmtPct(val) {
  return val == null ? '—' : `${val}%`
}

export function ClientSubSuporte({ client }) {
  const [month, setMonth] = useState(currentMonth())
  const [openedVal, setOpenedVal] = useState('')
  const [resolvedVal, setResolvedVal] = useState('')
  const [slaVal, setSlaVal] = useState('')
  const [n1Val, setN1Val] = useState('')
  const [n2Val, setN2Val] = useState('')
  const [n3Val, setN3Val] = useState('')
  const [errors, setErrors] = useState({})
  const { upsert } = useClientSupportMutations()

  const { data: supportData = [] } = useClientSupport(client.id)
  const sorted = [...supportData].sort((a, b) => a.ref_month.localeCompare(b.ref_month))
  const chartData6 = sorted.slice(-6)

  function handleMonthChange(e) {
    const m = e.target.value
    setMonth(m)
    const existing = supportData.find(u => u.ref_month === m)
    if (existing) {
      setOpenedVal(String(existing.tickets_opened ?? ''))
      setResolvedVal(String(existing.tickets_resolved ?? ''))
      setSlaVal(String(existing.sla_first_response ?? ''))
      setN1Val(String(existing.n1_pct ?? ''))
      setN2Val(String(existing.n2_pct ?? ''))
      setN3Val(String(existing.n3_pct ?? ''))
    } else {
      setOpenedVal(''); setResolvedVal(''); setSlaVal('')
      setN1Val(''); setN2Val(''); setN3Val('')
    }
    setErrors({})
  }

  function validate() {
    const errs = {}
    if (openedVal === '' || isNaN(Number(openedVal)) || Number(openedVal) < 0) errs.opened = 'Número válido'
    if (resolvedVal === '' || isNaN(Number(resolvedVal)) || Number(resolvedVal) < 0) errs.resolved = 'Número válido'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    await upsert.mutateAsync({
      client_id: client.id,
      ref_month: month,
      tickets_opened: Number(openedVal) || 0,
      tickets_resolved: Number(resolvedVal) || 0,
      sla_first_response: slaVal !== '' ? Number(slaVal) : 0,
      n1_pct: n1Val !== '' ? Number(n1Val) : 0,
      n2_pct: n2Val !== '' ? Number(n2Val) : 0,
      n3_pct: n3Val !== '' ? Number(n3Val) : 0,
    })
    setErrors({})
  }

  const lineChart = {
    labels: chartData6.map(u => fmtMonth(u.ref_month)),
    datasets: [
      {
        label: 'Abertos',
        data: chartData6.map(u => u.tickets_opened),
        borderColor: '#E24B4A',
        backgroundColor: 'rgba(226,75,74,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#E24B4A',
      },
      {
        label: 'Resolvidos',
        data: chartData6.map(u => u.tickets_resolved),
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
            <input type="month" value={month} onChange={handleMonthChange} className="input-base" />
          </div>
          <div>
            <label className="label-sm">Tickets Abertos</label>
            <input type="number" value={openedVal}
              onChange={e => { setOpenedVal(e.target.value); setErrors(p => ({ ...p, opened: undefined })) }}
              placeholder="—" className={`input-base w-24 ${errors.opened ? 'border-red-400' : ''}`} min="0" />
            {errors.opened && <p className="text-xs text-red-500 mt-0.5">{errors.opened}</p>}
          </div>
          <div>
            <label className="label-sm">Tickets Resolvidos</label>
            <input type="number" value={resolvedVal}
              onChange={e => { setResolvedVal(e.target.value); setErrors(p => ({ ...p, resolved: undefined })) }}
              placeholder="—" className={`input-base w-24 ${errors.resolved ? 'border-red-400' : ''}`} min="0" />
            {errors.resolved && <p className="text-xs text-red-500 mt-0.5">{errors.resolved}</p>}
          </div>
          <div>
            <label className="label-sm">SLA 1ª Resp. (min)</label>
            <input type="number" value={slaVal} onChange={e => setSlaVal(e.target.value)}
              placeholder="—" className="input-base w-24" min="0" />
          </div>
          <div>
            <label className="label-sm">N1 (tickets)</label>
            <input type="number" value={n1Val} onChange={e => setN1Val(e.target.value)}
              placeholder="—" className="input-base w-20" min="0" />
          </div>
          <div>
            <label className="label-sm">N2 (tickets)</label>
            <input type="number" value={n2Val} onChange={e => setN2Val(e.target.value)}
              placeholder="—" className="input-base w-20" min="0" />
          </div>
          <div>
            <label className="label-sm">N3 (tickets)</label>
            <input type="number" value={n3Val} onChange={e => setN3Val(e.target.value)}
              placeholder="—" className="input-base w-20" min="0" />
          </div>
          <div className="pt-5">
            <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Indicadores calculados em tempo real */}
        {(openedVal !== '' || resolvedVal !== '') && (
          <div className="mt-3 flex gap-4 flex-wrap">
            <span className="text-xs text-text-tertiary">
              Taxa resolução: <strong className="text-text-primary">{fmtPct(calcPct(Number(resolvedVal) || 0, Number(openedVal) || 0))}</strong>
            </span>
            {n1Val !== '' && (
              <span className="text-xs text-text-tertiary">
                %N1: <strong className="text-text-primary">{fmtPct(calcPct(Number(n1Val) || 0, Number(resolvedVal) || 0))}</strong>
              </span>
            )}
            {n2Val !== '' && (
              <span className="text-xs text-text-tertiary">
                %N2: <strong className="text-text-primary">{fmtPct(calcPct(Number(n2Val) || 0, Number(resolvedVal) || 0))}</strong>
              </span>
            )}
            {n3Val !== '' && (
              <span className="text-xs text-text-tertiary">
                %N3: <strong className="text-text-primary">{fmtPct(calcPct(Number(n3Val) || 0, Number(resolvedVal) || 0))}</strong>
              </span>
            )}
          </div>
        )}
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
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map(u => (
                  <tr
                    key={u.ref_month}
                    className={`border-t border-border-tertiary hover:bg-bg-secondary transition-colors cursor-pointer ${u.ref_month === month ? 'bg-donc-sky/5' : ''}`}
                    onClick={() => {
                      setMonth(u.ref_month)
                      setOpenedVal(String(u.tickets_opened ?? ''))
                      setResolvedVal(String(u.tickets_resolved ?? ''))
                      setSlaVal(String(u.sla_first_response ?? ''))
                      setN1Val(String(u.n1_pct ?? ''))
                      setN2Val(String(u.n2_pct ?? ''))
                      setN3Val(String(u.n3_pct ?? ''))
                      setErrors({})
                    }}
                  >
                    <td className="px-4 py-2.5 font-medium text-text-primary">{fmtMonth(u.ref_month)}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.tickets_opened}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.tickets_resolved}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcPct(u.tickets_resolved, u.tickets_opened))}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.sla_first_response ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.n1_pct ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.n2_pct ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{u.n3_pct ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcPct(u.n1_pct, u.tickets_resolved))}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcPct(u.n2_pct, u.tickets_resolved))}</td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">{fmtPct(calcPct(u.n3_pct, u.tickets_resolved))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
