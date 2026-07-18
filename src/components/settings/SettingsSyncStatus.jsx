import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncStatus, useSyncHistory } from '@/hooks/useSyncStatus'
import { useSyncConfig } from '@/hooks/useSyncConfig'
import { supabase } from '@/lib/supabaseClient'
import { Icons } from '@/lib/icons'
import { Badge } from '../ui/Badge'
import toast from 'react-hot-toast'
import { friendlyError } from '@/lib/syncErrors'

function formatDateTimeBR(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', timeZoneName: 'short' })
}

function prevMonthValue() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatDateBR(d) {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

function periodToCron(n, unit) {
  if (!n || n < 1) return null
  if (unit === 'meses') return `1 3 1 */${Math.round(n)} *`
  if (unit === 'dias') return `1 3 */${Math.round(n)} * *`
  return null
}

function parseCronToPeriod(cronExpr) {
  if (!cronExpr) return null
  const m = cronExpr.match(/^1 3 1 \*\/(\d+) \*$/)
  if (m) return { n: parseInt(m[1]), unit: 'meses' }
  const d = cronExpr.match(/^1 3 \*\/(\d+) \* \*$/)
  if (d) return { n: parseInt(d[1]), unit: 'dias' }
  return null
}

function nextCronDate(cronExpr) {
  if (!cronExpr) return null
  const now = new Date()

  if (cronExpr === '1 3 1 * *') {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3, 1, 0))
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1)
    return formatDateBR(next)
  }

  if (cronExpr === '1 3 1 */3 *') {
    let next = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1, 3, 1, 0))
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 3)
    return formatDateBR(next)
  }

  if (cronExpr === '1 3 1 1,7 *') {
    let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() < 7 ? 0 : 6, 1, 3, 1, 0))
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 6)
    return formatDateBR(next)
  }

  const meses = cronExpr.match(/^1 3 1 \*\/(\d+) \*$/)
  if (meses) {
    const n = parseInt(meses[1])
    let next = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / n) * n, 1, 3, 1, 0))
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + n)
    return formatDateBR(next)
  }

  const dias = cronExpr.match(/^1 3 \*\/(\d+) \* \*$/)
  if (dias) {
    const n = parseInt(dias[1])
    let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 1, 0))
    next.setUTCDate(Math.ceil(next.getUTCDate() / n) * n)
    if (next <= now) next.setUTCDate(next.getUTCDate() + n)
    return formatDateBR(next)
  }

  return null
}

const SCHEDULE_PRESETS = [
  { label: 'Mensal', cron: '1 3 1 * *' },
  { label: 'Trimestral', cron: '1 3 1 */3 *' },
  { label: 'Semestral', cron: '1 3 1 1,7 *' },
  { label: 'Personalizado', cron: null },
]

const UTC_TO_BRT = {
  '1 0 1 * *': '1 3 1 * *',
  '1 0 1 */3 *': '1 3 1 */3 *',
  '1 0 1 1,7 *': '1 3 1 1,7 *',
}
function toBRT(cronExpr) { return UTC_TO_BRT[cronExpr] || cronExpr }

function getScheduleLabel(cronExpr) {
  if (!cronExpr) return 'Não configurado'
  const preset = SCHEDULE_PRESETS.find(p => p.cron === cronExpr)
  if (preset && preset.cron) return preset.label
  const parsed = parseCronToPeriod(cronExpr)
  if (parsed) return `A cada ${parsed.n} ${parsed.unit}`
  return 'Personalizado'
}

async function callSyncSchedule(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-schedule`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)
  return result
}

const S = {
  section: {
    backgroundColor: '#fff',
    border: '0.5px solid #e8e7e3',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a18', margin: '0 0 4px' },
  sectionDesc:  { fontSize: 12, color: '#888780', margin: '0 0 18px', lineHeight: 1.5 },
  label:        { display: 'block', fontSize: 11, fontWeight: 600, color: '#888780', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  input:        { width: '100%', padding: '7px 10px', border: '1px solid #d4d3ce', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a18', backgroundColor: '#fff' },
  select:       { width: '100%', padding: '7px 10px', border: '1px solid #d4d3ce', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a18', backgroundColor: '#fff', cursor: 'pointer' },
  fieldBox:     { marginBottom: 10 },
  btn: (color = '#173557', disabled = false) => ({
    padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: disabled ? '#e8e7e3' : color,
    color: disabled ? '#888780' : '#fff',
    transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  }),
  pendingBox: {
    padding: '12px 16px', marginBottom: 14, borderRadius: 7,
    backgroundColor: '#fffbeb', border: '1px solid #fde68a',
  },
}

function formatDuration(start, end) {
  if (!start || !end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`
}

function SummaryCell({ data }) {
  if (!data) return <span style={{ color: '#888780', fontSize: 12 }}>—</span>
  if (data.error) return <span style={{ color: '#dc2626', fontSize: 12 }}>{friendlyError(data.error)}</span>
  return <span style={{ color: '#166534', fontSize: 12 }}>{data.synced ?? data.recalculated ?? 'OK'}</span>
}

export function SettingsSyncStatus() {
  const queryClient = useQueryClient()
  const { data: lastRun, isLoading, error, refetch: refetchLatest } = useSyncStatus()
  const { data: history = [], refetch: refetchHistory } = useSyncHistory({ limit: 15, enabled: true })
  const { data: configData, isLoading: configLoading, isError: configError } = useSyncConfig()
  const schedule = configData?.config?.schedule ? toBRT(configData.config.schedule) : null
  const oneoff = configData?.oneoff?.schedule ? toBRT(configData.oneoff.schedule) : null

  // ── Execução Manual ──
  const [month, setMonth] = useState(prevMonthValue())
  const [executing, setExecuting] = useState(false)
  const [datetime, setDatetime] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // ── Agendamento Automático ──
  const [preset, setPreset] = useState('1 3 1 * *')
  const [customInterval, setCustomInterval] = useState(1)
  const [customUnit, setCustomUnit] = useState('meses')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!configData?.config?.schedule) return
    const found = SCHEDULE_PRESETS.find(p => p.cron === toBRT(configData.config.schedule))
    if (found && found.cron) setPreset(found.cron)
    else {
      const parsed = parseCronToPeriod(configData.config.schedule)
      setPreset('')
      if (parsed) { setCustomInterval(parsed.n); setCustomUnit(parsed.unit) }
      else { setCustomInterval(1); setCustomUnit('meses') }
    }
  }, [configData?.config?.schedule])

  async function handleExecute() {
    if (datetime) {
      setScheduling(true)
      try {
        await callSyncSchedule({ action: 'schedule-oneoff', datetime: new Date(datetime).toISOString() })
        toast.success(`Execução agendada para ${new Date(datetime).toLocaleString('pt-BR')}`)
        setDatetime('')
        queryClient.invalidateQueries({ queryKey: ['sync-config'] })
        refetchLatest()
        refetchHistory()
      } catch (e) {
        toast.error(friendlyError(e.message))
      } finally {
        setScheduling(false)
      }
    } else {
      setExecuting(true)
      try {
        await callSyncSchedule({ action: 'run-now', month })
        toast.success('Sincronização completa concluída')
        refetchLatest()
        refetchHistory()
      } catch (e) {
        toast.error(friendlyError(e.message))
      } finally {
        setExecuting(false)
      }
    }
  }

  async function handleSaveSchedule() {
    let schedule
    if (preset) schedule = preset
    else {
      schedule = periodToCron(customInterval, customUnit)
      if (!schedule) { toast.error('Defina o intervalo personalizado'); return }
    }
    setSaving(true)
    try {
      await callSyncSchedule({ action: 'set-schedule', schedule })
      toast.success('Schedule atualizado')
      queryClient.invalidateQueries({ queryKey: ['sync-config'] })
      refetchLatest()
      refetchHistory()
    } catch (e) {
      toast.error(friendlyError(e.message))
    } finally {
      setSaving(false)
    }
  }

  const busy = executing || scheduling

  const statusVariant = !lastRun ? 'slate' : lastRun.status === 'success' ? 'green' : 'red'
  const statusLabel = !lastRun ? 'Nunca executou' : lastRun.status === 'success' ? 'Sucesso' : 'Falha'
  const StatusIcon = !lastRun ? Icons.Clock : lastRun.status === 'success' ? Icons.CheckCircle : Icons.XCircle

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={S.sectionTitle}>Status da Sincronização Automática</p>
      <p style={S.sectionDesc}>
        Acompanhe a última execução do cron mensal que sincroniza API DONC, Freshdesk e Health Score.
      </p>

      {/* ── Status da última execução ── */}
      <div style={S.section}>
        {isLoading && <p style={{ fontSize: 13, color: '#888780' }}>Carregando...</p>}
        {error && <p style={{ fontSize: 13, color: '#dc2626' }}>Erro ao carregar status: {error.message}</p>}
        {!isLoading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <StatusIcon size={16} style={{ color: '#173557' }} />
              <div>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
                <p style={{ fontSize: 12, color: '#888780', margin: '4px 0 0' }}>
                  Última execução: {lastRun ? formatDateTimeBR(lastRun.started_at) : 'Nunca'}
                </p>
              </div>
            </div>
            {lastRun?.status === 'failed' && lastRun?.error_message && (
              <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Mensagem de erro:</p>
                <p style={{ margin: 0 }}>{lastRun.error_message}</p>
              </div>
            )}
            {lastRun?.status === 'success' && lastRun?.summary && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 12 }}>
                <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>DONC API</p>
                  <p style={{ color: '#166534', margin: 0 }}>{lastRun.summary?.donc?.synced ?? '—'} instâncias</p>
                </div>
                <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>Freshdesk</p>
                  <p style={{ color: '#166534', margin: 0 }}>{lastRun.summary?.freshdesk?.synced ?? '—'} empresas</p>
                </div>
                <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>Health Score</p>
                  <p style={{ color: '#166534', margin: 0 }}>{lastRun.summary?.health?.recalculated ?? '—'} clientes</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Execução Manual ── */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icons.Activity size={16} style={{ color: '#173557' }} />
          <p style={S.sectionTitle}>Execução Manual</p>
        </div>
        <p style={S.sectionDesc}>
          Execute a sincronização agora ou agende para uma data futura.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ ...S.fieldBox, flex: '1 0 160px', minWidth: 160 }}>
            <label style={S.label}>Mês de referência</label>
            <input type="month" style={S.input} value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div style={{ ...S.fieldBox, flex: '1 0 200px', minWidth: 200 }}>
            <label style={S.label}>Data/hora (opcional)</label>
            <input
              type="datetime-local"
              style={S.input}
              value={datetime}
              onChange={e => setDatetime(e.target.value)}
            />
          </div>
          <div style={{ ...S.fieldBox, flexShrink: 0 }}>
            <button style={S.btn('#59c2ed', busy)} onClick={handleExecute} disabled={busy}>
              {busy ? 'Processando...' : 'Executar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Agendamento Automático ── */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icons.Clock size={16} style={{ color: '#173557' }} />
          <p style={S.sectionTitle}>Agendamento Automático</p>
        </div>
        <p style={S.sectionDesc}>
          Configure a recorrência automática da sincronização.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ ...S.fieldBox, flex: '1 0 200px', minWidth: 200 }}>
            <label style={S.label}>Recorrência</label>
            <select style={S.select} value={preset} onChange={e => setPreset(e.target.value)}>
              {SCHEDULE_PRESETS.map(p => (
                <option key={p.cron || 'custom'} value={p.cron || ''}>{p.label}</option>
              ))}
            </select>
          </div>
          {!preset && (
            <>
              <div style={{ ...S.fieldBox, flex: '0 0 80px' }}>
                <label style={S.label}>A cada</label>
                <input
                  type="number" min="1" max="365"
                  style={S.input}
                  value={customInterval}
                  onChange={e => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div style={{ ...S.fieldBox, flex: '0 0 130px' }}>
                <label style={S.label}>Período</label>
                <select style={S.select} value={customUnit} onChange={e => setCustomUnit(e.target.value)}>
                  <option value="meses">Meses</option>
                  <option value="dias">Dias</option>
                </select>
              </div>
            </>
          )}
          <div style={{ ...S.fieldBox, flexShrink: 0 }}>
            <button style={S.btn('#173557', saving)} onClick={handleSaveSchedule} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Histórico de execuções ── */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icons.List size={16} style={{ color: '#173557' }} />
          <p style={S.sectionTitle}>Histórico de Execuções</p>
        </div>
        <p style={S.sectionDesc}>
          Últimas {history.length} execuções registradas.
        </p>

        {configLoading && (
          <div style={S.pendingBox}>
            <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>Carregando agendamento...</p>
          </div>
        )}
        {!configLoading && !configError && schedule && (
          <div style={S.pendingBox}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icons.Clock size={14} /> Aguardando próxima execução
              </span>
              <Badge variant={configData.config.active === false ? 'red' : 'green'}>
                {configData.config.active === false ? 'Inativo' : 'Ativo'}
              </Badge>
            </div>
            {oneoff ? (
              <>
                <p style={{ margin: 0, fontSize: 15, color: '#1a1a18', fontWeight: 700 }}>
                  {nextCronDate(oneoff)} <span style={{ fontSize: 11, fontWeight: 400, color: '#b45309' }}>(one-off)</span>
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888780' }}>
                  Próxima execução automática: {nextCronDate(schedule)}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 15, color: '#1a1a18', fontWeight: 700 }}>
                {nextCronDate(schedule)}
              </p>
            )}
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#92400e' }}>
              {getScheduleLabel(schedule)}
            </p>
          </div>
        )}
        {!configLoading && !configError && !configData?.config?.schedule && (
          <div style={S.pendingBox}>
            <p style={{ margin: 0, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.Clock size={14} /> Nenhum agendamento automático configurado.
            </p>
          </div>
        )}

        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: '#888780' }}>Nenhuma execução registrada.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e8e7e3' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>Início</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>Duração</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>DONC</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>FD</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>Health</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#888780', whiteSpace: 'nowrap' }}>Erro</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f0efeb' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatDateTimeBR(row.started_at)}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatDuration(row.started_at, row.finished_at)}</td>
                    <td style={{ padding: '6px 8px' }}><Badge variant={row.status === 'success' ? 'green' : 'red'}>{row.status}</Badge></td>
                    <td style={{ padding: '6px 8px' }}><SummaryCell data={row.summary?.donc} /></td>
                    <td style={{ padding: '6px 8px' }}><SummaryCell data={row.summary?.freshdesk} /></td>
                    <td style={{ padding: '6px 8px' }}><SummaryCell data={row.summary?.health} /></td>
                    <td style={{ padding: '6px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: row.error_message ? '#dc2626' : '#888780' }}>
                      {row.error_message
                        ? <span title={row.error_message}>{friendlyError(row.error_message)}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
