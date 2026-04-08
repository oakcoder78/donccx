import { useState } from 'react'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { useHealthConfig } from '../../../hooks/useHealthConfig'
import { useRecalculateHealth } from '../../../hooks/useHealthScore'

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
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      className="transition-transform"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DimAccordion({ dim, score, appliedRules: dimApplied, allRules, open, onToggle }) {
  const statusColor = dimStatusColor(score, dim.color)
  const visibleMods = dimApplied.filter(r => r.points !== 0)
  const hasData = dimApplied.length > 0
  const isNoProjCase = dim.key === 'projeto' && dimApplied.some(r => r.rule_key === 'no_proj')

  // "Como melhorar": negative applied + positive unapplied
  const appliedKeys = new Set(dimApplied.map(r => r.rule_key))
  const dimAllRules = allRules.filter(r => r.dimension === dim.key)
  const negativeApplied = dimApplied.filter(r => r.points < 0)
  const positiveNotApplied = dimAllRules.filter(r => r.points > 0 && !appliedKeys.has(r.rule_key))
  const suggestions = [
    ...negativeApplied.map(r => `Resolva "${r.label}" para recuperar ${Math.abs(r.points)} ponto${Math.abs(r.points) !== 1 ? 's' : ''}`),
    ...positiveNotApplied.map(r => `Conquiste "${r.label}" para ganhar +${r.points} ponto${r.points !== 1 ? 's' : ''}`),
  ]

  return (
    <Card className="p-0 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-secondary transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-semibold" style={{ color: dim.color }}>{dim.label}</span>
        <div className="flex items-center gap-3 text-text-tertiary">
          <span className="text-sm font-bold" style={{ color: statusColor }}>{score} pts</span>
          <ChevronIcon open={open} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-primary pt-3">

          {/* Modificadores aplicados */}
          {isNoProjCase ? (
            <p className="text-xs text-text-tertiary italic">
              Nenhum milestone ativo. Clientes sem projeto há 120+ dias geram alerta automático.
            </p>
          ) : !hasData ? (
            <p className="text-xs text-text-tertiary italic">Score base 20 — nenhum dado registrado</p>
          ) : visibleMods.length === 0 ? (
            <p className="text-xs text-text-tertiary italic">Score base 20 — nenhuma penalidade aplicada</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-2">
              {visibleMods.map(r => (
                <div
                  key={r.rule_key}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md"
                  style={{ backgroundColor: r.points > 0 ? '#1D9E7510' : '#E24B4A10' }}
                >
                  <span className="text-xs text-text-secondary">{r.label}</span>
                  <PointsBadge points={r.points} />
                </div>
              ))}
            </div>
          )}

          {/* Como melhorar */}
          {suggestions.length > 0 && !isNoProjCase && hasData && (
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
      )}
    </Card>
  )
}

export function ClientTabHealth({ client }) {
  const { data } = useHealthConfig()
  const config = data?.config
  const rules  = data?.rules || []
  const recalculate = useRecalculateHealth()

  const score     = client.health_total || 0
  const healthy   = config?.threshold_healthy  ?? 75
  const attention = config?.threshold_attention ?? 50
  const status      = score >= healthy ? 'Saudável' : score >= attention ? 'Atenção' : 'Em Risco'
  const statusColor = score >= healthy ? '#1D9E75'  : score >= attention ? '#BA7517' : '#E24B4A'

  const appliedRules = recalculate.data?.appliedRules ?? null

  // Accordion state: one entry per dim key
  const [openMap, setOpenMap] = useState(() =>
    Object.fromEntries(DIMS.map(d => [d.key, false]))
  )

  function toggleDim(key) {
    setOpenMap(m => ({ ...m, [key]: !m[key] }))
  }

  const allOpen  = DIMS.every(d => openMap[d.key])
  const allClose = DIMS.every(d => !openMap[d.key])

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
          {recalculate.isPending ? 'Calculando...' : '🩺 Recalcular'}
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

      {/* Cards de dimensão com status de cor individual */}
      <div className="grid md:grid-cols-5 gap-3">
        {DIMS.map(d => {
          const val   = client[`health_${d.key}`] ?? 0
          const color = dimStatusColor(val, d.color)
          return (
            <Card key={d.key} className="text-center">
              <div className="text-2xl font-bold mb-1" style={{ color }}>{val}</div>
              <div className="text-xs text-text-tertiary mb-2">{d.label}</div>
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (val / 20) * 100)}%`, backgroundColor: color }}
                />
              </div>
            </Card>
          )
        })}
      </div>

      {/* Log detalhado — só aparece após recálculo */}
      {appliedRules && (
        <>
          {/* Barra de controle expandir/colapsar */}
          <div className="flex items-center justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={expandAll} disabled={allOpen}>
              Expandir tudo
            </Button>
            <span className="text-text-tertiary text-xs">·</span>
            <Button size="xs" variant="ghost" onClick={collapseAll} disabled={allClose}>
              Colapsar tudo
            </Button>
          </div>

          {/* Sanfonas por dimensão */}
          <div className="space-y-2">
            {DIMS.map(d => (
              <DimAccordion
                key={d.key}
                dim={d}
                score={client[`health_${d.key}`] ?? 0}
                appliedRules={appliedRules[d.key] ?? []}
                allRules={rules}
                open={openMap[d.key]}
                onToggle={() => toggleDim(d.key)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
