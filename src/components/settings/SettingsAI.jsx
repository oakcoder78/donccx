import { useState, useEffect } from 'react'
import { Icons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import toast from 'react-hot-toast'

const FALLBACK_MODELS = [
  'openai/gpt-oss-20b:free',
  'openrouter/free',
  'nvidia/nemotron-3-super-120b-a12b-20230311:free',
]

// ── Estilos inline reutilizados ────────────────────────────────────────────────
const S = {
  section: {
    backgroundColor: '#fff',
    border: '0.5px solid #e8e7e3',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1a1a18',
    margin: '0 0 4px',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#888780',
    margin: '0 0 18px',
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#888780',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d4d3ce',
    borderRadius: 7,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
    color: '#1a1a18',
    backgroundColor: '#fff',
  },
  fieldBox: { marginBottom: 12 },
  btn: (disabled) => ({
    padding: '9px 20px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: disabled ? '#e8e7e3' : '#173557',
    color: disabled ? '#888780' : '#fff',
    transition: 'all 0.15s',
    marginTop: 4,
  }),
}

export function SettingsAI() {
  const AIIcon = Icons.Sparkles
  const [loading, setLoading] = useState(true)

  // ── Modelos ─────────────────────────────────────────────────────────────────
  const [model1, setModel1] = useState('')
  const [model2, setModel2] = useState('')
  const [model3, setModel3] = useState('')
  const [savingModels, setSavingModels] = useState(false)

  // ── Prompt ──────────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)

  // ── Email Prompt ──────────────────────────────────────────────────────────────
  const [emailPrompt, setEmailPrompt] = useState('')
  const [savingEmailPrompt, setSavingEmailPrompt] = useState(false)

  // ── Debug ────────────────────────────────────────────────────────────────────
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [savingDebug, setSavingDebug] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: mRow }, { data: pRow }, { data: dRow }, { data: eRow }] = await Promise.all([
        supabase.from('freshdesk_config').select('data').eq('key', 'ai_models').maybeSingle(),
        supabase.from('freshdesk_config').select('data').eq('key', 'ai_prompt').maybeSingle(),
        supabase.from('freshdesk_config').select('data').eq('key', 'debug_config').maybeSingle(),
        supabase.from('freshdesk_config').select('data').eq('key', 'email_rewrite_prompt').maybeSingle(),
      ])

      // Modelos
      const models = Array.isArray(mRow?.data?.models) ? mRow.data.models : FALLBACK_MODELS
      setModel1(models[0] ?? '')
      setModel2(models[1] ?? '')
      setModel3(models[2] ?? '')

      // Prompt — suporta formato { prompt: string } e string legada
      if (typeof pRow?.data?.prompt === 'string') setPrompt(pRow.data.prompt)
      else if (typeof pRow?.data === 'string')    setPrompt(pRow.data)

      // Email Rewrite Prompt
      if (typeof eRow?.data?.prompt === 'string') setEmailPrompt(eRow.data.prompt)

      // Debug
      setDebugEnabled(dRow?.data?.debug_enabled === true)

      setLoading(false)
    }
    load()
  }, [])

  async function handleSaveModels() {
    const models = [model1, model2, model3].map(m => m.trim()).filter(Boolean)
    if (models.length === 0) { toast.error('Informe pelo menos um modelo'); return }
    setSavingModels(true)
    const { error } = await supabase
      .from('freshdesk_config')
      .upsert(
        { key: 'ai_models', data: { models }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) toast.error(error.message)
    else toast.success('Modelos salvos')
    setSavingModels(false)
  }

  async function handleSaveDebug(value) {
    setSavingDebug(true)
    const { error } = await supabase
      .from('freshdesk_config')
      .upsert(
        { key: 'debug_config', data: { debug_enabled: value }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) toast.error(error.message)
    else { setDebugEnabled(value); toast.success(value ? 'Debug ativado' : 'Debug desativado') }
    setSavingDebug(false)
  }

  async function handleSaveEmailPrompt() {
    setSavingEmailPrompt(true)
    const { error } = await supabase
      .from('freshdesk_config')
      .upsert(
        { key: 'email_rewrite_prompt', data: { prompt: emailPrompt.trim() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) toast.error(error.message)
    else toast.success('Prompt de e-mail salvo')
    setSavingEmailPrompt(false)
  }

  async function handleSavePrompt() {
    setSavingPrompt(true)
    const { error } = await supabase
      .from('freshdesk_config')
      .upsert(
        { key: 'ai_prompt', data: { prompt: prompt.trim() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) toast.error(error.message)
    else toast.success('Prompt salvo')
    setSavingPrompt(false)
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: '#888780', padding: 8 }}>Carregando...</div>
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <SettingsSectionHeader
        icon={AIIcon}
        title="Configurações de IA"
        subtitle="Controle os modelos OpenRouter e o prompt usado para análise automática de atendimentos WhatsApp."
      />

      {/* ── Seção de Modelos ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Modelos OpenRouter (Fallback)</p>
        <p style={S.sectionDesc}>
          Modelos tentados em ordem. O primeiro disponível será usado. Campos vazios são ignorados.
        </p>

        <div style={S.fieldBox}>
          <label style={S.label}>Modelo 1 (principal)</label>
          <input
            value={model1}
            onChange={e => setModel1(e.target.value)}
            placeholder="ex: openai/gpt-oss-20b:free"
            style={S.input}
          />
        </div>

        <div style={S.fieldBox}>
          <label style={S.label}>Modelo 2 (fallback)</label>
          <input
            value={model2}
            onChange={e => setModel2(e.target.value)}
            placeholder="ex: openrouter/free"
            style={S.input}
          />
        </div>

        <div style={S.fieldBox}>
          <label style={S.label}>Modelo 3 (último recurso)</label>
          <input
            value={model3}
            onChange={e => setModel3(e.target.value)}
            placeholder="ex: nvidia/nemotron-3-super-120b-a12b-20230311:free"
            style={S.input}
          />
        </div>

        <div style={{ marginTop: 4, padding: '10px 14px', backgroundColor: '#f7f7f5', borderRadius: 7, fontSize: 11, color: '#888780', marginBottom: 14 }}>
          💡 Modelos gratuitos disponíveis em{' '}
          <a href="https://openrouter.ai/models?order=pricing-asc" target="_blank" rel="noreferrer" style={{ color: '#59c2ed', textDecoration: 'none' }}>
            openrouter.ai/models
          </a>
        </div>

        <button onClick={handleSaveModels} disabled={savingModels} style={S.btn(savingModels)}>
          {savingModels ? 'Salvando...' : 'Salvar Modelos'}
        </button>
      </div>

      {/* ── Seção de Prompt ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Prompt do Assistente de IA</p>
        <p style={S.sectionDesc}>
          Este prompt define como a IA analisa as conversas WhatsApp. As instruções de formato JSON são adicionadas automaticamente quando o campo está vazio.
          Se preenchido, este prompt é usado como system prompt completo — inclua as instruções de formato JSON se necessário.
        </p>

        <div style={S.fieldBox}>
          <label style={S.label}>Prompt personalizado</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={
              'Deixe vazio para usar o prompt padrão da DONC.\n\n' +
              'Exemplo de personalização:\n' +
              'Você é um assistente de suporte da [EMPRESA]...\n' +
              'Contexto adicional sobre produtos e clientes...'
            }
            rows={14}
            style={{
              ...S.input,
              fontFamily: 'monospace',
              resize: 'vertical',
              lineHeight: 1.6,
              minHeight: 300,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#b0afab' }}>
              {prompt.trim().length} caracteres
            </span>
            {prompt.trim() && (
              <button
                onClick={() => setPrompt('')}
                style={{ fontSize: 11, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Limpar (usar prompt padrão)
              </button>
            )}
          </div>
        </div>

        <button onClick={handleSavePrompt} disabled={savingPrompt} style={S.btn(savingPrompt)}>
          {savingPrompt ? 'Salvando...' : 'Salvar Prompt'}
        </button>
      </div>

      {/* ── Seção Debug & Diagnóstico ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Debug & Diagnóstico</p>
        <p style={S.sectionDesc}>
          Quando ativado, exibe o payload enviado à IA e o resultado no console do navegador. Útil para diagnóstico.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: savingDebug ? 'not-allowed' : 'pointer' }}>
          <div
            onClick={() => !savingDebug && handleSaveDebug(!debugEnabled)}
            style={{
              width: 40, height: 22, borderRadius: 11, flexShrink: 0,
              backgroundColor: debugEnabled ? '#173557' : '#d4d3ce',
              position: 'relative', transition: 'background 0.2s',
              cursor: savingDebug ? 'not-allowed' : 'pointer',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: debugEnabled ? 21 : 3,
              width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          <span style={{ fontSize: 13, color: '#1a1a18', fontWeight: 500 }}>
            Exibir logs no console do navegador
          </span>
          {savingDebug && <span style={{ fontSize: 11, color: '#888780' }}>Salvando...</span>}
        </label>
      </div>

      {/* ── Seção de Prompt de Reescrita de E-mail ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Prompt do Assistente de E-mail</p>
        <p style={S.sectionDesc}>
          Define como a IA reescreve os e-mails. Se vazio, usa o prompt padrão da DONC.
        </p>

        <div style={S.fieldBox}>
          <label style={S.label}>Prompt personalizado</label>
          <textarea
            value={emailPrompt}
            onChange={e => setEmailPrompt(e.target.value)}
            placeholder={
              'Deixe vazio para usar o prompt padrão da DONC.\n\n' +
              'Você é um assistente de redação profissional da DONC...'
            }
            rows={10}
            style={{
              ...S.input,
              fontFamily: 'monospace',
              resize: 'vertical',
              lineHeight: 1.6,
              minHeight: 220,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#b0afab' }}>
              {emailPrompt.trim().length} caracteres
            </span>
            {emailPrompt.trim() && (
              <button
                onClick={() => setEmailPrompt('')}
                style={{ fontSize: 11, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Limpar (usar prompt padrão)
              </button>
            )}
          </div>
        </div>

        <button onClick={handleSaveEmailPrompt} disabled={savingEmailPrompt} style={S.btn(savingEmailPrompt)}>
          {savingEmailPrompt ? 'Salvando...' : 'Salvar Prompt'}
        </button>
      </div>
    </div>
  )
}
