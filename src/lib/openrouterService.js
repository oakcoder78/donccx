/**
 * openrouterService.js
 *
 * Funções de alto nível para o módulo de atendimento WhatsApp:
 *   - analyzeWhatsApp()    — envia texto ao OpenRouter e retorna JSON estruturado
 *
 * Nota: o modelo é gerenciado pelo openrouter-proxy via ai_models no Supabase.
 */

import { supabase } from './supabaseClient'
import { getFreshdeskConfig } from './freshdeskConfig'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Extrai um objeto JSON de uma resposta bruta de LLM.
 * Estratégias (em ordem):
 *   1. Bloco markdown ```json ou ``` — extrai o conteúdo do bloco
 *   2. Primeiro objeto {...} ou array [...] válido via regex não-gulosa
 *   3. Retorna null se nenhuma estratégia funcionar
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null

  // Estratégia 1: bloco markdown
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* continua para estratégia 2 */ }
  }

  // Estratégia 2: primeiro objeto ou array JSON válido
  const candidateRegex = /\{[\s\S]*?\}|\[\s\S]*?\]/g
  let match
  while ((match = candidateRegex.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(match[0])
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* continua buscando */ }
  }

  return null
}

const REQUIRED_TICKET_FIELDS = [
  'subject', 'description', 'first_reply', 'suggested_type',
  'suggested_priority', 'suggested_group_id', 'suggested_status',
  'suggested_category', 'confidence', 'is_recurring_issue',
]

function validateTicketSchema(obj) {
  if (!obj || typeof obj !== 'object') return false
  return REQUIRED_TICKET_FIELDS.every(key => key in obj)
}

async function isDebugEnabled() {
  try {
    const cfg = await getFreshdeskConfig('debug_config')
    return cfg?.debug_enabled === true
  } catch { return false }
}

/**
 * Analisa uma conversa de WhatsApp (texto e/ou imagens) usando OpenRouter.
 *
 * @param {{ text?: string }} param
 * @returns {Promise<{
 *   subject: string,
 *   description: string,
 *   first_reply: string,
 *   suggested_type: string,
 *   suggested_priority: 'low'|'medium'|'high'|'urgent',
 *   suggested_group_id: number,
 *   suggested_status: 2|4,
 *   suggested_category: string,
 *   confidence: number,
 *   is_recurring_issue: boolean,
 * }>}
 */
export async function analyzeWhatsApp({ text = '' }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  // Carrega prompt personalizado configurado pelo admin via SettingsAI
  // Formato armazenado: { prompt: string } — suporta também string legada
  let customPrompt = ''
  try {
    const stored = await getFreshdeskConfig('ai_prompt')
    if (typeof stored?.prompt === 'string')  customPrompt = stored.prompt
    else if (typeof stored === 'string')     customPrompt = stored  // legado
  } catch { /* ignora */ }

  // ── Monta conteúdo — apenas texto (imagens são processadas via OCR antes de chegar aqui) ──
  if (!text?.trim()) throw new Error('Forneça o texto da conversa para analisar.')

  const userContent = [
    { type: 'text', text: `Conversa do WhatsApp:\n\n${text.trim()}` },
  ]

  // ── System prompt ───────────────────────────────────────────────────────
  const jsonInstructions = `Você é um assistente de suporte da DONC, empresa de tecnologia que fornece plataforma de gestão de equipes de campo para o varejo brasileiro.

Seu papel é analisar conversas de atendimento realizadas via WhatsApp e estruturar as informações em um ticket padronizado para o Freshdesk.

Você NÃO deve explicar tecnicamente erros. Seu objetivo é gerar um resumo operacional claro e estruturado.

TOM DE VOZ: Acolhedor, simples, claro, sem jargão técnico, sempre em português do Brasil, direto ao ponto.

CONTEXTO: Tickets majoritariamente sobre erros no aplicativo mobile Donc (montadores, técnicos, profissionais de campo), plataforma web (Web Admin), falhas de integração, dúvidas operacionais.

Retorne APENAS um JSON válido no seguinte formato, sem texto adicional, sem markdown:

{
  "subject": "título curto e específico, máx 80 chars, formato: [Ação que falhou] + [contexto]",
  "description": "problema relatado pelo cliente, SEM solução, SEM desfecho, máx 300 chars",
  "first_reply": "orientação dada e resultado final, máx 250 chars",
  "suggested_type": "um dos valores exatos: Tenho uma dúvida | Preciso de um ajuste | Encontrei um erro / Bug | Tenho uma sugestão | Questão financeira | Preciso falar com o comercial | Outro assunto",
  "suggested_priority": "low | medium | high | urgent",
  "suggested_status": 4,
  "suggested_category": "Aplicativo Donc | Web Admin | Integração | Outro",
  "suggested_group_id": 70000477986,
  "confidence": 0.95,
  "is_recurring_issue": false
}

Regras críticas:
- subject: máx 80 chars, evitar termos vagos como Problema/Erro/Falha geral
- description: NUNCA inventar causas técnicas (proibido: "erro causado por banco de dados", "falha de sincronização")
- suggested_type: erro ou falha operacional = "Encontrei um erro / Bug", dúvida = "Tenho uma dúvida", ajuste = "Preciso de um ajuste"
- suggested_status: 4 (Resolvido) se cliente confirmou com frases como "deu certo", "voltou ao normal", "funcionou", "resolveu"; caso contrário 2
- suggested_priority: low=dúvida simples, medium=dificulta operação, high=impede execução, urgent=paralisa operação; se usuário não conseguiu executar ação principal usar high
- suggested_group_id: 70000477986=Suporte N1 (orientações simples, limpeza cache), 70000477987=Suporte N2 (problemas complexos), 70000477988=Dev N3 (bug confirmado), 70000477989=Comercial, 70000477990=Financeiro, 70000477991=Onboarding
- suggested_category: Aplicativo Donc=app mobile, Web Admin=plataforma web, Integração=falhas entre sistemas
- confidence: 0.90+ conversa clara, 0.70-0.89 leve ambiguidade, 0.50-0.69 informações incompletas, <0.50 baixa confiança
- is_recurring_issue: true se houver frases como "aconteceu de novo", "já aconteceu antes", "continua dando erro"`

  // Se o admin configurou um prompt personalizado, usa-o integralmente como system prompt.
  // Caso contrário, usa o prompt hardcoded (jsonInstructions) como fallback.
  const systemPrompt = customPrompt.trim() || jsonInstructions

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userContent },
  ]

  if (await isDebugEnabled()) {
    console.log('[openrouterService] payload enviado:', JSON.stringify({ messages }, null, 2))
  }

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
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      })
    } catch (networkErr) {
      lastError = new Error(`Erro de rede: ${networkErr.message}`)
      continue
    }

    if (res.ok) {
      const data = await res.json()

      // Proxy retornou null (modelo respondeu com body não-JSON)
      if (data === null) {
        lastError = new Error('Modelo de IA retornou uma resposta inválida. Tentando outro modelo...')
        if (await isDebugEnabled()) {
          console.warn('[openrouterService] resposta null do proxy, tentando próximo modelo')
        }
        continue
      }

      // Proxy retornou um erro estruturado
      if (data?.error) {
        throw new Error(data.error)
      }

      const msg = data?.choices?.[0]?.message ?? {}
      const raw = (typeof msg.content === 'string' && msg.content.trim())
        ? msg.content
        : (typeof msg.reasoning === 'string' && msg.reasoning.trim() ? msg.reasoning
          : (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim() ? msg.reasoning_content : ''))

      // Conteúdo vazio do modelo
      if (!raw.trim()) {
        lastError = new Error('Modelo de IA retornou uma resposta vazia. Tentando outro modelo...')
        if (await isDebugEnabled()) {
          console.warn('[openrouterService] resposta vazia do modelo, tentando próximo modelo')
        }
        continue
      }

      // ── Extrair e validar JSON da resposta ──────────────────────────────────
      const extracted = extractJSON(raw)
      if (extracted === null) {
        lastError = new Error(`Resposta da IA não contém JSON válido. Trecho: ${raw.slice(0, 200)}`)
        if (await isDebugEnabled()) {
          console.warn('[openrouterService] nenhum JSON encontrado na resposta, tentando próximo modelo')
        }
        continue
      }
      if (!validateTicketSchema(extracted)) {
        lastError = new Error(`Resposta da IA tem campos faltando. Trecho: ${raw.slice(0, 200)}`)
        if (await isDebugEnabled()) {
          console.warn('[openrouterService] schema inválido, tentando próximo modelo')
        }
        continue
      }
      if (await isDebugEnabled()) {
        console.log('[openrouterService] modelo utilizado:', data?.model || 'desconhecido')
        console.log('[openrouterService] resultado IA:', JSON.stringify(extracted, null, 2))
      }
      return extracted
    }

    // Retry em 404 ou 5xx
    if (res.status === 404 || res.status >= 500) {
      const err = await res.json().catch(() => ({}))
      lastError = new Error(err.error || `OpenRouter error ${res.status}`)
      if (await isDebugEnabled()) {
        console.warn(`[openrouterService] tentativa ${attempt + 1} falhou (${res.status}), ${attempt < 2 ? 'tentando novamente...' : 'desistindo.'}`)
      }
      continue
    }

    // Outros erros: não retentar
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `OpenRouter error ${res.status}`)
  }

  throw lastError || new Error('Falha ao chamar OpenRouter após múltiplas tentativas.')
}
