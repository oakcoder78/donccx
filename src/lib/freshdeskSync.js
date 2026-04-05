/**
 * freshdeskSync.js
 *
 * Serviço de sincronização com o Freshdesk via proxy Edge Function.
 * Todas as chamadas à API passam pelo freshdesk-proxy para evitar CORS.
 *
 * Variáveis de ambiente (client-side):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Secrets na Edge Function (configurados no painel Supabase):
 *   FRESHDESK_DOMAIN
 *   FRESHDESK_API_KEY
 */

import { supabase } from './supabaseClient'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Proxy helper ──────────────────────────────────────────────────────────────
async function fdGet(path, params = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? ''

  const res = await fetch(`${SUPABASE_URL}/functions/v1/freshdesk-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ path, params }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Cache de grupos ───────────────────────────────────────────────────────────
let _groupsMap = null

async function getGroupsMap() {
  if (_groupsMap) return _groupsMap
  try {
    const groups = await fdGet('/groups')
    _groupsMap = {
      n1: groups.find(g => /suporte.*n1|n1.*suporte/i.test(g.name))?.id ?? null,
      n2: groups.find(g => /suporte.*n2|n2.*suporte/i.test(g.name))?.id ?? null,
      n3: groups.find(g => /dev.*n3|n3.*dev/i.test(g.name))?.id ?? null,
    }
  } catch {
    _groupsMap = { n1: null, n2: null, n3: null }
  }
  return _groupsMap
}

// ── fetchCompaniesFreshdesk ───────────────────────────────────────────────────
/** Busca todas as empresas cadastradas no Freshdesk (paginado, até 500). */
export async function fetchCompaniesFreshdesk() {
  let all = []
  let page = 1
  while (page <= 5) {
    const data = await fdGet('/companies', { per_page: '100', page: String(page) })
    if (!Array.isArray(data) || !data.length) break
    all = all.concat(data)
    if (data.length < 100) break
    page++
  }
  return all
}

// ── fetchTicketsByCompany ─────────────────────────────────────────────────────
/**
 * Busca tickets do mês especificado para a empresa Freshdesk.
 * @param {number} freshdeskCompanyId
 * @param {string} month  formato YYYY-MM
 */
export async function fetchTicketsByCompany(freshdeskCompanyId, month) {
  // A search API do Freshdesk não suporta company_id. Usa o endpoint padrão
  // com paginação e filtra pelo mês client-side.
  const [year, mo] = month.split('-')
  const monthStart = new Date(`${year}-${mo}-01T00:00:00Z`)
  const monthEnd   = new Date(Number(year), Number(mo), 1)

  let all  = []
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

    const oldest  = new Date(data[data.length - 1].created_at)
    const inMonth = data.filter(t => {
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

// ── processTicketsToSupport ───────────────────────────────────────────────────
/**
 * Processa array de tickets retornado pelo Freshdesk e produz o objeto
 * de suporte compatível com a tabela client_support.
 *
 * @param {object[]} tickets
 * @param {number}   clientId
 * @param {string}   month       formato YYYY-MM
 * @param {object}   [groupsMap] { n1, n2, n3 } com os IDs dos grupos Freshdesk
 */
export function processTicketsToSupport(tickets, clientId, month, groupsMap = {}) {
  const tickets_opened   = tickets.length
  const tickets_resolved = tickets.filter(t => t.status === 4 || t.status === 5).length

  // Média do tempo até a primeira resposta em minutos
  const responseTimes = tickets
    .filter(t => t.stats?.first_responded_at)
    .map(t => {
      const created   = new Date(t.created_at).getTime()
      const responded = new Date(t.stats.first_responded_at).getTime()
      return Math.round((responded - created) / 60000)
    })
    .filter(ms => ms > 0)

  const sla_first_response = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0

  // Contagem de tickets por grupo (N1 / N2 / N3)
  const n1_pct = groupsMap.n1 != null ? tickets.filter(t => t.group_id === groupsMap.n1).length : 0
  const n2_pct = groupsMap.n2 != null ? tickets.filter(t => t.group_id === groupsMap.n2).length : 0
  const n3_pct = groupsMap.n3 != null ? tickets.filter(t => t.group_id === groupsMap.n3).length : 0

  return { client_id: clientId, ref_month: month, tickets_opened, tickets_resolved, sla_first_response, n1_pct, n2_pct, n3_pct }
}

// ── fetchContactsByCompany ────────────────────────────────────────────────────
/** Busca todos os contatos vinculados à empresa no Freshdesk. */
export async function fetchContactsByCompany(freshdeskCompanyId) {
  let all  = []
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

// ── syncCompanySupport ────────────────────────────────────────────────────────
/**
 * Orquestra a busca de tickets e contatos do Freshdesk para um cliente,
 * e salva o resultado em client_support com pending = true para revisão.
 *
 * @param {number} clientId   ID interno do doncCX
 * @param {string} month      formato YYYY-MM
 * @returns {{ tickets, contacts, newContacts }}
 */
export async function syncCompanySupport(clientId, month) {
  // 1. Busca freshdesk_company_id do cliente
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('freshdesk_company_id, name')
    .eq('id', clientId)
    .single()
  if (cErr || !client) throw new Error('Cliente não encontrado')
  if (!client.freshdesk_company_id) throw new Error(`"${client.name}" não tem ID Freshdesk configurado`)

  const companyId = client.freshdesk_company_id

  // 2. Busca em paralelo: tickets, contatos e grupos
  const [tickets, fdContacts, groupsMap] = await Promise.all([
    fetchTicketsByCompany(companyId, month),
    fetchContactsByCompany(companyId),
    getGroupsMap(),
  ])

  // 3. Processa tickets
  const supportData = processTicketsToSupport(tickets, clientId, month, groupsMap)

  // 4. Identifica contatos novos (não existem no doncCX para este cliente)
  const { data: existingLinks } = await supabase
    .from('contact_links')
    .select('contacts(email)')
    .eq('client_id', clientId)

  const existingEmails = new Set(
    (existingLinks ?? []).map(l => l.contacts?.email).filter(Boolean).map(e => e.toLowerCase()),
  )

  // Conta tickets por requester para sugerir papel
  const ticketsByRequester = {}
  tickets.forEach(t => {
    if (t.requester_id) ticketsByRequester[t.requester_id] = (ticketsByRequester[t.requester_id] ?? 0) + 1
  })

  const newContacts = fdContacts
    .filter(c => c.email && !existingEmails.has(c.email.toLowerCase()))
    .map(c => {
      const ticketCount   = ticketsByRequester[c.id] ?? 0
      const isN3Requester = groupsMap.n3 != null &&
        tickets.some(t => t.requester_id === c.id && t.group_id === groupsMap.n3)

      const suggested_papel = isN3Requester
        ? 'Técnico'
        : ticketCount >= 3
          ? 'Influenciador'
          : 'Usuário'

      return {
        fd_id:           c.id,
        name:            c.name,
        email:           c.email,
        phone:           c.phone ?? null,
        ticket_count:    ticketCount,
        suggested_papel,
      }
    })

  // 5. Monta snapshot
  const snapshot = { ...supportData, new_contacts: newContacts }

  // 6. Upsert com pending = true
  //    - Se já existe registro para o mês: atualiza apenas pending e snapshot
  //    - Se não existe: insere (valores principais ficam em 0 até aprovação)
  const { data: existing } = await supabase
    .from('client_support')
    .select('id')
    .eq('client_id', clientId)
    .eq('ref_month', month)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('client_support')
      .update({ pending: true, freshdesk_snapshot: snapshot })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('client_support')
      .insert({ client_id: clientId, ref_month: month, pending: true, freshdesk_snapshot: snapshot })
    if (error) throw error
  }

  return { tickets: tickets.length, contacts: fdContacts.length, newContacts: newContacts.length }
}

// ── syncAllCompanies ──────────────────────────────────────────────────────────
/**
 * Roda syncCompanySupport para todos os clientes ativos com freshdesk_company_id.
 * @param {string} month  formato YYYY-MM
 * @returns {{ synced: number, errors: Array<{ name, error }> }}
 */
export async function syncAllCompanies(month) {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, freshdesk_company_id')
    .eq('contract_active', true)
    .not('freshdesk_company_id', 'is', null)

  if (error) throw error
  if (!clients?.length) return { synced: 0, errors: [] }

  const results = await Promise.allSettled(
    clients.map(c => syncCompanySupport(c.id, month)),
  )

  const synced = results.filter(r => r.status === 'fulfilled').length
  const errors = results
    .map((r, i) => r.status === 'rejected'
      ? { name: clients[i].name, error: r.reason?.message ?? 'Erro desconhecido' }
      : null,
    )
    .filter(Boolean)

  return { synced, errors }
}
