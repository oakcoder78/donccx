import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import toast from 'react-hot-toast'

const FALLBACK_MODELS = [
  'openai/gpt-oss-20b:free',
  'openrouter/free',
  'nvidia/nemotron-3-super-120b-a12b-20230311:free',
]

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

function useDonkieConfig() {
  return useQuery({
    queryKey: ['donkie_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donkie_config')
        .select('*')
        .eq('id', 1)
        .single()
      if (error) { console.error('[SettingsAI] donkie_config', error); return null }
      return data
    },
    retry: 0,
  })
}

export function SettingsAI() {
  const qc = useQueryClient()
  const AIIcon = Icons.Bot
  const [loading, setLoading] = useState(true)

  // ── Modelos ─────────────────────────────────────────────────────────────────
  const [model1, setModel1] = useState('')
  const [model2, setModel2] = useState('')
  const [model3, setModel3] = useState('')
  const [savingModels, setSavingModels] = useState(false)

  // ── Prompt Atendimento ──────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)

  // ── Donkie ──────────────────────────────────────────────────────────────────
  const { data: donkieConfig, isLoading: donkieLoading } = useDonkieConfig()
  const [donkieForm, setDonkieForm] = useState({
    system_prompt:      '',
    personality:        '',
    domain_context:     '',
    default_mode:       'discussao',
    allow_cross_client: true,
  })
  const [savingDonkie, setSavingDonkie] = useState(false)

  useEffect(() => {
    if (donkieConfig) setDonkieForm({
      system_prompt:      donkieConfig.system_prompt      ?? '',
      personality:        donkieConfig.personality        ?? '',
      domain_context:     donkieConfig.domain_context     ?? '',
      default_mode:       donkieConfig.default_mode       ?? 'discussao',
      allow_cross_client: donkieConfig.allow_cross_client ?? true,
    })
  }, [donkieConfig?.id])

  // ── Email Prompt ────────────────────────────────────────────────────────────
  const [emailPrompt, setEmailPrompt] = useState('')
  const [savingEmailPrompt, setSavingEmailPrompt] = useState(false)

  // ── Debug ───────────────────────────────────────────────────────────────────
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

      const models = Array.isArray(mRow?.data?.models) ? mRow.data.models : FALLBACK_MODELS
      setModel1(models[0] ?? '')
      setModel2(models[1] ?? '')
      setModel3(models[2] ?? '')

      if (typeof pRow?.data?.prompt === 'string') setPrompt(pRow.data.prompt)
      else if (typeof pRow?.data === 'string')    setPrompt(pRow.data)

      if (typeof eRow?.data?.prompt === 'string') setEmailPrompt(eRow.data.prompt)

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

  async function handleSaveDonkie() {
    setSavingDonkie(true)
    try {
      const { error } = await supabase
        .from('donkie_config')
        .update({ ...donkieForm, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['donkie_config'] })
      toast.success('Configurações do Donkie salvas')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingDonkie(false)
    }
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

  if (loading) {
    return <div style={{ fontSize: 13, color: '#888780', padding: 8 }}>Carregando...</div>
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <SettingsSectionHeader
        icon={AIIcon}
        title="Donkie IA"
        subtitle="Gerencie modelos, prompts e configurações do assistente de IA da DONC."
      />

      {/* ── Sessão 1: Modelos + Debug ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Modelos OpenRouter (Fallback)</p>
        <p style={S.sectionDesc}>
          Modelos tentados em ordem. O primeiro disponível será usado. Campos vazios são ignorados.
        </p>

        <div style={S.fieldBox}>
          <label style={S.label}>Modelo 1 (principal)</label>
          <input value={model1} onChange={e => setModel1(e.target.value)}
            placeholder="ex: openai/gpt-oss-20b:free" style={S.input} />
        </div>
        <div style={S.fieldBox}>
          <label style={S.label}>Modelo 2 (fallback)</label>
          <input value={model2} onChange={e => setModel2(e.target.value)}
            placeholder="ex: openrouter/free" style={S.input} />
        </div>
        <div style={S.fieldBox}>
          <label style={S.label}>Modelo 3 (último recurso)</label>
          <input value={model3} onChange={e => setModel3(e.target.value)}
            placeholder="ex: nvidia/nemotron-3-super-120b-a12b-20230311:free" style={S.input} />
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

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e8e7e3' }}>
          <p style={{ ...S.sectionTitle, marginBottom: 4 }}>Debug & Diagnóstico</p>
          <p style={{ ...S.sectionDesc, marginBottom: 14 }}>
            Quando ativado, exibe o payload enviado à IA e o resultado no console do navegador.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: savingDebug ? 'not-allowed' : 'pointer' }}>
            <div onClick={() => !savingDebug && handleSaveDebug(!debugEnabled)} style={{
              width: 40, height: 22, borderRadius: 11, flexShrink: 0,
              backgroundColor: debugEnabled ? '#173557' : '#d4d3ce',
              position: 'relative', transition: 'background 0.2s',
              cursor: savingDebug ? 'not-allowed' : 'pointer',
            }}>
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
      </div>

      {/* ── Sessão 2: Prompt do Assistente de Atendimento ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Prompt do Assistente de Atendimento</p>
        <p style={S.sectionDesc}>
          Define como a IA analisa as conversas WhatsApp. As instruções de formato JSON são adicionadas automaticamente quando o campo está vazio.
          Se preenchido, este prompt é usado como system prompt completo — inclua as instruções de formato JSON se necessário.
        </p>

        <div style={S.fieldBox}>
          <label style={S.label}>Prompt personalizado</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={'Deixe vazio para usar o prompt padrão da DONC.\n\nExemplo de personalização:\nVocê é um assistente de suporte da [EMPRESA]...\nContexto adicional sobre produtos e clientes...'}
            rows={14} style={{ ...S.input, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6, minHeight: 300 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#b0afab' }}>{prompt.trim().length} caracteres</span>
            {prompt.trim() && (
              <button onClick={() => setPrompt('')}
                style={{ fontSize: 11, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Limpar (usar prompt padrão)
              </button>
            )}
          </div>
        </div>

        <button onClick={handleSavePrompt} disabled={savingPrompt} style={S.btn(savingPrompt)}>
          {savingPrompt ? 'Salvando...' : 'Salvar Prompt'}
        </button>
      </div>

      {/* ── Sessão 3: Donkie — Assistente IA ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Donkie — Assistente IA</p>
        <p style={S.sectionDesc}>
          Configure o comportamento e a personalidade do Donkie. As alterações entram em vigor imediatamente para todos os usuários.
        </p>

        {donkieLoading ? (
          <div style={{ fontSize: 13, color: '#888780', padding: '8px 0' }}>Carregando configurações do Donkie...</div>
        ) : (
          <>
            <div style={S.fieldBox}>
              <label style={S.label}>System Prompt</label>
              <p style={{ fontSize: 11, color: '#888780', marginBottom: 6, lineHeight: 1.4 }}>
                Instruções base que definem identidade, conhecimento e regras do Donkie.
              </p>
              <textarea value={donkieForm.system_prompt}
                onChange={e => setDonkieForm(p => ({ ...p, system_prompt: e.target.value }))}
                rows={10} style={{ ...S.input, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={S.fieldBox}>
              <label style={S.label}>Personalidade</label>
              <p style={{ fontSize: 11, color: '#888780', marginBottom: 6, lineHeight: 1.4 }}>
                Descrição curta do estilo de comunicação (usada internamente como referência).
              </p>
              <textarea value={donkieForm.personality}
                onChange={e => setDonkieForm(p => ({ ...p, personality: e.target.value }))}
                rows={3} style={{ ...S.input, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={S.fieldBox}>
              <label style={S.label}>Contexto de Domínio</label>
              <p style={{ fontSize: 11, color: '#888780', marginBottom: 6, lineHeight: 1.4 }}>
                Segmentos, operações e contexto de negócio da Donc.
              </p>
              <textarea value={donkieForm.domain_context}
                onChange={e => setDonkieForm(p => ({ ...p, domain_context: e.target.value }))}
                rows={3} style={{ ...S.input, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={S.fieldBox}>
              <label style={S.label}>Modo Padrão</label>
              <select value={donkieForm.default_mode}
                onChange={e => setDonkieForm(p => ({ ...p, default_mode: e.target.value }))}
                style={{ ...S.input, fontFamily: 'inherit', width: 180 }}>
                <option value="discussao">Discussão</option>
                <option value="implementacao">Implementação</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" className="sr-only peer" style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  checked={donkieForm.allow_cross_client}
                  onChange={e => setDonkieForm(p => ({ ...p, allow_cross_client: e.target.checked }))} />
                <div style={{
                  width: 40, height: 22, borderRadius: 11,
                  backgroundColor: donkieForm.allow_cross_client ? '#173557' : '#d4d3ce',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: donkieForm.allow_cross_client ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
              </label>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18', margin: 0 }}>
                  Permitir comparação entre clientes
                </p>
                <p style={{ fontSize: 11, color: '#888780', margin: '2px 0 0' }}>
                  Quando ativo, o Donkie pode mencionar padrões de outros clientes da carteira.
                </p>
              </div>
            </div>

            <button onClick={handleSaveDonkie} disabled={savingDonkie} style={S.btn(savingDonkie)}>
              {savingDonkie ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </>
        )}
      </div>

      {/* ── Sessão 4: Prompt do Assistente de E-mail ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Prompt do Assistente de E-mail</p>
        <p style={S.sectionDesc}>
          Define como a IA reescreve os e-mails. Se vazio, usa o prompt padrão da DONC.
        </p>

        <div style={S.fieldBox}>
          <label style={S.label}>Prompt personalizado</label>
          <textarea value={emailPrompt} onChange={e => setEmailPrompt(e.target.value)}
            placeholder={'Deixe vazio para usar o prompt padrão da DONC.\n\nVocê é um assistente de redação profissional da DONC...'}
            rows={10} style={{ ...S.input, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6, minHeight: 220 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#b0afab' }}>{emailPrompt.trim().length} caracteres</span>
            {emailPrompt.trim() && (
              <button onClick={() => setEmailPrompt('')}
                style={{ fontSize: 11, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
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
