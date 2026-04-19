import { useState, useEffect } from 'react'
import { HealthDimensionIcons, SettingsMenuIcons, ActionIcons } from '../../lib/icons'
import { useHealthConfig, useHealthConfigMutations } from '../../hooks/useHealthConfig'
import { recalculateAllHealthScores } from '../../hooks/useHealthScore'
import { useAuth } from '../../contexts/AuthContext'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

const DIMS = ['uso','suporte','relacionamento','financeiro','projeto']

const DIMENSIONS_INFO = [
  { Icon: HealthDimensionIcons.health_uso,            name: 'Uso',            desc: 'Adoção da plataforma — módulos ativos, usuários e ordens de serviço' },
  { Icon: HealthDimensionIcons.health_suporte,        name: 'Suporte',        desc: 'Qualidade do atendimento — tickets, SLA e escaladas N3' },
  { Icon: HealthDimensionIcons.health_relacionamento, name: 'Relacionamento', desc: 'Mapeamento e engajamento de contatos-chave no cliente' },
  { Icon: HealthDimensionIcons.health_financeiro,     name: 'Financeiro',     desc: 'Classificação ABC e situação de pagamento' },
  { Icon: HealthDimensionIcons.health_projeto,        name: 'Projeto',        desc: 'Milestones e progresso do onboarding' },
]

function HealthScoreAccordion() {
  const InfoIcon = ActionIcons.info
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border-tertiary rounded-lg mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary hover:bg-bg-tertiary transition-colors text-left"
      >
        <span className="text-sm font-semibold text-text-primary flex items-center gap-2"><InfoIcon className="w-4 h-4" /> Entenda o Health Score</span>
        <svg
          className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-4 bg-bg-secondary border-t border-border-tertiary space-y-4">
          <p className="text-sm text-text-secondary">
            Score de <strong>0 a 100</strong> que mede a saúde do relacionamento com o cliente,
            composto por <strong>5 dimensões</strong> de até 20 pontos cada.
          </p>
          <div className="space-y-2">
            {DIMENSIONS_INFO.map(d => (
              <div key={d.name} className="flex items-start gap-2">
                <d.Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-tertiary" />
                <div>
                  <span className="text-sm font-medium text-text-primary">{d.name}</span>
                  <span className="text-sm text-text-tertiary"> — {d.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 pt-1">
            <span className="text-sm">🟢 <strong>Saudável</strong> ≥ 75</span>
            <span className="text-sm">🟡 <strong>Atenção</strong> ≥ 50</span>
            <span className="text-sm">🔴 <strong>Risco</strong> &lt; 50</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function SettingsHealth() {
  const HealthIcon = SettingsMenuIcons['health']
  const { data, isLoading } = useHealthConfig()
  const { updateConfig, updateRule } = useHealthConfigMutations()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [thresholds, setThresholds] = useState({ threshold_healthy: 75, threshold_attention: 50 })
  const [ruleEdits, setRuleEdits] = useState({})
  const [recalculating, setRecalculating] = useState(false)

  async function handleRecalculateAll() {
    setRecalculating(true)
    try {
      const count = await recalculateAllHealthScores()
      toast.success(`Health Score recalculado para ${count} cliente${count !== 1 ? 's' : ''}`, { icon: '🩺' })
    } catch (e) {
      toast.error(e.message || 'Erro ao recalcular health scores')
    } finally {
      setRecalculating(false)
    }
  }

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
        <h2 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2"><HealthIcon className="w-4 h-4" /> Health Score</h2>

        <HealthScoreAccordion />

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

        {/* Recalcular todos — admin only */}
        {isAdmin && (
          <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">Recalcular Health Scores</p>
              <p className="text-xs text-text-tertiary mt-0.5">Atualiza o score de todos os clientes ativos com base nos dados atuais.</p>
            </div>
            <Button size="sm" onClick={handleRecalculateAll} disabled={recalculating}>
              {recalculating ? 'Calculando…' : 'Recalcular todos'}
            </Button>
          </div>
        )}

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
