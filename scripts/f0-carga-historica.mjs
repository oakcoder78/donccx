/**
 * F0 — Conferencia da carga historica do faturamento.
 *
 * Task F0 do docs/sdd/financeiro-faturamento-sdd.md §5.1. Le a configuracao das
 * series e o uso real da base, calcula a fatura de cada competencia e escreve:
 *   - docs/operations/faturamento-carga-historica.csv  (detalhe, 582 linhas)
 *   - o resumo e as anomalias em stdout (vao para o .md)
 *
 * Regra aplicada: fatura = unit x greatest(piso, uso), onde o uso e do cliente e
 * compartilhado entre series. Uso agregado por (client_id, ref_month) sobre todas
 * as instancias, ignorando pending=true, com fallback donc_snapshot.totalOs -> os_created.
 *
 * Uso: node scripts/f0-carga-historica.mjs
 * Requer: VITE_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local (somente leitura).
 */
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('/home/oak/projects/donc/donccx/.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const URL = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SECRET_KEY
if (!URL || !KEY) throw new Error('faltam VITE_SUPABASE_URL / SUPABASE_SECRET_KEY')

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function fetchAll(path) {
  const out = []
  let offset = 0
  const size = 1000
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { ...H, Range: `${offset}-${offset + size - 1}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < size) break
    offset += size
  }
  return out
}

const clients = await fetchAll('clients?select=id,name,fantasy_name,lifecycle_stage')
const series = await fetchAll('contract_series?select=id,client_id,label,kind,billing_type,billing_floor,billing_base_value,usage_driven,due_day,billing_start,status,contract_months,auto_renew,billing_end,correction_index,correction_anniversary&status=eq.ativa')
const charges = await fetchAll('contract_charges?select=series_id,kind,ref_month,amount')
const usage = await fetchAll('client_usage?select=client_id,ref_month,instance_id,profissionais_versao,os_created,donc_snapshot,pending')

const clientById = new Map(clients.map(c => [c.id, c]))
const active = series.filter(s => clientById.get(s.client_id)?.lifecycle_stage === 'cliente')

// usage agregado por (client, competencia)
const uAgg = new Map()
for (const u of usage) {
  if (u.pending === true) continue
  const k = `${u.client_id}|${u.ref_month}`
  let a = uAgg.get(k)
  if (!a) { a = { lic: 0, os: 0, inst: new Set(), rows: 0, temLic: false, temOs: false }; uAgg.set(k, a) }
  a.rows++
  if (u.instance_id != null) a.inst.add(u.instance_id)
  const arr = Array.isArray(u.profissionais_versao) ? u.profissionais_versao : []
  if (arr.length > 0) a.temLic = true
  a.lic += arr.filter(p => p && p.ativo === true).length
  const osRaw = u.donc_snapshot?.totalOs ?? u.os_created
  if (osRaw !== null && osRaw !== undefined) a.temOs = true
  a.os += Number(osRaw) || 0
}

const rulesBy = new Map()
for (const c of charges) {
  if (c.kind !== 'recorrencia') continue
  rulesBy.set(c.series_id, (rulesBy.get(c.series_id) || 0) + 1)
}

const monthDiff = (a, b) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
const pad = n => String(n).padStart(2, '0')
// CSV para Excel pt-BR: separador ';' e decimal ','
const br = n => n.toFixed(2).replace('.', ',')
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()

const rows = []
for (const s of active) {
  const cli = clientById.get(s.client_id)
  const start = new Date(`${s.billing_start}T00:00:00Z`)
  const end = new Date(Date.UTC(2026, 8, 1))
  const n = monthDiff(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), end)
  for (let i = 0; i <= n; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    const comp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
    const a = uAgg.get(`${s.client_id}|${comp}`)
    const ehOs = s.billing_type === 'os' || s.billing_type === 'por_os'
    const uso = !a ? 0 : (ehOs ? a.os : a.lic)
    const piso = Number(s.billing_floor) || 0
    const unit = Number(s.billing_base_value) || 0
    const base = unit * piso
    const excedente = s.usage_driven ? Math.max(0, uso - piso) * unit : 0
    const valor = s.usage_driven ? unit * Math.max(piso, uso) : base
    const day = Math.min(Math.max(1, Number(s.due_day) || 5), lastDay(d.getUTCFullYear(), d.getUTCMonth() + 1))
    rows.push({
      cliente: cli?.fantasy_name || cli?.name || String(s.client_id),
      serie: s.label || 'Contrato original',
      tipo: s.billing_type.replace(/^por_/,''),
      piso,
      unit: br(unit),
      competencia: comp,
      mes: i + 1,
      uso,
      snapshot: a ? 'sim' : 'nao',
      uso_real: a ? ((ehOs ? a.temOs : a.temLic) ? 'sim' : 'nao') : 'nao',
      instancias: a ? a.inst.size : 0,
      base: br(base),
      excedente: br(excedente),
      valor: br(valor),
      _base: base,
      _exc: excedente,
      _valor: valor,
      vencimento: `${comp}-${pad(day)}`,
      tem_regra: (rulesBy.get(s.id) || 0) > 0 ? 'sim' : 'nao',
    })
  }
}
rows.sort((x, y) => x.cliente.localeCompare(y.cliente) || x.competencia.localeCompare(y.competencia))

const cols = ['cliente','serie','tipo','piso','unit','competencia','mes','uso','uso_real','snapshot','instancias','base','excedente','valor','vencimento','tem_regra']
const csv = [cols.join(';'), ...rows.map(r => cols.map(c => r[c]).join(';'))].join('\n')
fs.writeFileSync('/home/oak/projects/donc/donccx/docs/operations/faturamento-carga-historica.csv', csv + '\n')

// ---- resumo por cliente
const byClient = new Map()
for (const r of rows) {
  let a = byClient.get(r.cliente)
  if (!a) { a = { meses: 0, comUso: 0, base: 0, exc: 0, valor: 0, de: r.competencia, ate: r.competencia, tipos: new Set(), piso: r.piso, unit: r.unit, regra: r.tem_regra, inst: 0 }; byClient.set(r.cliente, a) }
  a.meses++; if (r.uso_real === 'sim') a.comUso++
  a.base += r._base; a.exc += r._exc; a.valor += r._valor
  if (r.competencia < a.de) a.de = r.competencia
  if (r.competencia > a.ate) a.ate = r.competencia
  a.tipos.add(r.tipo); a.inst = Math.max(a.inst, r.instancias)
}

console.log('=== RESUMO POR CLIENTE ===')
console.log('cliente;tipo;piso;unit;meses;com_uso;base;excedente;valor;de;ate;regra;max_inst')
for (const [c, a] of [...byClient].sort((x, y) => x[0].localeCompare(y[0]))) {
  console.log(`${c};${[...a.tipos].join('+')};${a.piso};${br(+a.unit)};${a.meses};${a.comUso};${br(a.base)};${br(a.exc)};${br(a.valor)};${a.de};${a.ate};${a.regra};${a.inst}`)
}

console.log('\n=== TOTAIS ===')
console.log('linhas:', rows.length)
console.log('meses com uso real:', rows.filter(r => r.uso_real === 'sim').length)
console.log('meses no piso (sem dado):', rows.filter(r => r.uso_real === 'nao').length)
console.log('meses com algum snapshot:', rows.filter(r => r.snapshot === 'sim').length)
console.log('soma base:', br(rows.reduce((t, r) => t + r._base, 0)))
console.log('soma excedente:', br(rows.reduce((t, r) => t + r._exc, 0)))
console.log('soma valor:', br(rows.reduce((t, r) => t + r._valor, 0)))
console.log('linhas com valor zero:', rows.filter(r => r._valor === 0).length)
console.log('series sem regra:', new Set(rows.filter(r => r.tem_regra === 'nao').map(r => r.cliente)).size)

console.log('\n=== ANOMALIAS ===')
for (const s of active) {
  const cli = clientById.get(s.client_id)
  const nm = cli?.fantasy_name || cli?.name
  const notes = []
  if (!(rulesBy.get(s.id) > 0)) notes.push('sem regra cadastrada')
  if ((Number(s.billing_floor) || 0) === 0) notes.push('piso 0')
  if (s.contract_months == null) notes.push('contract_months NULL')
  if (!s.auto_renew) notes.push('auto_renew=false')
  if (s.correction_index && !/^(IGPM|IPCA|IGPM\/IPCA|IPCA\/IGPM)$/.test(s.correction_index)) notes.push(`indice "${s.correction_index}"`)
  const u = [...uAgg].filter(([k]) => k.startsWith(`${s.client_id}|`))
  if (u.length === 0) notes.push('SEM USO NENHUM')
  const maxInst = Math.max(0, ...u.map(([, a]) => a.inst.size))
  if (maxInst > 1) notes.push(`${maxInst} instancias`)
  if (notes.length) console.log(`${nm} [${s.label}]: ${notes.join(' | ')}`)
}
