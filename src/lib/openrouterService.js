/**
 * openrouterService.js
 *
 * Funções de alto nível para o módulo de atendimento WhatsApp:
 *   - getModel()           — lê modelo configurado em freshdesk_config
 *   - analyzeWhatsApp()    — envia texto + imagens ao OpenRouter e retorna JSON estruturado
 */

import { supabase } from './supabaseClient'
import { getFreshdeskConfig } from './freshdeskConfig'

const DEFAULT_MODEL     = 'meta-llama/llama-3.3-70b-instruct:free'
const LEGACY_MODEL      = 'openrouter/free'   // migração: substituir pelo novo padrão

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Retorna o modelo OpenRouter configurado pelo admin,
 * ou o modelo padrão como fallback.
 * Se o modelo salvo for o legado 'openrouter/free', migra automaticamente.
 */
export async function getModel() {
  try {
    const config = await getFreshdeskConfig('ai_config')
    const stored = config?.model

    // Migra modelo legado para o novo padrão sem sobrescrever configuração personalizada
    if (stored === LEGACY_MODEL) {
      await supabase
        .from('freshdesk_config')
        .upsert(
          { key: 'ai_config', data: { model: DEFAULT_MODEL }, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        )
      return DEFAULT_MODEL
    }

    return stored || DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

/**
 * Analisa uma conversa de WhatsApp (texto e/ou imagens) usando OpenRouter.
 *
 * @param {{ text?: string, images?: Array<{ base64: string, name: string }> }} param
 * @returns {Promise<{
 *   subject: string,
 *   description: string,
 *   first_reply: string,
 *   suggested_type: string,
 *   suggested_priority: 'low'|'medium'|'high'|'urgent',
 *   suggested_group_hint: string,
 *   suggested_group_id: number,
 *   suggested_status: 2|4,
 *   suggested_category: string,
 * }>}
 */
export async function analyzeWhatsApp({ text = '', images = [] }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const model = await getModel()

  // Carrega prompt personalizado (se configurado pelo admin)
  let customPrompt = ''
  try {
    const stored = await getFreshdeskConfig('ai_prompt')
    if (typeof stored === 'string') customPrompt = stored
  } catch { /* ignora */ }

  // ── Monta conteúdo multimodal ───────────────────────────────────────────
  const userContent = []

  if (text?.trim()) {
    userContent.push({ type: 'text', text: `Conversa do WhatsApp:\n\n${text.trim()}` })
  }

  for (const img of images) {
    // img.base64 é uma data URL completa: "data:image/jpeg;base64,..."
    userContent.push({
      type: 'image_url',
      image_url: { url: img.base64 },
    })
  }

  if (userContent.length === 0) {
    throw new Error('Forneça texto ou imagens para analisar.')
  }

  // ── System prompt ───────────────────────────────────────────────────────
  const jsonInstructions = `Você é um analista de suporte técnico especializado. Analise a conversa/imagens de atendimento WhatsApp fornecida e retorne APENAS um objeto JSON válido — sem markdown, sem blocos de código, sem texto extra antes ou depois.

Responda sempre em português do Brasil.

O JSON deve conter exatamente estes campos:
{
  "subject": "título curto e objetivo do ticket (máx 100 chars)",
  "description": "descrição clara e detalhada do problema na perspectiva do cliente",
  "first_reply": "texto da primeira resposta ou resolução que foi registrada no atendimento",
  "suggested_type": "tipo do ticket — escolha EXATAMENTE um dos valores: 'Tenho uma dúvida' | 'Preciso de um ajuste' | 'Encontrei um erro / Bug' | 'Tenho uma sugestão' | 'Questão financeira' | 'Preciso falar com o comercial' | 'Outro assunto'",
  "suggested_priority": "low | medium | high | urgent",
  "suggested_group_hint": "palavra-chave ou nome do setor responsável pelo atendimento",
  "suggested_group_id": número inteiro do grupo — escolha EXATAMENTE um: 70000477986 (N1 — suporte nível 1 geral), 70000477987 (N2 — suporte nível 2 técnico), 70000477988 (Dev N3 — desenvolvimento/bugs críticos), 70000477989 (Comercial), 70000477990 (Financeiro), 70000477991 (Onboarding),
  "suggested_status": 4 se o problema foi completamente resolvido durante o atendimento, 2 em todos os outros casos,
  "suggested_category": "categoria do produto envolvido — escolha EXATAMENTE um: 'Aplicativo Donc' | 'Web Admin' | 'Integração' | 'Outro'"
}

Regras:
- Responda SOMENTE o JSON, sem nenhum texto adicional
- Se a informação não estiver disponível, use string vazia "" ou os valores padrão (suggested_status=2, suggested_group_id=70000477986)
- suggested_priority: use 'high' ou 'urgent' para problemas críticos que afetam operação`

  const systemPrompt = customPrompt.trim()
    ? `${customPrompt.trim()}\n\n---\n\n${jsonInstructions}`
    : jsonInstructions

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userContent },
  ]

  // ── Chama openrouter-proxy com retry (até 2 tentativas extras em 404/5xx) ──
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-proxy`
  let lastError

  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(1000)

    let res
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages, model }),
      })
    } catch (networkErr) {
      lastError = new Error(`Erro de rede: ${networkErr.message}`)
      continue
    }

    if (res.ok) {
      const data = await res.json()
      const raw  = data?.choices?.[0]?.message?.content ?? ''

      // ── Parse JSON da resposta ────────────────────────────────────────────
      try {
        const cleaned = raw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/,      '')
          .replace(/\s*```$/,      '')
          .trim()
        return JSON.parse(cleaned)
      } catch {
        throw new Error(`Resposta da IA não é JSON válido. Trecho: ${raw.slice(0, 200)}`)
      }
    }

    // Retry em 404 ou 5xx
    if (res.status === 404 || res.status >= 500) {
      const err = await res.json().catch(() => ({}))
      lastError = new Error(err.error || `OpenRouter error ${res.status}`)
      console.warn(`[openrouterService] tentativa ${attempt + 1} falhou (${res.status}), ${attempt < 2 ? 'tentando novamente...' : 'desistindo.'}`)
      continue
    }

    // Outros erros: não retentar
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `OpenRouter error ${res.status}`)
  }

  throw lastError || new Error('Falha ao chamar OpenRouter após múltiplas tentativas.')
}
