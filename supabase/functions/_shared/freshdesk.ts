/**
 * _shared/freshdesk.ts — Canonical Freshdesk executor
 * Centralizes ticket/SLA/group/contact rules for both frontend (via freshdeskSync.js)
 * and Edge Functions (monthly-sync, future freshdesk-sync).
 * Phase 4: retry, per-client status, observability, kill switch.
 */

function fdAuthHeader(): string {
  return 'Basic ' + btoa(`${Deno.env.get('FRESHDESK_API_KEY')!}:X`)
}
function fdBaseUrl(): string {
  return `https://${Deno.env.get('FRESHDESK_DOMAIN')}/api/v2`
}

export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; delayMs?: number; retryable?: (e: Error) => boolean } = {}): Promise<T> {
  const retries = opts.retries ?? 2
  const delayMs = opts.delayMs ?? 800
  const isRetryable = opts.retryable ?? ((e: Error) => /429|500|502|503|504|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(e.message))
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e as Error
      if (attempt === retries || !isRetryable(lastErr)) throw lastErr
      const backoff = delayMs * Math.pow(2, attempt) + Math.random() * 200
      console.warn(`[freshdesk] retry ${attempt + 1}/${retries} after ${Math.round(backoff)}ms: ${lastErr.message}`)
      await new Promise(r => setTimeout(r, backoff))
    }
  }
  throw lastErr!
}

export async function fdGet(path: string, params: Record<string, string> = {}): Promise<any> {
  return withRetry(async () => {
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    const res = await fetch(`${fdBaseUrl()}${path}${qs}`, {
      headers: { Authorization: fdAuthHeader(), 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Freshdesk ${res.status}: ${path} ${text.slice(0, 200)}`)
    }
    return res.json()
  })
}

export async function getGroupsMap(): Promise<Record<string, number | null>> {
  return withRetry(async () => {
    const groups = await fdGet('/groups')
    return {
      n1: groups.find((g: any) => /suporte.*n1|n1.*suporte/i.test(g.name))?.id ?? null,
      n2: groups.find((g: any) => /suporte.*n2|n2.*suporte/i.test(g.name))?.id ?? null,
      n3: groups.find((g: any) => /dev.*n3|n3.*dev/i.test(g.name))?.id ?? null,
    }
  }, { retries: 1 })
}

export async function fetchTicketsByCompany(freshdeskCompanyId: number, month: string): Promise<any[]> {
  const [year, mo] = month.split('-')
  const monthStart = new Date(`${year}-${mo}-01T00:00:00Z`)
  const monthEnd = new Date(Number(year), Number(mo), 1)
  let all: any[] = []
  let page = 1
  while (page <= 20) {
    const data = await fdGet('/tickets', {
      company_id: String(freshdeskCompanyId),
      per_page: '100',
      page: String(page),
      include: 'stats',
      order_by: 'created_at',
      order_type: 'desc',
    })
    if (!Array.isArray(data) || !data.length) break
    const oldest = new Date(data[data.length - 1].created_at)
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

export async function fetchContactsByCompany(freshdeskCompanyId: number): Promise<any[]> {
  let all: any[] = []
  let page = 1
  while (page <= 10) {
    const data = await fdGet('/contacts', {
      company_id: String(freshdeskCompanyId),
      per_page: '100',
      page: String(page),
    })
    if (!Array.isArray(data) || !data.length) break
    all = all.concat(data)
    if (data.length < 100) break
    page++
  }
  return all
}

export function processTicketsToSupport(tickets: any[], clientId: number, month: string, groupsMap: Record<string, number | null>) {
  const tickets_opened = tickets.length
  const tickets_resolved = tickets.filter((t: any) => t.status === 4 || t.status === 5).length
  const responseTimes = tickets
    .map((t: any) => {
      if (typeof t.first_response_time === 'number' && t.first_response_time > 0) return Math.round(t.first_response_time / 60)
      if (t.stats?.first_responded_at) {
        const created = new Date(t.created_at).getTime()
        const responded = new Date(t.stats.first_responded_at).getTime()
        return Math.round((responded - created) / 60000)
      }
      return null
    })
    .filter((ms: any) => ms !== null && ms >= 1 && ms <= 480) as number[]
  const sla_first_response = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0
  const n1_pct = groupsMap.n1 != null ? tickets.filter((t: any) => t.group_id === groupsMap.n1).length : 0
  const n2_pct = groupsMap.n2 != null ? tickets.filter((t: any) => t.group_id === groupsMap.n2).length : 0
  const n3_pct = groupsMap.n3 != null ? tickets.filter((t: any) => t.group_id === groupsMap.n3).length : 0
  return { client_id: clientId, ref_month: month, tickets_opened, tickets_resolved, sla_first_response, n1_pct, n2_pct, n3_pct }
}

// Kill switch: freshdesk_config key `freshdesk_canonical_enabled` (boolean, default true)
export async function isCanonicalEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin.from('freshdesk_config').select('data').eq('key', 'freshdesk_canonical_enabled').maybeSingle()
    if (data?.data == null) return true
    return data.data.enabled !== false
  } catch {
    return true
  }
}
