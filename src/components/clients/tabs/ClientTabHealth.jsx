import { Card } from '../../ui/Card'
import { HealthBar } from '../../ui/HealthBar'
import { Button } from '../../ui/Button'
import { useHealthConfig } from '../../../hooks/useHealthConfig'
import { useRecalculateHealth } from '../../../hooks/useHealthScore'

const DIMS = [
  { key: 'uso',           label: 'Uso',           color: '#59c2ed' },
  { key: 'suporte',       label: 'Suporte',       color: '#1D9E75' },
  { key: 'relacionamento',label: 'Relacionamento', color: '#534AB7' },
  { key: 'financeiro',    label: 'Financeiro',    color: '#BA7517' },
  { key: 'projeto',       label: 'Projeto',       color: '#185FA5' },
]

function PointsBadge({ points }) {
  if (points > 0)  return <span className="font-medium text-donc-verde">+{points}</span>
  if (points < 0)  return <span className="font-medium text-donc-red">{points}</span>
  return <span className="font-medium text-text-tertiary">0</span>
}

export function ClientTabHealth({ client }) {
  const { data } = useHealthConfig()
  const config  = data?.config
  const rules   = data?.rules || []
  const recalculate = useRecalculateHealth()

  const score       = client.health_total || 0
  const healthy     = config?.threshold_healthy  ?? 75
  const attention   = config?.threshold_attention ?? 50
  const status      = score >= healthy ? 'Saudável' : score >= attention ? 'Atenção' : 'Em Risco'
  const statusColor = score >= healthy ? '#1D9E75'  : score >= attention ? '#BA7517' : '#E24B4A'

  // appliedRules disponível após o primeiro recálculo na sessão
  const appliedRules = recalculate.data?.appliedRules ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span />
        <Button
          size="sm"
          variant="secondary"
          disabled={recalculate.isPending}
          onClick={() => recalculate.mutate({ client, rules })}
        >
          {recalculate.isPending ? 'Calculando...' : '🩺 Recalcular'}
        </Button>
      </div>

      {/* Score card */}
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
            <span className="text-donc-amber">{attention} Atenção</span>
            <span className="text-donc-verde">{healthy} Saudável</span>
            <span>100</span>
          </div>
        </div>
      </Card>

      {/* Dimension scores */}
      <div className="grid md:grid-cols-5 gap-3">
        {DIMS.map(d => {
          const val = client[`health_${d.key}`] || 0
          return (
            <Card key={d.key} className="text-center">
              <div className="text-2xl font-bold mb-1" style={{ color: d.color }}>{val}</div>
              <div className="text-xs text-text-tertiary mb-2">{d.label}</div>
              <HealthBar value={val} max={20} color={d.color} />
            </Card>
          )
        })}
      </div>

      {/* Applied rules por dimensão — visível após recálculo */}
      {appliedRules && (
        <div className="space-y-3">
          {DIMS.map(d => {
            const dimApplied = appliedRules[d.key] ?? []
            return (
              <Card key={d.key}>
                <h4 className="text-sm font-semibold mb-2" style={{ color: d.color }}>{d.label}</h4>
                {dimApplied.length === 0 ? (
                  <p className="text-xs text-text-tertiary italic">
                    Nenhum modificador aplicado — score base 20
                  </p>
                ) : (
                  <div className="grid md:grid-cols-3 gap-2">
                    {dimApplied.map(r => (
                      <div
                        key={r.rule_key}
                        className="flex items-center justify-between text-sm px-2 py-1.5 bg-bg-secondary rounded-md"
                      >
                        <span className="text-text-secondary">{r.label}</span>
                        <PointsBadge points={r.points} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
