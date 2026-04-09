import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

function useDonkieConfig() {
  return useQuery({
    queryKey: ['donkie_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donkie_config')
        .select('*')
        .eq('id', 1)
        .single()
      if (error) { console.error('[SettingsDonkie]', error); return null }
      return data
    },
    retry: 0,
  })
}

const FIELD_CLS = 'w-full border border-border-secondary rounded-md px-3 py-2 text-sm bg-bg-primary focus:outline-none focus:border-donc-sky resize-none font-mono'

export function SettingsDonkie() {
  const { data: config, isLoading } = useDonkieConfig()
  const qc = useQueryClient()

  const [form, setForm] = useState({
    system_prompt:      '',
    personality:        '',
    domain_context:     '',
    default_mode:       'discussao',
    allow_cross_client: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (config) setForm({
      system_prompt:      config.system_prompt      ?? '',
      personality:        config.personality        ?? '',
      domain_context:     config.domain_context     ?? '',
      default_mode:       config.default_mode       ?? 'discussao',
      allow_cross_client: config.allow_cross_client ?? true,
    })
  }, [config?.id])

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('donkie_config')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['donkie_config'] })
      toast.success('Configurações do Donkie salvas')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <p className="text-sm text-text-tertiary py-6">Carregando…</p>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-1">Donkie — Assistente IA</h2>
        <p className="text-xs text-text-tertiary">
          Configure o comportamento e a personalidade do Donkie. As alterações entram em vigor imediatamente para todos os usuários.
        </p>
      </div>

      {/* System Prompt */}
      <div className="space-y-1.5">
        <label className="label-sm">System Prompt</label>
        <p className="text-xs text-text-tertiary mb-1">
          Instruções base que definem identidade, conhecimento e regras do Donkie.
        </p>
        <textarea
          value={form.system_prompt}
          onChange={e => setForm(p => ({ ...p, system_prompt: e.target.value }))}
          rows={10}
          className={FIELD_CLS}
        />
      </div>

      {/* Personality */}
      <div className="space-y-1.5">
        <label className="label-sm">Personalidade</label>
        <p className="text-xs text-text-tertiary mb-1">
          Descrição curta do estilo de comunicação (usada internamente como referência).
        </p>
        <textarea
          value={form.personality}
          onChange={e => setForm(p => ({ ...p, personality: e.target.value }))}
          rows={3}
          className={FIELD_CLS}
        />
      </div>

      {/* Domain Context */}
      <div className="space-y-1.5">
        <label className="label-sm">Contexto de Domínio</label>
        <p className="text-xs text-text-tertiary mb-1">
          Segmentos, operações e contexto de negócio da Donc.
        </p>
        <textarea
          value={form.domain_context}
          onChange={e => setForm(p => ({ ...p, domain_context: e.target.value }))}
          rows={3}
          className={FIELD_CLS}
        />
      </div>

      {/* Default Mode */}
      <div className="space-y-1.5">
        <label className="label-sm">Modo Padrão</label>
        <select
          value={form.default_mode}
          onChange={e => setForm(p => ({ ...p, default_mode: e.target.value }))}
          className="input-base w-48"
        >
          <option value="discussao">Discussão</option>
          <option value="implementacao">Implementação</option>
        </select>
      </div>

      {/* Allow Cross Client */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={form.allow_cross_client}
            onChange={e => setForm(p => ({ ...p, allow_cross_client: e.target.checked }))}
          />
          <div className="w-10 h-5 bg-bg-tertiary rounded-full peer peer-checked:bg-donc-navy
                          after:content-[''] after:absolute after:top-0.5 after:left-0.5
                          after:bg-white after:rounded-full after:h-4 after:w-4
                          after:transition-all peer-checked:after:translate-x-5 border border-border-secondary" />
        </label>
        <div>
          <p className="text-sm font-medium text-text-primary">Permitir comparação entre clientes</p>
          <p className="text-xs text-text-tertiary">
            Quando ativo, o Donkie pode mencionar padrões de outros clientes da carteira.
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-border-tertiary">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  )
}
