import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { HealthDimensionIcons, SettingsMenuIcons, ActionIcons } from '../../lib/icons'
import { useHealthConfig, useHealthConfigMutations } from '../../hooks/useHealthConfig'
import { recalculateAllHealthScores } from '../../hooks/useHealthScore'
import { useAuth } from '../../contexts/AuthContext'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'

const DIMS = ['uso','suporte','relacionamento','financeiro','projeto']

const DIM_META = {
  uso:            { label: 'Uso',            color: '#59c2ed' },
  suporte:        { label: 'Suporte',        color: '#1D9E75' },
  relacionamento: { label: 'Relacionamento', color: '#d3da47' },
  financeiro:     { label: 'Financeiro',     color: '#185FA5' },
  projeto:        { label: 'Projeto',        color: '#534AB7' },
}

const STAGE_GROUPS = [
  { key: 'onboarding',           label: 'Onboarding' },
  { key: 'producao',             label: 'Produção' },
  { key: 'producao_sem_projeto', label: 'Produção sem Projeto' },
]

const WEIGHT_DIMS = [
  { key: 'uso',            label: 'Uso' },
  { key: 'relacionamento', label: 'Relacionamento' },
  { key: 'projeto',        label: 'Projeto' },
  { key: 'suporte',        label: 'Suporte' },
  { key: 'financeiro',     label: 'Financeiro' },
  { key: 'temperatura',    label: 'Temperatura CSM' },
]

// ── Seção: Thresholds ─────────────────────────────────────────────────────────
function ThresholdsCard({ config, isAdmin, onSave }) {
  const [vals, setVals] = useState({ threshold_healthy: 75, threshold_attention: 50 })
  useEffect(() => {
    if (config) setVals({ threshold_healthy: config.threshold_healthy, threshold_attention: config.threshold_attention })
  }, [config])

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
      <p className="text-sm font-semibold text-text-primary mb-3">Faixas de classificação</p>
      <div className="flex gap-3 mb-3">
        <div className="flex-1">
          <label className="label-sm">🟢 Saudável (acima de)</label>
          <input type="number" value={vals.threshold_healthy}
            onChange={e => setVals(p => ({ ...p, threshold_healthy: Number(e.target.value) }))}
            className="input-base w-full" min="0" max="100" disabled={!isAdmin} />
        </div>
        <div className="flex-1">
          <label className="label-sm">🟡 Atenção (acima de)</label>
          <input type="number" value={vals.threshold_attention}
            onChange={e => setVals(p => ({ ...p, threshold_attention: Number(e.target.value) }))}
            className="input-base w-full" min="0" max="100" disabled={!isAdmin} />
        </div>
        <div className="flex items-end">
          <div className="px-3 py-2 rounded-md text-xs font-medium bg-bg-secondary text-text-tertiary border border-border-tertiary">
            🔴 Risco: abaixo de {vals.threshold_attention}
          </div>
        </div>
      </div>
      {isAdmin && (
        <Button size="sm" onClick={() => onSave(vals)}>Salvar faixas</Button>
      )}
    </div>
  )
}

// ── Seção: Pesos por Estágio ──────────────────────────────────────────────────
function WeightsCard({ isAdmin }) {
  const qc = useQueryClient()
  const [activeGroup, setActiveGroup] = useState('producao')
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)

  const { data: rawWeights = [] } = useQuery({
    queryKey: ['health_dimension_weights'],
    queryFn: async () => {
      const { data } = await supabase.from('health_dimension_weights').select('*')
      return data ?? []
    },
  })

  useEffect(() => {
    if (!rawWeights.length) return
    const init = {}
    for (const row of rawWeights) {
      if (!init[row.stage_group]) init[row.stage_group] = {}
      init[row.stage_group][row.dimension] = String(row.weight)
    }
    setEdits(init)
  }, [rawWeights])

  function getVal(group, dim) { return edits[group]?.[dim] ?? '0' }
  function setVal(group, dim, val) {
    setEdits(prev => ({ ...prev, [group]: { ...(prev[group] ?? {}), [dim]: val } }))
  }
  function getSum(group) {
    return WEIGHT_DIMS.reduce((s, d) => s + (parseInt(getVal(group, d.key), 10) || 0), 0)
  }

  async function saveGroup(groupKey) {
    const sum = getSum(groupKey)
    if (sum !== 100) { toast.error(`A soma dos pesos deve ser 100 (atual: ${sum})`); return }
    setSaving(true)
    try {
      const rows = WEIGHT_DIMS.map(d => ({
        stage_group: groupKey, dimension: d.key,
        weight: parseInt(getVal(groupKey, d.key), 10) || 0,
      }))
      const { error } = await supabase
        .from('health_dimension_weights')
        .upsert(rows, { onConflict: 'stage_group,dimension' })
      if (error) throw error
      toast.success('Pesos salvos')
      qc.invalidateQueries({ queryKey: ['health_dimension_weights'] })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const sum = getSum(activeGroup)
  const valid = sum === 100

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
      <p className="text-sm font-semibold text-text-primary mb-1">Pesos por estágio</p>
      <p className="text-xs text-text-tertiary mb-3">Importância de cada dimensão no cálculo. A soma deve ser 100.</p>

      {/* Abas */}
      <div className="flex gap-1 bg-bg-tertiary p-1 rounded-md w-fit mb-4">
        {STAGE_GROUPS.map(g => (
          <button key={g.key} onClick={() => setActiveGroup(g.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeGroup === g.key
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Grid de inputs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {WEIGHT_DIMS.map(d => (
          <div key={d.key}>
            <label className="label-sm">{d.label}</label>
            <div className="flex items-center gap-1">
              <input
                type="number" min="0" max="100"
                value={getVal(activeGroup, d.key)}
                onChange={e => setVal(activeGroup, d.key, e.target.value)}
                disabled={!isAdmin}
                className="input-base w-full text-right"
              />
              <span className="text-xs text-text-tertiary flex-shrink-0">%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer com soma e botão */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${valid ? 'bg-donc-verde' : 'bg-donc-red'}`} />
          <span className={`text-xs font-semibold ${valid ? 'text-donc-verde' : 'text-donc-red'}`}>
            Soma: {sum}/100
          </span>
          {!valid && (
            <span className="text-xs text-text-tertiary">
              ({sum > 100 ? `-${sum - 100}` : `+${100 - sum}`} para equilibrar)
            </span>
          )}
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => saveGroup(activeGroup)} disabled={saving || !valid}>
            {saving ? 'Salvando...' : `Salvar ${STAGE_GROUPS.find(g => g.key === activeGroup)?.label}`}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Seção: Regras por dimensão ────────────────────────────────────────────────
function RulesCard({ rules, isAdmin, onSaveAll }) {
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(null)

  function getVal(id, current) {
    return edits[id] !== undefined ? edits[id] : String(current)
  }

  async function saveDim(dim, dimRules) {
    setSaving(dim)
    try {
      await Promise.all(dimRules.map(r => onSaveAll(r.id, parseInt(getVal(r.id, r.points), 10))))
      toast.success(`Regras de ${DIM_META[dim]?.label ?? dim} salvas`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
      <p className="text-sm font-semibold text-text-primary mb-1">Regras de pontuação</p>
      <p className="text-xs text-text-tertiary mb-4">Modificadores aplicados em cada dimensão. Valores negativos penalizam, positivos bonificam.</p>
      <div className="space-y-4">
        {DIMS.map(dim => {
          const dimRules = rules.filter(r => r.dimension === dim)
          if (!dimRules.length) return null
          const meta = DIM_META[dim]
          return (
            <div key={dim} className="border border-border-tertiary rounded-lg overflow-hidden">
              {/* Header da dimensão */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border-tertiary">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                  <span className="text-sm font-semibold text-text-primary">{meta.label}</span>
                  <span className="text-xs text-text-tertiary">({dimRules.length} regras)</span>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="secondary"
                    onClick={() => saveDim(dim, dimRules)}
                    disabled={saving === dim}
                  >
                    {saving === dim ? 'Salvando...' : 'Salvar'}
                  </Button>
                )}
              </div>
              {/* Regras em grid */}
              <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-2">
                {dimRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary flex-1 min-w-0 truncate" title={rule.label}>
                      {rule.label}
                    </span>
                    <input
                      type="number"
                      value={getVal(rule.id, rule.points)}
                      onChange={e => setEdits(prev => ({ ...prev, [rule.id]: e.target.value }))}
                      disabled={!isAdmin}
                      className="input-base w-20 text-right flex-shrink-0"
                    />
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

// ── Componente principal ──────────────────────────────────────────────────────
export function SettingsHealth() {
  const HealthIcon = SettingsMenuIcons['health']
  const { data, isLoading } = useHealthConfig()
  const { updateConfig, updateRule } = useHealthConfigMutations()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
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

  async function handleSaveThresholds(vals) {
    if (!data?.config) return
    await updateConfig.mutateAsync({ id: data.config.id, ...vals })
    toast.success('Faixas salvas')
  }

  async function handleSaveRule(id, points) {
    await updateRule.mutateAsync({ id, points })
  }

  if (isLoading) return <PageSpinner />
  const { config, rules = [] } = data || {}

  return (
    <div className="max-w-3xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <HealthIcon className="w-4 h-4" /> Health Score
        </h2>
        {isAdmin && (
          <Button
            size="sm"
            onClick={handleRecalculateAll}
            disabled={recalculating}
          >
            {recalculating
              ? 'Calculando…'
              : <span className="flex items-center gap-1.5">
                  <ActionIcons.recalculate className="w-3.5 h-3.5" /> Recalcular todos
                </span>
            }
          </Button>
        )}
      </div>

      {/* Accordion: Entenda o Health Score */}
      <HealthScoreAccordion />

      {/* Thresholds */}
      <ThresholdsCard config={config} isAdmin={isAdmin} onSave={handleSaveThresholds} />

      {/* Pesos por Estágio */}
      <WeightsCard isAdmin={isAdmin} />

      {/* Regras */}
      <RulesCard rules={rules} isAdmin={isAdmin} onSaveAll={handleSaveRule} />

    </div>
  )
}

// ── Accordion informativo ─────────────────────────────────────────────────────
function HealthScoreAccordion() {
  const InfoIcon = ActionIcons.info
  const [open, setOpen] = useState(false)
  const DIMENSIONS_INFO = [
    { name: 'Uso',             desc: 'Adoção da plataforma — módulos ativos, usuários e ordens de serviço' },
    { name: 'Suporte',         desc: 'Qualidade do atendimento — tickets, SLA e escaladas N3' },
    { name: 'Relacionamento',  desc: 'Mapeamento e engajamento de contatos-chave no cliente' },
    { name: 'Financeiro',      desc: 'Situação de pagamento e adimplência' },
    { name: 'Projeto',         desc: 'Milestones e progresso do onboarding' },
    { name: 'Temperatura CSM', desc: 'Percepção qualitativa do CSM sobre o relacionamento' },
  ]
  return (
    <div className="border border-border-tertiary rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary hover:bg-bg-tertiary transition-colors text-left"
      >
        <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <InfoIcon className="w-4 h-4" /> Entenda o Health Score
        </span>
        <svg className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-4 bg-bg-secondary border-t border-border-tertiary space-y-3">
          <p className="text-sm text-text-secondary">
            Score de <strong>0 a 100</strong> composto por <strong>6 dimensões</strong> com pesos configuráveis por estágio do cliente.
          </p>
          <div className="space-y-1.5">
            {DIMENSIONS_INFO.map(d => (
              <div key={d.name} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-donc-sky mt-1.5 flex-shrink-0" />
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
