/**
 * openrouter-proxy — Supabase Edge Function
 *
 * Proxia chamadas para OpenRouter com fallback automático entre modelos.
 * Os modelos são carregados do Supabase (freshdesk_config key='ai_models').
 * O campo `model` do body recebido é ignorado — usa sempre a lista configurada.
 *
 * Secrets necessários: OPENROUTER_API_KEY (+ secret key auto-injetada: SUPABASE_SECRET_KEYS ou SUPABASE_SERVICE_ROLE_KEY legada)
 * Auto-injetados: SUPABASE_URL, SUPABASE_ANON_KEY
 * Body: { messages: ChatMessage[] }
 */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getServiceKey } from "../_shared/auth.ts"

const allowedOrigins = [
  "https://donccx.vercel.app",
  "http://localhost:5173",
]

function getCorsHeaders(origin: string | null) {
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "https://donccx.vercel.app",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    }
  }

  const isVercelPreview =
    origin.includes("vercel.app") &&
    origin.includes("donccx")

  if (allowedOrigins.includes(origin) || isVercelPreview) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    }
  }

  return {
    "Access-Control-Allow-Origin": "https://donccx.vercel.app",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  }
}

/** Fallback hardcoded — usado quando Supabase não retornar modelos configurados. */
const FALLBACK_MODELS = [
  'openai/gpt-oss-120b:free',
  'google/gemini-2.5-flash-lite',
  'openrouter/free',
]

const TIMEOUT_MS = 30_000

function getSbKey(): string | null {
  return getServiceKey() ?? Deno.env.get('SUPABASE_ANON_KEY') ?? null
}

/**
 * Busca a lista de modelos configurada no Supabase.
 * Requer secret key (precisa bypassar RLS em freshdesk_config).
 * Retorna FALLBACK_MODELS se falhar ou estiver vazio.
 */
async function loadModels(): Promise<string[]> {
  try {
    const sbUrl = Deno.env.get('SUPABASE_URL') ?? 'https://etfeqblaeuhaobefxilp.supabase.co'
    const sbKey = getServiceKey()
    if (!sbKey) {
      console.warn('openrouter-proxy: secret key ausente, usando fallback')
      return FALLBACK_MODELS
    }

    const res = await fetch(
      `${sbUrl}/rest/v1/freshdesk_config?key=eq.ai_models&select=data`,
      { headers: { apikey: sbKey } },
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
  const origin = req.headers.get("origin")

if (req.method === "OPTIONS") {
  return new Response("ok", {
    headers: getCorsHeaders(origin),
  })
}

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
  ...getCorsHeaders(origin),
  "Content-Type": "application/json",
},
    })

try {
  // ── VALIDAR TOKEN JWT ──────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization') ?? ''

  if (!authHeader) {
    return json({ error: 'Missing authorization token' }, 401)
  }

  const token = authHeader
    .replace(/^Bearer\s+/i, '')
    .trim()

  if (!token) {
    return json({ error: 'Invalid authorization token' }, 401)
  }

  const sbUrl = Deno.env.get('SUPABASE_URL')
  const anyKey = getSbKey()

  const authRes = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anyKey ?? '',
    },
  })

  if (!authRes.ok) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── Collect errors per model for meaningful error reporting ─────────────
  const modelErrors: string[] = []

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json()
    const { messages, max_tokens } = body

    const outputMaxTokens = typeof max_tokens === 'number' && max_tokens > 0 ? max_tokens : 1000

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

    // ── Helpers para log e notificação ───────────────────────────────────────
    async function logModel(model: string, status: string, latencyMs: number, error?: string) {
      try {
        const key = getSbKey()
        if (!key) {
          console.error('logModel: nenhuma chave Supabase disponível')
          return
        }
        await fetch(`${sbUrl}/rest/v1/ai_model_logs`, {
          method: 'POST',
          headers: {
            apikey: key,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ model, status, latency_ms: latencyMs, error: error ?? null }),
        })
      } catch (err) {
        console.error('logModel: falha ao logar:', String(err))
      }
    }

    async function notifyAllFailed(models: string[]) {
      try {
        const key = getServiceKey()
        if (!key) {
          console.error('notifyAllFailed: secret key ausente, notificação não enviada')
          return
        }
        await fetch(`${sbUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: {
            apikey: key,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            type: 'model_failure',
            title: 'Nenhum modelo OpenRouter respondeu',
            message: `Modelos tentados: ${models.join(', ')}`,
          }),
        })
      } catch (err) {
        console.error('notifyAllFailed:', String(err))
      }
    }

    async function sendAlertEmail(models: string[]) {
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY')
        if (!resendKey) { console.warn('RESEND_API_KEY ausente, e-mail não enviado'); return }

        const adminRes = await fetch(
          `${sbUrl}/rest/v1/profiles?role=eq.admin&select=email`,
          { headers: { apikey: anyKey ?? '' } },
        )
        const admins = await adminRes.json()
        const adminEmails: string[] = (Array.isArray(admins) ? admins : [])
          .map((a: any) => a.email).filter(Boolean)

        if (adminEmails.length === 0) { console.warn('Nenhum admin encontrado'); return }

        const modelList = models.join('\n- ')

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'doncCX <noreply@donc.com.br>',
            to: adminEmails,
            subject: '[doncCX] Alerta — Nenhum modelo OpenRouter respondeu',
            text: `Todos os modelos OpenRouter configurados falharam.\n\nModelos tentados:\n- ${modelList}\n\nErros:\n${modelErrors.join('\n')}\n\nVerifique a página de configuração em IA & Automação > Donkie IA para mais detalhes.\n\n---\ndonCCX Hub - Monitoramento de IA`,
          }),
        })
      } catch (err) {
        console.error('sendAlertEmail:', String(err))
      }
    }

    // ── Loop de fallback entre modelos ──────────────────────────────────────
    let allFailed = true
    for (const model of MODELS) {
      console.log('Tentando modelo:', model)

      const t0 = performance.now()
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
          body: JSON.stringify({ model, messages, max_tokens: outputMaxTokens }),
          signal: controller.signal,
        })
      } catch (err) {
        clearTimeout(timer)
        const isTimeout = err instanceof Error && err.name === 'AbortError'
        const elapsed = Math.round(performance.now() - t0)
        const errMsg = isTimeout ? 'timeout' : String(err)
        console.warn('Falha no modelo:', model, errMsg)
        modelErrors.push(`${model}: ${errMsg}`)
        await logModel(model, 'fail', elapsed, errMsg)
        continue  // próximo modelo
      }

      clearTimeout(timer)
      const elapsed = Math.round(performance.now() - t0)

      // Ativa fallback em erros transientes
      if (!orRes.ok || [429, 500, 502, 503].includes(orRes.status)) {
        const errBody = await orRes.text()
        const errMsg = `${orRes.status}: ${errBody.slice(0, 200)}`
        console.warn('Falha no modelo:', model, errMsg)
        modelErrors.push(`${model}: ${errMsg}`)
        await logModel(model, 'fail', elapsed, errMsg)
        continue  // próximo modelo
      }

      // ── Sucesso ─────────────────────────────────────────────────────────
      const parsed = await orRes.json().catch(() => null)
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed?.choices) || parsed.choices.length === 0 || typeof parsed.choices[0]?.message?.content !== 'string') {
        const errMsg = `invalid response structure from ${model}`
        console.warn('Falha no modelo:', model, errMsg)
        modelErrors.push(`${model}: ${errMsg}`)
        await logModel(model, 'fail', elapsed, errMsg)
        continue
      }
      allFailed = false
      console.log('Modelo utilizado:', model)
      await logModel(model, 'success', elapsed)
      return json(parsed, orRes.status)
    }

    // ── Todos os modelos falharam ────────────────────────────────────────
    if (allFailed) {
      console.error('Todos os modelos falharam')
      const attemptedModels = MODELS
      await Promise.all([
        notifyAllFailed(attemptedModels),
        sendAlertEmail(attemptedModels),
      ])
    }
    return json({ error: `Todos os modelos falharam. ${modelErrors.join('; ')}` }, 500)

  } catch (err) {
    console.error('openrouter-proxy:', err)
    return json({ error: String(err) }, 500)
  }
})
