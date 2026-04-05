/**
 * scripts/freshdesk-sync.js
 *
 * Versão standalone do syncAllCompanies para rodar no terminal (Node.js).
 * Chama o Freshdesk diretamente (sem proxy) usando service role key.
 *
 * Uso:
 *   node scripts/freshdesk-sync.js 2026-03
 *   node scripts/freshdesk-sync.js 2026-03 --dry-run   (não salva no banco)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// ── Carrega .env.local ────────────────────────────────────────────────────────
const __dir = fileURLToPath(new URL('.', import.meta.url))
try {
  const content = readFileSync(resolve(__dir, '../.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) process.env[key] = val
  }
} catch { /* ignorado */ }

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const FD_API_KEY        = process.env.FRESHDESK_API_KEY
const FD_DOMAIN         = process.env.FRESHDESK_DOMAIN

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios no .env.local')
  process.exit(1)
}
if (!FD_API_KEY || !FD_DOMAIN) {
  console.error('❌  FRESHDESK_API_KEY e FRESHDESK_DOMAIN obrigatórios no .env.local')
  process.exit(1)
}

const MONTH   = process.argv[2]
const DRY_RUN = process.argv.includes('--dry-run')

if (!MONTH || !/^\d{4}-\d{2}$/.test(MONTH)) {
  console.error('❌  Informe o mês no formato YYYY-MM  ex: node scripts/freshdesk-sync.js 2026-03')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FD_AUTH = 'Basic ' + Buffer.from(`${FD_API_KEY}:X`).toString('base64')

// ── Freshdesk helpers ─────────────────────────────────────────────────────────
async function fdGet(path, params = {}) {
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
  const url = `https://${FD_DOMAIN}/api/v2${path}${qs}`
  const res = await fetch(url, { headers: { Authorization: FD_AUTH, 'Content-Type': 'application/json' } })
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After') ?? 2)
    console.log(`    ⏳ Rate limit — aguardando ${retry}s...`)
    await new Promise(r => setTimeout(r, retry * 1000))
    return fdGet(path, params)
  }
  if (!res.ok) throw new Error(`Freshdesk ${path}: HTTP ${res.status}`)
  return res.json()
}

async function fetchGroups() {
  const groups = await fdGet('/groups')
  return {
    n1: groups.find(g => /suporte.*n1|n1.*suporte/i.test(g.name))?.id ?? null,
    n2: groups.find(g => /suporte.*n2|n2.*suporte/i.test(g.name))?.id ?? null,
    n3: groups.find(g => /dev.*n3|n3.*dev/i.test(g.name))?.id ?? null,
  }
}

async function fetchTicketsByCompany(companyId, month) {
  // Busca todos os tickets da empresa (paginado) e filtra pelo mês client-side.
  // A search API do Freshdesk não suporta company_id como campo de busca.
  const [year, mo] = month.split('-')
  const monthStart = new Date(`${year}-${mo}-01T00:00:00Z`)
  const monthEnd   = new Date(Number(year), Number(mo), 1)  // 1º dia mês seguinte

  let all = []; let page = 1
  while (page <= 20) {
    const data = await fdGet('/tickets', {
      company_id: String(companyId),
      per_page: '100',
      page: String(page),
      include: 'stats',
      order_by: 'created_at',
      order_type: 'desc',
    })
    if (!Array.isArray(data) || !data.length) break

    // Para quando chegamos em tickets anteriores ao mês
    const oldest = new Date(data[data.length - 1].created_at)
    const inMonth = data.filter(t => {
      const d = new Date(t.created_at)
      return d >= monthStart && d < monthEnd
    })
    all = all.concat(inMonth)

    if (oldest < monthStart) break  // tickets mais antigos que o mês — para
    if (data.length < 100) break
    page++
  }
  return all
}

async function fetchContactsByCompany(companyId) {
  let all = []; let page = 1
  while (page <= 10) {
    const data = await fdGet('/contacts', { company_id: String(companyId), per_page: '100', page: String(page) })
    if (!Array.isArray(data) || !data.length) break
    all = all.concat(data)
    if (data.length < 100) break
    page++
  }
  return all
}

function processTickets(tickets, clientId, month, groupsMap) {
  const tickets_opened   = tickets.length
  const tickets_resolved = tickets.filter(t => t.status === 4 || t.status === 5).length

  const responseTimes = tickets
    .filter(t => t.stats?.first_responded_at)
    .map(t => Math.round((new Date(t.stats.first_responded_at) - new Date(t.created_at)) / 60000))
    .filter(ms => ms > 0)

  const sla_first_response = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0

  const n1_pct = groupsMap.n1 != null ? tickets.filter(t => t.group_id === groupsMap.n1).length : 0
  const n2_pct = groupsMap.n2 != null ? tickets.filter(t => t.group_id === groupsMap.n2).length : 0
  const n3_pct = groupsMap.n3 != null ? tickets.filter(t => t.group_id === groupsMap.n3).length : 0

  return { client_id: clientId, ref_month: month, tickets_opened, tickets_resolved, sla_first_response, n1_pct, n2_pct, n3_pct }
}

// ── Sincronização de uma empresa ──────────────────────────────────────────────
async function syncOne(client, month, groupsMap) {
  const companyId = client.freshdesk_company_id

  const [tickets, contacts] = await Promise.all([
    fetchTicketsByCompany(companyId, month),
    fetchContactsByCompany(companyId),
  ])

  const supportData = processTickets(tickets, client.id, month, groupsMap)

  // Contatos novos (não vinculados a este cliente)
  const { data: existingLinks } = await supabase
    .from('contact_links')
    .select('contacts(email)')
    .eq('client_id', client.id)

  const existingEmails = new Set(
    (existingLinks ?? []).map(l => l.contacts?.email).filter(Boolean).map(e => e.toLowerCase()),
  )

  const ticketsByRequester = {}
  tickets.forEach(t => {
    if (t.requester_id) ticketsByRequester[t.requester_id] = (ticketsByRequester[t.requester_id] ?? 0) + 1
  })

  const newContacts = contacts
    .filter(c => c.email && !existingEmails.has(c.email.toLowerCase()))
    .map(c => {
      const ticketCount   = ticketsByRequester[c.id] ?? 0
      const isN3Requester = groupsMap.n3 != null &&
        tickets.some(t => t.requester_id === c.id && t.group_id === groupsMap.n3)
      return {
        fd_id:           c.id,
        name:            c.name,
        email:           c.email,
        phone:           c.phone ?? null,
        ticket_count:    ticketCount,
        suggested_papel: isN3Requester ? 'Técnico' : ticketCount >= 3 ? 'Influenciador' : 'Usuário',
      }
    })

  const snapshot = { ...supportData, new_contacts: newContacts }

  if (!DRY_RUN) {
    const refMonth = month.slice(0, 7)
    const { data: existingRows } = await supabase
      .from('client_support')
      .select('id, pending')
      .eq('client_id', client.id)
      .eq('ref_month', refMonth)

    const approvedRow = (existingRows ?? []).find(r => r.pending === false)
    const pendingRow  = (existingRows ?? []).find(r => r.pending === true)

    if (pendingRow) {
      const { error } = await supabase
        .from('client_support')
        .update({ freshdesk_snapshot: snapshot })
        .eq('id', pendingRow.id)
      if (error) throw error
    } else if (approvedRow) {
      const { error } = await supabase
        .from('client_support')
        .insert({ client_id: client.id, ref_month: refMonth, pending: true, freshdesk_snapshot: snapshot })
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('client_support')
        .insert({ client_id: client.id, ref_month: refMonth, pending: true, freshdesk_snapshot: snapshot })
      if (error) throw error
    }
  }

  return { tickets: tickets.length, resolved: supportData.tickets_resolved, sla: supportData.sla_first_response, n1: supportData.n1_pct, n2: supportData.n2_pct, n3: supportData.n3_pct, newContacts: newContacts.length }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎧  Freshdesk Sync — mês ${MONTH}${DRY_RUN ? ' (DRY RUN — sem salvar)' : ''}\n`)

  // Busca grupos
  process.stdout.write('🔍  Buscando grupos do Freshdesk... ')
  const groupsMap = await fetchGroups()
  console.log(`N1=${groupsMap.n1 ?? 'não encontrado'} N2=${groupsMap.n2 ?? 'não encontrado'} N3=${groupsMap.n3 ?? 'não encontrado'}`)

  // Busca clientes mapeados
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, freshdesk_company_id')
    .eq('contract_active', true)
    .not('freshdesk_company_id', 'is', null)

  if (error) throw error
  console.log(`\n📋  ${clients.length} cliente(s) com freshdesk_company_id para sincronizar\n`)

  const results = []
  for (const c of clients) {
    process.stdout.write(`   ⟳  ${c.name.slice(0, 40).padEnd(40)} `)
    try {
      const r = await syncOne(c, MONTH, groupsMap)
      const saved = DRY_RUN ? '[dry]' : '✔'
      console.log(`${saved}  tickets=${r.tickets} resolvidos=${r.resolved} sla=${r.sla}min N1=${r.n1} N2=${r.n2} N3=${r.n3} novos_contatos=${r.newContacts}`)
      results.push({ name: c.name, status: 'ok', ...r })
    } catch (e) {
      console.log(`❌  ${e.message}`)
      results.push({ name: c.name, status: 'erro', error: e.message })
    }
  }

  const synced = results.filter(r => r.status === 'ok').length
  const errors = results.filter(r => r.status === 'erro')
  const totalTickets = results.filter(r => r.status === 'ok').reduce((s, r) => s + r.tickets, 0)

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`✅  ${synced}/${clients.length} empresas sincronizadas — ${totalTickets} tickets no total`)
  if (errors.length) {
    console.log(`❌  Erros (${errors.length}):`)
    errors.forEach(e => console.log(`    • ${e.name}: ${e.error}`))
  }
  if (!DRY_RUN && synced > 0) {
    console.log(`\n📋  Acesse /config/freshdesk/pendentes para revisar os dados importados`)
  }
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
