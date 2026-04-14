import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'

const DEFAULT_MODEL  = 'google/gemini-2.0-flash-exp'
const SUGGESTED_MODELS = [
  'google/gemini-2.0-flash-exp',
  'meta-llama/llama-3.1-8b-instruct',
  'mistralai/mistral-7b-instruct',
]

export function SettingsAI() {
  const [model,   setModel]   = useState(DEFAULT_MODEL)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    supabase
      .from('freshdesk_config')
      .select('data')
      .eq('key', 'ai_config')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.data?.model) setModel(data.data.model)
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    if (!model.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('freshdesk_config')
      .upsert(
        { key: 'ai_config', data: { model: model.trim() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) {
      toast.error(error.message)
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
          Define o modelo OpenRouter utilizado para análise automática de atendimentos WhatsApp.
        </p>
      </div>

      <div className="space-y-3">
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
      </div>

      <Button onClick={handleSave} disabled={saving || !model.trim()}>
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  )
}
