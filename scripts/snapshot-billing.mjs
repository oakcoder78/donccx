import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('/home/oak/projects/donc/donccx/.env.local', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SECRET_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function fetchAll(path) {
  const out = []; let off = 0; const size = 1000
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Range: `${off}-${off + size - 1}`, 'Range-Unit': 'items' } })
    if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`)
    const rows = await r.json(); out.push(...rows)
    if (rows.length < size) break
    off += size
  }
  return out
}

const lit = v => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  return `'${String(v).replace(/'/g, "''")}'`
}

const tables = [
  { name: 'contract_charges', pk: 'id' },
  { name: 'billing_payments', pk: null },
]

const lines = [
  '-- Snapshot das tabelas que o rebuild de faturamento vai aposentar.',
  '-- Gerado por scripts/snapshot-billing.mjs em 2026-10-04, antes da Fase 1.',
  '--',
  '-- Restaurar (idempotente, sem TRUNCATE):',
  '--   psql "$DATABASE_URL" -f supabase/snapshots/20261004_pre_billing_rebuild.sql',
  '--',
  '-- contract_charges: o plano + horizonte materializado (134 linhas).',
  '-- billing_payments: os status de adimplencia (82 linhas).',
  '-- Nenhum dos dois e apagado pela Fase 1; este arquivo e a rede de seguranca',
  '-- para a Fase 7 (retire), quando as tabelas sao dropadas de fato.',
  '',
  'BEGIN;',
  '',
]

for (const t of tables) {
  const rows = await fetchAll(`${t.name}?select=*`)
  const cols = rows.length ? Object.keys(rows[0]) : []
  lines.push(`-- ${t.name}: ${rows.length} linhas`)
  lines.push(`INSERT INTO public.${t.name} (${cols.join(', ')}) VALUES`)
  const vals = rows.map(r => `  (${cols.map(c => lit(r[c])).join(', ')})`)
  lines.push(vals.join(',\n') + (t.pk ? '' : ''))
  lines.push('ON CONFLICT DO NOTHING;')
  lines.push('')
  console.log(`${t.name}: ${rows.length} linhas, ${cols.length} colunas`)
}

lines.push('COMMIT;')
lines.push('')

fs.writeFileSync('/home/oak/projects/donc/donccx/supabase/snapshots/20261004_pre_billing_rebuild.sql', lines.join('\n'))
console.log('snapshot escrito')
