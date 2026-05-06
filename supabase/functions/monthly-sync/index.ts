/**
 * monthly-sync — Supabase Edge Function
 *
 * Orquestra a sincronização mensal completa:
 *   1. donc-api-sync  — dados de uso (DONC API)
 *   2. freshdesk sync — tickets e contatos (Freshdesk API direto, sem CORS no Edge)
 *   3. health-recalc  — recalcula health score de todos os clientes ativos
 *
 * Acionado via pg_cron no primeiro dia de cada mês às 00:01 UTC.
 * Aceita service role key ou user com role admin/manager.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function prevMonth(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ─── FRESHDESK HELPERS ─────────────────────────────────────────────────────────
// Chamadas diretas à API Freshdesk — sem CORS no ambiente Edge Function.
// Replica a mesma lógica de syncAllCompanies / syncCompanySupport do frontend.

function fdAuthHeader(): string {
  return 'Basic ' + btoa(`${Deno.env.get('FRESHDESK_API_KEY')!}:X`)
}

function fdBaseUrl(): string {
  return `https://${Deno.env.get('FRESHDESK_DOMAIN')}/api/v2`
}

async function fdGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${fdBaseUrl()}${path}${qs}`, {
    headers: { Authorization: fdAuthHeader(), 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Freshdesk ${res.status}: ${path}`)
  return res.json()
}

async function getGroupsMap(): Promise<Record<string, number | null>> {
  try {
    const groups = await fdGet('/groups')
    return {
      n1: groups.find((g: any) => /suporte.*n1|n1.*suporte/i.test(g.name))?.id ?? null,
      n2: groups.find((g: any) => /suporte.*n2|n2.*suporte/i.test(g.name))?.id ?? null,
      n3: groups.find((g: any) => /dev.*n3|n3.*dev/i.test(g.name))?.id ?? null,
    }
  } catch {
    return { n1: null, n2: null, n3: null }
  }
}

async function fetchTicketsByCompany(freshdeskCompanyId: number, month: string): Promise<any[]> {
  const [year, mo] = month.split('-')
  const monthStart = new Date(`${year}-${mo}-01T00:00:00Z`)
  const monthEnd   = new Date(Number(year), Number(mo), 1)

  let all: any[] = []
  let page = 1
  while (page <= 20) {
    const data = await fdGet('/tickets', {
      company_id: String(freshdeskCompanyId),
      per_page:   '100',
      page:       String(page),
      include:    'stats',
      order_by:   'created_at',
      order_type: 'desc',
    })
    if (!Array.isArray(data) || !data.length) break

    const oldest  = new Date(data[data.length - 1].created_at)
    const inMonth = data.filter((t: any) => {
      const d = new Date(t.created_at)
      return d >= monthStart && d < monthEnd
    })
    all = all.concat(inMonth)
    if (oldest < monthStart) break
    if (data.length < 100) break
    page++
  }
  return all
}

async function fetchContactsByCompany(freshdeskCompanyId: number): Promise<any[]> {
  let all: any[] = []
  let page = 1
  while (page <= 10) {
    const data = await fdGet('/contacts', {
      company_id: String(freshdeskCompanyId),
      per_page:   '100',
      page:       String(page),
    })
    if (!Array.isArray(data) || !data.length) break
    all = all.concat(data)
    if (data.length < 100) break
    page++
  }
  return all
}

function processTicketsToSupport(
  tickets: any[],
  clientId: number,
  month: string,
  groupsMap: Record<string, number | null>,
) {
  const tickets_opened   = tickets.length
  const tickets_resolved = tickets.filter((t: any) => t.status === 4 || t.status === 5).length

  const responseTimes = tickets
    .map((t: any) => {
      if (typeof t.first_response_time === 'number' && t.first_response_time > 0) {
        return Math.round(t.first_response_time / 60)
      }
      if (t.stats?.first_responded_at) {
        const created   = new Date(t.created_at).getTime()
        const responded = new Date(t.stats.first_responded_at).getTime()
        return Math.round((responded - created) / 60000)
      }
      return null
    })
    .filter((ms: any) => ms !== null && ms >= 1 && ms <= 480) as number[]

  const sla_first_response = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0

  const n1_pct = groupsMap.n1 != null ? tickets.filter((t: any) => t.group_id === groupsMap.n1).length : 0
  const n2_pct = groupsMap.n2 != null ? tickets.filter((t: any) => t.group_id === groupsMap.n2).length : 0
  const n3_pct = groupsMap.n3 != null ? tickets.filter((t: any) => t.group_id === groupsMap.n3).length : 0

  return { client_id: clientId, ref_month: month, tickets_opened, tickets_resolved, sla_first_response, n1_pct, n2_pct, n3_pct }
}

async function syncFreshdesk(
  admin: SupabaseClient,
  month: string,
): Promise<{ synced: number; errors: any[] }> {
  const { data: clients, error } = await admin
    .from('clients')
    .select('id, name, freshdesk_company_id, freshdesk_company_ids')
    .eq('contract_active', true)

  if (error) throw error

  const eligible = (clients ?? []).filter((c: any) =>
    c.freshdesk_company_ids?.length || c.freshdesk_company_id
  )
  if (!eligible.length) return { synced: 0, errors: [] }

  const groupsMap = await getGroupsMap()
  let synced = 0
  const errors: any[] = []

  for (const client of eligible) {
    try {
      const companyIds: number[] = client.freshdesk_company_ids?.length
        ? client.freshdesk_company_ids
        : [client.freshdesk_company_id]

      const [ticketArrays, contactArrays] = await Promise.all([
        Promise.all(companyIds.map((id: number) => fetchTicketsByCompany(id, month))),
        Promise.all(companyIds.map((id: number) => fetchContactsByCompany(id))),
      ])

      const tickets = ticketArrays.flat()

      const contactMap = new Map<string, any>()
      for (const batch of contactArrays) {
        for (const c of batch) {
          const key = c.email?.toLowerCase()
          if (key && !contactMap.has(key)) contactMap.set(key, c)
        }
      }
      const fdContacts = [...contactMap.values()]

      const supportData = processTicketsToSupport(tickets, client.id, month, groupsMap)

      const { data: existingLinks } = await admin
        .from('contact_links')
        .select('contacts(email)')
        .eq('client_id', client.id)

      const existingEmails = new Set(
        (existingLinks ?? [])
          .map((l: any) => l.contacts?.email)
          .filter(Boolean)
          .map((e: string) => e.toLowerCase()),
      )

      const ticketsByRequester: Record<number, number> = {}
      tickets.forEach((t: any) => {
        if (t.requester_id) ticketsByRequester[t.requester_id] = (ticketsByRequester[t.requester_id] ?? 0) + 1
      })

      const newContacts = fdContacts
        .filter((c: any) => c.email && !existingEmails.has(c.email.toLowerCase()))
        .map((c: any) => {
          const ticketCount   = ticketsByRequester[c.id] ?? 0
          const isN3Requester = groupsMap.n3 != null &&
            tickets.some((t: any) => t.requester_id === c.id && t.group_id === groupsMap.n3)
          const suggested_papel = isN3Requester ? 'Técnico' : ticketCount >= 3 ? 'Influenciador' : 'Usuário'
          return {
            fd_id: c.id, name: c.name, email: c.email,
            phone: c.phone ?? null, ticket_count: ticketCount, suggested_papel,
          }
        })

      const snapshot = { ...supportData, new_contacts: newContacts }

      await admin.from('client_support').upsert(
        { client_id: client.id, ref_month: month, pending: true, freshdesk_snapshot: snapshot },
        { onConflict: 'client_id,ref_month' },
      )

      synced++
    } catch (err) {
      console.error(`monthly-sync: freshdesk error client_id=${client.id}`, err)
      errors.push({ name: client.name, error: String(err) })
    }
  }

  return { synced, errors }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (token !== serviceKey) {
      const { data: { user }, error: authErr } = await admin.auth.getUser(token)
      if (authErr || !user) return json({ error: 'Invalid token' }, 401)
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (!['admin', 'manager'].includes(profile?.role ?? '')) return json({ error: 'Forbidden' }, 403)
    }

    const month = prevMonth()
    const internalHeaders = {
      Authorization:    `Bearer ${serviceKey}`,
      'Content-Type':   'application/json',
    }

    // 1. donc-api-sync
    let doncResult: any = null
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/donc-api-sync`, {
        method:  'POST',
        headers: internalHeaders,
        body:    JSON.stringify({ trigger: 'cron', month: 'previous' }),
      })
      doncResult = await res.json()
      console.log('monthly-sync: donc-api-sync done', doncResult?.synced)
    } catch (err) {
      console.error('monthly-sync: donc-api-sync error', err)
      doncResult = { error: String(err) }
    }

    // 2. freshdesk sync (Freshdesk API direto — sem CORS no Edge)
    let freshdeskResult: any = null
    try {
      freshdeskResult = await syncFreshdesk(admin, month)
      console.log('monthly-sync: freshdesk done', freshdeskResult?.synced)
    } catch (err) {
      console.error('monthly-sync: freshdesk error', err)
      freshdeskResult = { error: String(err) }
    }

    // 3. health-recalc (todos os clientes)
    let healthResult: any = null
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/health-recalc`, {
        method:  'POST',
        headers: internalHeaders,
        body:    JSON.stringify({}),
      })
      healthResult = await res.json()
      console.log('monthly-sync: health-recalc done', healthResult?.recalculated)
    } catch (err) {
      console.error('monthly-sync: health-recalc error', err)
      healthResult = { error: String(err) }
    }

    return json({ donc: doncResult, freshdesk: freshdeskResult, health: healthResult })
  } catch (err) {
    console.error('monthly-sync:', err)
    return json({ error: String(err) }, 500)
  }
})
