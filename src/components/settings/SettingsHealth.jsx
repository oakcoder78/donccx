import { useState, useEffect } from 'react'
import { useHealthConfig, useHealthConfigMutations } from '../../hooks/useHealthConfig'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'

const DIMS = ['uso','suporte','relacionamento','financeiro','projeto']

export function SettingsHealth() {
  const { data, isLoading } = useHealthConfig()
  const { updateConfig, updateRule } = useHealthConfigMutations()

  const [thresholds, setThresholds] = useState({ threshold_healthy: 75, threshold_attention: 50 })
  const [ruleEdits, setRuleEdits] = useState({})

  useEffect(() => {
    if (data?.config) setThresholds({ threshold_healthy: data.config.threshold_healthy, threshold_attention: data.config.threshold_attention })
  }, [data])

  if (isLoading) return <PageSpinner />
  const { config, rules = [] } = data || {}

  async function saveThresholds() {
    if (!config) return
    await updateConfig.mutateAsync({ id: config.id, ...thresholds })
  }

  async function saveRule(rule) {
    const pts = ruleEdits[rule.id] ?? rule.points
    await updateRule.mutateAsync({ id: rule.id, points: Number(pts) })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-4">❤️ Health Score</h2>

        {/* Thresholds */}
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Thresholds</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label-sm">Saudável (acima de)</label>
              <input type="number" value={thresholds.threshold_healthy}
                onChange={e => setThresholds(p => ({ ...p, threshold_healthy: Number(e.target.value) }))}
                className="input-base w-full" min="0" max="100" />
            </div>
            <div>
              <label className="label-sm">Atenção (acima de)</label>
              <input type="number" value={thresholds.threshold_attention}
                onChange={e => setThresholds(p => ({ ...p, threshold_attention: Number(e.target.value) }))}
                className="input-base w-full" min="0" max="100" />
            </div>
          </div>
          <Button size="sm" onClick={saveThresholds} disabled={updateConfig.isPending}>Salvar</Button>
        </div>

        {/* Rules by dimension */}
        {DIMS.map(dim => {
          const dimRules = rules.filter(r => r.dimension === dim)
          return (
            <div key={dim} className="bg-bg-primary border border-border-tertiary rounded-lg p-4 mb-3">
              <h3 className="text-sm font-semibold text-text-primary capitalize mb-3">{dim}</h3>
              <div className="space-y-2">
                {dimRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary flex-1">{rule.label}</span>
                    <input
                      type="number"
                      value={ruleEdits[rule.id] ?? rule.points}
                      onChange={e => setRuleEdits(p => ({ ...p, [rule.id]: e.target.value }))}
                      className="input-base w-20 text-center"
                    />
                    <Button size="sm" variant="secondary" onClick={() => saveRule(rule)} disabled={updateRule.isPending}>
                      Salvar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
