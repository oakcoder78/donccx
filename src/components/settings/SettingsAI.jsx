import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

const DEFAULT_MODEL  = 'google/gemini-2.0-flash-exp'
const SUGGESTED_MODELS = [
  'google/gemini-2.0-flash-exp',
  'google/gemini-2.5-pro-exp-03-25',
  'meta-llama/llama-3.1-8b-instruct',
  'mistralai/mistral-7b-instruct',
]

export function SettingsAI() {
  const [model,   setModel]   = useState(DEFAULT_MODEL)
  const [prompt,  setPrompt]  = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('freshdesk_config').select('data').eq('key', 'ai_config').maybeSingle(),
      supabase.from('freshdesk_config').select('data').eq('key', 'ai_prompt').maybeSingle(),
    ]).then(([{ data: cfg }, { data: pmt }]) => {
      if (cfg?.data?.model) setModel(cfg.data.model)
      if (typeof pmt?.data === 'string') setPrompt(pmt.data)
      setLoading(false)
    })
  }, [])

  async function handleSave() {
    if (!model.trim()) return
    setSaving(true)
    const now = new Date().toISOString()

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('freshdesk_config').upsert(
        { key: 'ai_config', data: { model: model.trim() }, updated_at: now },
        { onConflict: 'key' },
      ),
      supabase.from('freshdesk_config').upsert(
        { key: 'ai_prompt', data: prompt.trim(), updated_at: now },
        { onConflict: 'key' },
      ),
    ])

    if (e1 || e2) {
      toast.error((e1 || e2).message)
    } else {
      toast.success('Configuração de IA salva')
    }
    setSaving(false)
  }

  if (loading) return <div className="text-sm text-text-tertiary">Carregando...</div>

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-1">🤖 Configurações de IA</h2>
        <p className="text-xs text-text-tertiary">
          Define o modelo OpenRouter e o prompt personalizado utilizados para análise automática de atendimentos WhatsApp.
        </p>
      </div>

      <div className="space-y-4">
        {/* Modelo */}
        <div>
          <label className="label-sm">Modelo OpenRouter</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            className="input-base w-full font-mono text-sm mt-1"
          />
        </div>

        <div className="bg-bg-secondary border border-border-tertiary rounded-lg p-3">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
            Modelos sugeridos (referência)
          </p>
          <ul className="space-y-1">
            {SUGGESTED_MODELS.map(m => (
              <li
                key={m}
                onClick={() => setModel(m)}
                className="text-xs font-mono text-text-secondary hover:text-donc-sky cursor-pointer transition-colors"
                title="Clique para usar este modelo"
              >
                {m}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-text-tertiary mt-2">Clique em um modelo para selecionar.</p>
        </div>

        {/* Prompt personalizado */}
        <div>
          <label className="label-sm">Prompt personalizado</label>
          <p className="text-[11px] text-text-tertiary mb-1">
            Contexto adicional sobre o produto/empresa. Será adicionado antes das instruções de análise da IA.
            Deixe em branco para usar apenas o prompt padrão.
          </p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={6}
            placeholder="Ex: Nossa empresa é a Donc, fornecedora de software de gestão para distribuidoras. Os principais módulos são: Pedidos, Financeiro, Estoque e Integração com ERPs. Priorize tickets de Integração e Financeiro para o grupo N2."
            className="input-base w-full text-sm mt-1 resize-y font-mono"
          />
          <p className="text-[10px] text-text-tertiary mt-1">
            {prompt.trim().length} caracteres
          </p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || !model.trim()}>
        {saving ? 'Salvando…' : 'Salvar configurações de IA'}
      </Button>
    </div>
  )
}
