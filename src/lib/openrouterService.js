/**
 * openrouterService.js
 *
 * Funções de alto nível para o módulo de atendimento WhatsApp:
 *   - getModel()           — lê modelo configurado em freshdesk_config
 *   - analyzeWhatsApp()    — envia texto + imagens ao OpenRouter e retorna JSON estruturado
 */

import { supabase } from './supabaseClient'
import { getFreshdeskConfig } from './freshdeskConfig'

const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp'

/**
 * Retorna o modelo OpenRouter configurado pelo admin,
 * ou o modelo padrão como fallback.
 */
export async function getModel() {
  try {
    const config = await getFreshdeskConfig('ai_config')
    return config?.model || DEFAULT_MODEL
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
 * }>}
 */
export async function analyzeWhatsApp({ text = '', images = [] }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const model = await getModel()

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

  const systemPrompt = `Você é um analista de suporte técnico especializado. Analise a conversa/imagens de atendimento WhatsApp fornecida e retorne APENAS um objeto JSON válido — sem markdown, sem blocos de código, sem texto extra antes ou depois.

O JSON deve conter exatamente estes campos:
{
  "subject": "título curto e objetivo do ticket (máx 100 chars)",
  "description": "descrição clara e detalhada do problema na perspectiva do cliente",
  "first_reply": "texto da primeira resposta ou resolução que foi registrada no atendimento",
  "suggested_type": "tipo do ticket — escolha EXATAMENTE um dos valores: 'Tenho uma dúvida' | 'Preciso de um ajuste' | 'Encontrei um erro / Bug' | 'Tenho uma sugestão' | 'Questão financeira' | 'Preciso falar com o comercial' | 'Outro assunto'",
  "suggested_priority": "low | medium | high | urgent",
  "suggested_group_hint": "palavra-chave ou nome do setor responsável pelo atendimento"
}

Regras:
- Responda SOMENTE o JSON, sem nenhum texto adicional
- Se a informação não estiver disponível, use string vazia ""
- suggested_priority: use 'high' ou 'urgent' para problemas críticos que afetam operação`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userContent },
  ]

  // ── Chama openrouter-proxy ──────────────────────────────────────────────
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-proxy`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, model }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `OpenRouter error ${res.status}`)
  }

  const data = await res.json()
  const raw  = data?.choices?.[0]?.message?.content ?? ''

  // ── Parse JSON da resposta ──────────────────────────────────────────────
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
