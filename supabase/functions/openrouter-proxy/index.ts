/**
 * openrouter-proxy — Supabase Edge Function
 *
 * Proxia chamadas para OpenRouter com fallback automático entre modelos.
 * Os modelos são carregados do Supabase (freshdesk_config key='ai_models').
 * O campo `model` do body recebido é ignorado — usa sempre a lista configurada.
 *
 * Secrets necessários: OPENROUTER_API_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Body: { messages: ChatMessage[] }
 */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Fallback hardcoded — usado quando Supabase não retornar modelos configurados. */
const FALLBACK_MODELS = [
  'openai/gpt-oss-20b:free',
  'openrouter/free',
  'nvidia/nemotron-3-super-120b-a12b-20230311:free',
]

const TIMEOUT_MS = 15_000

/**
 * Busca a lista de modelos configurada no Supabase.
 * Retorna FALLBACK_MODELS se falhar ou estiver vazio.
 */
async function loadModels(): Promise<string[]> {
  try {
    const sbUrl = Deno.env.get('SUPABASE_URL') ?? 'https://etfeqblaeuhaobefxilp.supabase.co'
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!sbKey) {
      console.warn('openrouter-proxy: SUPABASE_SERVICE_ROLE_KEY ausente, usando fallback')
      return FALLBACK_MODELS
    }

    const res = await fetch(
      `${sbUrl}/rest/v1/freshdesk_config?key=eq.ai_models&select=data`,
      {
        headers: {
          apikey:        sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
      },
    )

    if (!res.ok) {
      console.warn('openrouter-proxy: falha ao buscar ai_models do Supabase:', res.status)
      return FALLBACK_MODELS
    }

    const rows = await res.json()
    const models: unknown = rows?.[0]?.data?.models

    if (Array.isArray(models) && models.length > 0) {
      const valid = (models as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim() !== '')
      if (valid.length > 0) {
        console.log('openrouter-proxy: modelos carregados do Supabase:', valid)
        return valid
      }
    }

    console.log('openrouter-proxy: ai_models vazio ou inválido, usando fallback')
    return FALLBACK_MODELS

  } catch (err) {
    console.warn('openrouter-proxy: erro ao carregar ai_models:', String(err))
    return FALLBACK_MODELS
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    // Loga se o header existe — sem validação ou rejeição por auth (gateway trata)
    const authHeader = req.headers.get('Authorization')
    console.log('openrouter-proxy: Authorization header present:', !!authHeader)

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json()
    const { messages } = body
    // Nota: campo `model` do body é intencionalmente ignorado — usa MODELS[]

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: '"messages" é obrigatório e deve ser um array não-vazio' }, 400)
    }

    // ── OpenRouter key ──────────────────────────────────────────────────────
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.error('openrouter-proxy: OPENROUTER_API_KEY não configurado')
      return json({ error: 'OpenRouter não configurado no servidor (OPENROUTER_API_KEY ausente)' }, 500)
    }

    // ── Carrega modelos do Supabase (com fallback) ──────────────────────────
    const MODELS = await loadModels()

    // ── Loop de fallback entre modelos ──────────────────────────────────────
    for (const model of MODELS) {
      console.log('Tentando modelo:', model)
      console.log('openrouter-proxy: body enviado ao OpenRouter:', JSON.stringify({ model, messages: messages.length + ' mensagens' }))

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      let orRes: Response
      try {
        orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://donccx.donc.com.br',
            'X-Title': 'doncCX',
          },
          body: JSON.stringify({ model, messages }),
          signal: controller.signal,
        })
      } catch (err) {
        clearTimeout(timer)
        const isTimeout = err instanceof Error && err.name === 'AbortError'
        console.warn('Falha no modelo:', model, isTimeout ? 'timeout' : String(err))
        continue  // próximo modelo
      }

      clearTimeout(timer)

      // Ativa fallback em erros transientes
      if (!orRes.ok || [429, 500, 502, 503].includes(orRes.status)) {
        const errBody = await orRes.text()
        console.warn('Falha no modelo:', model, orRes.status, errBody)
        continue  // próximo modelo
      }

      // ── Sucesso ─────────────────────────────────────────────────────────
      console.log('Modelo utilizado:', model)
      const data = await orRes.json().catch(() => null)
      return json(data, orRes.status)
    }

    // ── Todos os modelos falharam ────────────────────────────────────────
    console.error('Todos os modelos falharam')
    return json({ error: 'Todos os modelos falharam' }, 500)

  } catch (err) {
    console.error('openrouter-proxy:', err)
    return json({ error: String(err) }, 500)
  }
})
