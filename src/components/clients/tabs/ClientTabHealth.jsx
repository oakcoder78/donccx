import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler
} from 'chart.js'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { useHealthConfig } from '../../../hooks/useHealthConfig'
import { useRecalculateHealth } from '../../../hooks/useHealthScore'
import { calculateHealthScore } from '../../../lib/healthScore'
import { ActionIcons } from '../../../lib/icons'
import { supabase } from '../../../lib/supabaseClient'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

const DIMS = [
  { key: 'uso',            label: 'Uso',           color: '#59c2ed' },
  { key: 'suporte',        label: 'Suporte',       color: '#1D9E75' },
  { key: 'relacionamento', label: 'Relacionamento', color: '#534AB7' },
  { key: 'financeiro',     label: 'Financeiro',    color: '#BA7517' },
  { key: 'projeto',        label: 'Projeto',       color: '#185FA5' },
]

function dimStatusColor(val, dimColor) {
  if (val >= 15) return dimColor
  if (val >= 10) return '#BA7517'
  return '#E24B4A'
}

function formatCalculatedAt(ts) {
  if (!ts) return 'Nunca recalculado'
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `Atualizado em ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`
}

function PointsBadge({ points }) {
  if (points > 0) return <span className="font-semibold text-xs" style={{ color: '#1D9E75' }}>+{points}</span>
  if (points < 0) return <span className="font-semibold text-xs" style={{ color: '#E24B4A' }}>{points}</span>
  return <span className="font-semibold text-xs text-text-tertiary">0</span>
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 14 14" fill="none"
      className="transition-transform duration-200"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DimPanel({ dim, score, appliedRules: dimApplied, allRules, hasBeenCalculated }) {
  const statusColor = dimStatusColor(score, dim.color)
  const visibleMods = dimApplied.filter(r => r.points !== 0)
  const hasData     = dimApplied.length > 0
  const isNoProjCase = dim.key === 'projeto' && dimApplied.some(r => r.rule_key === 'no_proj')

  const appliedKeys       = new Set(dimApplied.map(r => r.rule_key))
  const dimAllRules       = allRules.filter(r => r.dimension === dim.key)
  const negativeApplied   = dimApplied.filter(r => r.points < 0)
  const positiveNotApplied = dimAllRules.filter(r => r.points > 0 && !appliedKeys.has(r.rule_key))
  const suggestions = [
    ...negativeApplied.map(r => `Resolva "${r.label}" para recuperar ${Math.abs(r.points)} ponto${Math.abs(r.points) !== 1 ? 's' : ''}`),
    ...positiveNotApplied.map(r => `Conquiste "${r.label}" para ganhar +${r.points} ponto${r.points !== 1 ? 's' : ''}`),
  ]

  return (
    <div
      className="bg-bg-primary rounded-lg overflow-hidden"
      style={{ border: `1px solid ${dim.color}`, borderLeftWidth: 3 }}
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-border-tertiary">
        <span className="text-sm font-semibold" style={{ color: dim.color }}>{dim.label}</span>
        <span className="text-sm font-bold" style={{ color: statusColor }}>{score} / 20</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {!hasBeenCalculated ? (
          <p className="text-xs text-text-tertiary italic">
            Clique em Recalcular para gerar o diagnóstico desta dimensão.
          </p>
        ) : isNoProjCase ? (
          <p className="text-xs text-text-tertiary italic">
            Nenhum milestone ativo. Clientes sem projeto há 120+ dias geram alerta automático.
          </p>
        ) : !hasData ? (
          <p className="text-xs text-text-tertiary italic">Score base 20 — nenhum dado registrado</p>
        ) : visibleMods.length === 0 ? (
          <p className="text-xs text-text-tertiary italic">Score base 20 — nenhuma penalidade aplicada</p>
        ) : (
          <div className="space-y-1">
            {visibleMods.map(r => (
              <div
                key={r.rule_key}
                className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-md"
                style={{ backgroundColor: r.points > 0 ? '#1D9E7510' : '#E24B4A10' }}
              >
                <span className="text-xs text-text-secondary break-words min-w-0 flex-1">{r.label}</span>
                <PointsBadge points={r.points} />
              </div>
            ))}
          </div>
        )}

        {hasBeenCalculated && suggestions.length > 0 && !isNoProjCase && hasData && (
          <div className="pt-2 border-t border-border-primary">
            <p className="text-xs font-semibold text-text-secondary mb-2">Como melhorar</p>
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={i} className="text-xs text-text-tertiary flex items-start gap-1.5">
                  <span style={{ color: '#BA7517' }} className="flex-shrink-0 mt-0.5">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function ClientTabHealth({ client }) {
  const { data } = useHealthConfig()
  const config = data?.config
  const rules  = data?.rules || []
  const recalculate = useRecalculateHealth()

  const historyMonths = config?.history_months ?? 6
  const { data: historyRows = [] } = useQuery({
    queryKey: ['health_history', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('health_score_history')
        .select('ref_month, health_total')
        .eq('client_id', client.id)
        .order('ref_month', { ascending: true })
        .limit(historyMonths)
      if (error) { console.error('[ClientTabHealth] history query error:', error); return [] }
      return data ?? []
    },
  })

  const score       = client.health_total || 0
  const healthy     = config?.threshold_healthy  ?? 75
  const attention   = config?.threshold_attention ?? 50
  const status      = score >= healthy ? 'Saudável' : score >= attention ? 'Atenção' : 'Em Risco'
  const statusColor = score >= healthy ? '#1D9E75'  : score >= attention ? '#BA7517' : '#E24B4A'

  const hasBeenCalculated = !!client.health_calculated_at

  // Computa appliedRules no frontend a partir dos dados já carregados no client
  const liveAppliedRules = useMemo(() => {
    if (!rules.length) return null
    return calculateHealthScore(client, rules).appliedRules
  }, [client, rules])

  const [openMap, setOpenMap] = useState(() =>
    Object.fromEntries(DIMS.map(d => [d.key, false]))
  )

  function toggleDim(key) {
    setOpenMap(m => ({ ...m, [key]: !m[key] }))
  }

  const allOpen   = DIMS.every(d => openMap[d.key])
  const allClosed = DIMS.every(d => !openMap[d.key])

  function expandAll()  { setOpenMap(Object.fromEntries(DIMS.map(d => [d.key, true]))) }
  function collapseAll(){ setOpenMap(Object.fromEntries(DIMS.map(d => [d.key, false]))) }

  return (
    <div className="space-y-4">

      {/* Header: timestamp + botão */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary">
          {formatCalculatedAt(client.health_calculated_at)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={recalculate.isPending}
          onClick={() => recalculate.mutate({ client, rules })}
        >
          {recalculate.isPending ? 'Calculando...' : <span className="flex items-center gap-1.5"><ActionIcons.recalculate className="w-3.5 h-3.5" /> Recalcular</span>}
        </Button>
      </div>

      {/* Score total */}
      <Card className="flex items-center gap-6">
        <div>
          <div className="text-5xl font-bold" style={{ color: statusColor }}>{score}</div>
          <div className="text-sm font-medium mt-1" style={{ color: statusColor }}>{status}</div>
        </div>
        <div className="flex-1">
          <div className="h-3 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(score, 100)}%`, backgroundColor: statusColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-tertiary mt-1">
            <span>0</span>
            <span style={{ color: '#BA7517' }}>{attention} Atenção</span>
            <span style={{ color: '#1D9E75' }}>{healthy} Saudável</span>
            <span>100</span>
          </div>
        </div>
      </Card>

      {/* Cards de dimensão clicáveis */}
      <div>
        <div className="grid grid-cols-5 gap-3 items-start">
          {DIMS.map(d => {
            const val    = client[`health_${d.key}`] ?? 0
            const color  = dimStatusColor(val, d.color)
            const isOpen = openMap[d.key]
            return (
              <div key={d.key} className="flex flex-col gap-2">
                <button
                  onClick={() => toggleDim(d.key)}
                  className="w-full text-center rounded-lg p-3 transition-all cursor-pointer hover:shadow-md focus-visible:outline-none"
                  style={{
                    backgroundColor: isOpen ? `${d.color}0d` : 'var(--color-bg-primary)',
                    border: `1px solid ${isOpen ? d.color : 'var(--color-border-tertiary)'}`,
                    outline: 'none',
                  }}
                >
                  <div className="text-2xl font-bold mb-1" style={{ color }}>{val}</div>
                  <div className="text-xs text-text-tertiary mb-2">{d.label}</div>
                  <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (val / 20) * 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <div className="mt-2 flex justify-center text-text-tertiary">
                    <ChevronIcon open={isOpen} />
                  </div>
                </button>

                {isOpen && (
                  <DimPanel
                    dim={d}
                    score={val}
                    appliedRules={liveAppliedRules?.[d.key] ?? []}
                    allRules={rules}
                    hasBeenCalculated={hasBeenCalculated}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Controles */}
        <div className="mt-3 flex items-center justify-end gap-1">
          <Button size="xs" variant="ghost" onClick={expandAll} disabled={allOpen}>
            Expandir tudo
          </Button>
          <span className="text-text-tertiary text-xs select-none">·</span>
          <Button size="xs" variant="ghost" onClick={collapseAll} disabled={allClosed}>
            Colapsar tudo
          </Button>
        </div>
      </div>

      {/* Gráfico de evolução histórica */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">
          Evolução do Health Score
        </p>
        {historyRows.length < 2 ? (
          <p className="text-xs text-text-tertiary italic">
            Histórico disponível a partir do próximo recálculo.
          </p>
        ) : (
          <Line
            height={80}
            data={{
              labels: historyRows.map(r => fmtMonth(r.ref_month)),
              datasets: [{
                label: 'Health Score',
                data: historyRows.map(r => r.health_total),
                borderColor: '#173557',
                backgroundColor: 'rgba(23,53,87,0.08)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#173557',
              }],
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
              scales: {
                y: { min: 0, max: 100, grid: { display: false } },
                x: { grid: { display: false } },
              },
            }}
          />
        )}
      </div>
    </div>
  )
}
