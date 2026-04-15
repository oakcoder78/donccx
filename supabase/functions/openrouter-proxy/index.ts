/**
 * openrouter-proxy — Supabase Edge Function
 *
 * Proxia chamadas para OpenRouter com fallback automático entre modelos.
 * O campo `model` do body recebido é ignorado — usa sempre a ordem de MODELS.
 *
 * Secret necessário: OPENROUTER_API_KEY
 * Body: { messages: ChatMessage[] }
 */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Ordem de fallback: tenta cada modelo em sequência até um responder com sucesso. */
const MODELS = [
  'openai/gpt-oss-20b:free',
  'openrouter/free',
  'nvidia/nemotron-3-super-120b-a12b-20230311:free',
]

const TIMEOUT_MS = 15_000

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

    // ── Loop de fallback entre modelos ──────────────────────────────────────
    for (const model of MODELS) {
      console.log('Tentando modelo:', model)

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
        console.warn('Falha no modelo:', model, orRes.status)
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
