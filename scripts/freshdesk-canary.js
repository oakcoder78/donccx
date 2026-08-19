/**
 * scripts/freshdesk-canary.js
 *
 * Canary comparison for Freshdesk sync (Phase 4 stabilization).
 * Compares client_support data between two runs (manual vs cron) for a given ref_month,
 * and checks kill switch status.
 *
 * Usage:
 *   node scripts/freshdesk-canary.js 2026-07
 *   node scripts/freshdesk-canary.js 2026-07 --kill-switch-test
 *
 * Requires .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dir = fileURLToPath(new URL('.', import.meta.url))
let env = {}
try {
  const content = readFileSync(resolve(__dir, '../.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const refMonth = process.argv[2]
const killTest = process.argv.includes('--kill-switch-test')

if (!refMonth || !/^\d{4}-\d{2}$/.test(refMonth)) {
  console.log('Usage: node scripts/freshdesk-canary.js YYYY-MM [--kill-switch-test]')
  process.exit(1)
}

async function main() {
  console.log(`\n=== Freshdesk Canary: ${refMonth} ===\n`)

  // 1. Kill switch status
  const { data: killSwitch } = await supabase.from('freshdesk_config').select('data').eq('key', 'freshdesk_canonical_enabled').maybeSingle()
  const enabled = killSwitch?.data?.enabled !== false
  console.log(`Kill switch freshdesk_canonical_enabled: ${enabled ? 'ON (canônico)' : 'OFF (legado)'}`)

  if (killTest) {
    console.log('\n--- Kill switch test ---')
    console.log('Disabling canonical...')
    await supabase.from('freshdesk_config').upsert({ key: 'freshdesk_canonical_enabled', data: { enabled: false } }, { onConflict: 'key' })
    console.log('✓ Disabled. Run a manual sync via UI and check logs for [freshdesk] canonical disabled')
    console.log('Re-enabling...')
    await supabase.from('freshdesk_config').upsert({ key: 'freshdesk_canonical_enabled', data: { enabled: true } }, { onConflict: 'key' })
    console.log('✓ Re-enabled.')
    return
  }

  // 2. Client support for month
  const { data: rows, error } = await supabase
    .from('client_support')
    .select('client_id, ref_month, revision, run_id, tickets_opened, tickets_resolved, sla_first_response, n1_pct, n2_pct, n3_pct, pending, metrics_status, contacts_status, published_at, previous_snapshot, clients(name)')
    .eq('ref_month', refMonth)
    .order('client_id')

  if (error) { console.error(error); process.exit(1) }

  console.log(`\nFound ${rows.length} rows for ${refMonth}\n`)
  console.log('client_id | client | rev | run_id | pending | metrics | contacts | tickets | published_at')
  console.log('-'.repeat(110))
  for (const r of rows) {
    const name = r.clients?.name?.slice(0, 22).padEnd(22) ?? String(r.client_id).padEnd(22)
    console.log(
      `${String(r.client_id).padEnd(9)} | ${name} | ${String(r.revision).padEnd(3)} | ${r.run_id.slice(0, 8)} | ${String(r.pending).padEnd(7)} | ${r.metrics_status.padEnd(7)} | ${r.contacts_status.padEnd(8)} | ${String(r.tickets_opened).padEnd(7)} | ${r.published_at ? new Date(r.published_at).toLocaleDateString('pt-BR') : '—'}`
    )
  }

  // 3. Check for versioned reimports
  const reimports = rows.filter(r => r.revision > 1)
  if (reimports.length) {
    console.log(`\n--- Reimports detected: ${reimports.length} ---`)
    for (const r of reimports) {
      console.log(`client ${r.client_id} rev ${r.revision} prev tickets=${r.previous_snapshot?.tickets_opened ?? '?'}`)
    }
  } else {
    console.log('\nNo reimports (all revision=1) — publish a month then re-sync to test versioning')
  }

  // 4. Audit tail
  const { data: audits } = await supabase
    .from('audit_logs')
    .select('action, entity_id, created_at')
    .like('action', 'freshdesk_%')
    .order('created_at', { ascending: false })
    .limit(5)

  if (audits?.length) {
    console.log('\n--- Recent freshdesk audits ---')
    for (const a of audits) console.log(`${new Date(a.created_at).toLocaleString('pt-BR')} | ${a.action} | ${a.entity_id}`)
  }

  // 5. Sync log tail
  const { data: logs } = await supabase.from('sync_log').select('started_at, status, summary').eq('job_name', 'monthly-sync').order('started_at', { ascending: false }).limit(3)
  if (logs?.length) {
    console.log('\n--- Recent sync_log (cron) ---')
    for (const l of logs) console.log(`${new Date(l.started_at).toLocaleString('pt-BR')} | ${l.status} | freshdesk: ${l.summary?.freshdesk?.synced ?? '?'} empresas`)
  }

  console.log('\n=== Canary complete ===')
  console.log('Next: run manual sync via UI for same month, then re-run this script to compare run_id/revision')
  console.log('Kill switch test: node scripts/freshdesk-canary.js 2026-07 --kill-switch-test\n')
}

main().catch(e => { console.error(e); process.exit(1) })
