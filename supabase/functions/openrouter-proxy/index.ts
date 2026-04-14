/**
 * openrouter-proxy — Supabase Edge Function
 *
 * Proxia chamadas para OpenRouter sem expor a chave de API ao browser.
 * Autenticação delegada inteiramente ao gateway do Supabase.
 *
 * Secret necessário: OPENROUTER_API_KEY
 * Body: { messages: ChatMessage[], model?: string }
 */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    // Loga se o header existe — sem nenhuma validação ou rejeição por auth
    const authHeader = req.headers.get('Authorization')
    console.log('openrouter-proxy: Authorization header present:', !!authHeader)

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json()
    const { messages, model = DEFAULT_MODEL } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: '"messages" é obrigatório e deve ser um array não-vazio' }, 400)
    }

    // ── OpenRouter key ──────────────────────────────────────────────────────
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.error('openrouter-proxy: OPENROUTER_API_KEY não configurado')
      return json({ error: 'OpenRouter não configurado no servidor (OPENROUTER_API_KEY ausente)' }, 500)
    }

    // ── Forward para OpenRouter ─────────────────────────────────────────────
    console.log('openrouter-proxy: POST', model, '| messages:', messages.length)

    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://donccx.donc.com.br',
        'X-Title': 'doncCX',
      },
      body: JSON.stringify({ model, messages }),
    })

    console.log('openrouter-proxy: response', orRes.status)
    const data = await orRes.json().catch(() => null)
    return json(data, orRes.status)

  } catch (err) {
    console.error('openrouter-proxy:', err)
    return json({ error: String(err) }, 500)
  }
})
