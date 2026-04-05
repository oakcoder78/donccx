/**
 * scripts/freshdesk-map-companies.js
 *
 * Compara empresas do Freshdesk com clientes do doncCX e sugere mapeamento.
 *
 * Uso:
 *   node scripts/freshdesk-map-companies.js           → gera freshdesk-mapping.json
 *   node scripts/freshdesk-map-companies.js --apply   → aplica mapeamentos "auto" no banco
 *
 * Variáveis necessárias no .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FRESHDESK_API_KEY
 *   FRESHDESK_DOMAIN     (ex: donc)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
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
} catch { /* .env.local não encontrado */ }

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FD_API_KEY       = process.env.FRESHDESK_API_KEY
const FD_DOMAIN        = process.env.FRESHDESK_DOMAIN

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env.local')
  process.exit(1)
}
if (!FD_API_KEY || !FD_DOMAIN) {
  console.error('❌  FRESHDESK_API_KEY e FRESHDESK_DOMAIN são obrigatórios no .env.local')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FD_BASE = `https://${FD_DOMAIN}.freshdesk.com/api/v2`
const FD_AUTH = 'Basic ' + Buffer.from(`${FD_API_KEY}:X`).toString('base64')

// ── Helpers Freshdesk ─────────────────────────────────────────────────────────
async function fdGet(path) {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { Authorization: FD_AUTH, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Freshdesk ${path}: HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

async function fetchAllFdCompanies() {
  let all = []
  let page = 1
  while (page <= 10) {
    const data = await fdGet(`/companies?per_page=100&page=${page}`)
    if (!Array.isArray(data) || !data.length) break
    all = all.concat(data)
    if (data.length < 100) break
    page++
  }
  return all
}

// ── Normalização de nome ──────────────────────────────────────────────────────
function normalize(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltda|s\.?a\.?|eireli|me|epp|s\.?s\.?|inc|corp|group|grupo)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeMatch(client, fdCompanies) {
  const cNames = [client.name, client.fantasy_name]
    .filter(Boolean)
    .map(normalize)
    .filter(n => n.length > 2)

  const cSite = client.site
    ? client.site.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase()
    : null

  let best = null
  let bestScore = 0

  for (const fd of fdCompanies) {
    const fdName    = normalize(fd.name)
    const fdDomains = (fd.domains ?? []).map(d => d.toLowerCase())
    let score = 0

    if (cNames.some(n => n === fdName && n.length > 2)) {
      score = 100
    } else if (cSite && fdDomains.some(d =>
      d === cSite || (cSite.length > 4 && cSite.includes(d)) || (d.length > 4 && d.includes(cSite))
    )) {
      score = 90
    } else if (cNames.some(n =>
      n.length > 4 && fdName.length > 4 && (fdName.includes(n) || n.includes(fdName))
    )) {
      score = 70
    }

    if (score > bestScore) {
      bestScore = score
      best = { fdId: fd.id, fdName: fd.name, score, confidence: score >= 70 ? 'auto' : 'manual' }
    }
  }

  return best
}

// ── Formatação de tabela no terminal ─────────────────────────────────────────
function printTable(rows) {
  const W = [10, 36, 14, 36, 12]
  const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n)
  const sep = W.map(w => '-'.repeat(w + 2)).join('+')
  const row = cols => '| ' + cols.map((c, i) => pad(c, W[i])).join(' | ') + ' |'

  console.log('\n' + sep)
  console.log(row(['doncCX ID', 'doncCX Nome', 'Freshdesk ID', 'Freshdesk Nome', 'Confiança']))
  console.log(sep)
  for (const r of rows) {
    console.log(row([r.doncCX_id, r.doncCX_nome, r.freshdesk_id ?? '—', r.freshdesk_nome, r.confianca]))
  }
  console.log(sep + '\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔄  Buscando empresas do Freshdesk (${FD_DOMAIN}.freshdesk.com)...`)
  const fdCompanies = await fetchAllFdCompanies()
  console.log(`    → ${fdCompanies.length} empresas encontradas`)

  console.log('🔄  Buscando clientes do doncCX sem mapeamento...')
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, fantasy_name, site, freshdesk_company_id')
    .is('freshdesk_company_id', null)
    .order('name')
  if (error) throw error
  console.log(`    → ${clients.length} clientes sem freshdesk_company_id`)

  const rows = clients.map(c => {
    const match = computeMatch(c, fdCompanies)
    return {
      doncCX_id:    c.id,
      doncCX_nome:  c.name,
      freshdesk_id:   match?.fdId   ?? null,
      freshdesk_nome: match?.fdName ?? '—',
      confianca:      match         ? match.confidence : 'sem match',
    }
  })

  printTable(rows)

  const outPath = resolve(__dir, 'freshdesk-mapping.json')
  writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8')
  console.log(`✅  Mapeamento salvo em scripts/freshdesk-mapping.json`)

  const autoRows  = rows.filter(r => r.confianca === 'auto' && r.freshdesk_id)
  const manualRows = rows.filter(r => r.confianca !== 'auto')
  console.log(`\n📊  Resumo: ${autoRows.length} automáticos | ${manualRows.length} para revisão manual`)

  if (APPLY) {
    console.log('\n⬆️   Aplicando mapeamentos "auto" no banco...')
    let updated = 0
    for (const r of autoRows) {
      const { error: upErr } = await supabase
        .from('clients')
        .update({ freshdesk_company_id: r.freshdesk_id })
        .eq('id', r.doncCX_id)
      if (upErr) console.error(`    ❌  ${r.doncCX_nome}: ${upErr.message}`)
      else { console.log(`    ✔  ${r.doncCX_nome} → ${r.freshdesk_id}`); updated++ }
    }
    console.log(`\n    ${updated}/${autoRows.length} clientes atualizados`)
    if (manualRows.length) {
      console.log(`\n⚠️   ${manualRows.length} clientes sem match automático.`)
      console.log('    Edite freshdesk-mapping.json, preencha o freshdesk_id manualmente')
      console.log('    e rode novamente com --apply para aplicar as correções.')
    }
  } else {
    console.log('\nℹ️   Para aplicar os mapeamentos automáticos, rode com --apply')
  }
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
