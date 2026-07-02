import { useState } from 'react'
import { useSyncStatus, useSyncHistory } from '@/hooks/useSyncStatus'
import { supabase } from '@/lib/supabaseClient'
import { Icons } from '@/lib/icons'
import { Badge } from '../ui/Badge'
import toast from 'react-hot-toast'
import { friendlyError } from '@/lib/syncErrors'

function formatDateTimeBR(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('pt-BR', { timeZone: 'UTC', timeZoneName: 'short' })
}

function nextCronDate() {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 1, 0))
  if (next <= now) {
    next.setUTCMonth(next.getUTCMonth() + 1)
  }
  return next.toLocaleString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

function prevMonthValue() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const SCHEDULE_PRESETS = [
  { label: 'Mensal (1º dia 00:01 UTC)', value: '1 0 1 * *' },
  { label: 'Trimestral (1º dia 00:01 UTC)', value: '1 0 1 */3 *' },
  { label: 'Semestral (1º dia 00:01 UTC)', value: '1 0 1 1,7 *' },
  { label: 'Customizado', value: '' },
]

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
    transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
  }),
  codeBox: { padding: '8px 12px', backgroundColor: '#f4f5f7', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', color: '#1a1a18', overflow: 'auto' },
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
  const { data: lastRun, isLoading, error, refetch: refetchLatest } = useSyncStatus()
  const { data: history = [], refetch: refetchHistory } = useSyncHistory({ limit: 15, enabled: true })

  // ── Executar agora ──
  const [month, setMonth] = useState(prevMonthValue())
  const [executing, setExecuting] = useState(false)

  // ── Agendamento ──
  const [preset, setPreset] = useState('1 0 1 * *')
  const [customCron, setCustomCron] = useState('')
  const [saving, setSaving] = useState(false)
  const [oneoffDatetime, setOneoffDatetime] = useState('')
  const [schedulingOneoff, setSchedulingOneoff] = useState(false)

  // ── Executar agora ──
  async function handleRunNow() {
    setExecuting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-schedule`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'run-now', month }),
        },
      )
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)

      toast.success('Sincronização completa concluída')
      refetchLatest()
      refetchHistory()
    } catch (e) {
      toast.error(friendlyError(e.message))
    } finally {
      setExecuting(false)
    }
  }

  // ── Salvar schedule ──
  async function handleSaveSchedule() {
    const schedule = preset === '' ? customCron.trim() : preset
    if (!schedule) { toast.error('Selecione ou digite um cron schedule'); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-schedule`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'set-schedule', schedule }),
        },
      )
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)

      toast.success('Schedule atualizado')
    } catch (e) {
      toast.error(friendlyError(e.message))
    } finally {
      setSaving(false)
    }
  }

  // ── Agendar one-off ──
  async function handleScheduleOneoff() {
    if (!oneoffDatetime) { toast.error('Selecione data e hora'); return }
    setSchedulingOneoff(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const datetime = new Date(oneoffDatetime).toISOString()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-schedule`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'schedule-oneoff', datetime }),
        },
      )
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)

      const d = new Date(oneoffDatetime)
      toast.success(`Execução única agendada para ${d.toLocaleString('pt-BR')}`)
      setOneoffDatetime('')
    } catch (e) {
      toast.error(friendlyError(e.message))
    } finally {
      setSchedulingOneoff(false)
    }
  }

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
            <div style={{ fontSize: 12, color: '#888780', borderTop: '1px solid #e8e7e3', paddingTop: 12 }}>
              <p style={{ margin: 0 }}>
                <strong style={{ color: '#1a1a18' }}>Próxima execução automática:</strong>{' '}
                {nextCronDate()}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11 }}>
                O cron executa no 1º dia de cada mês às 00:01 UTC.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Executar agora ── */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icons.Activity size={16} style={{ color: '#173557' }} />
          <p style={S.sectionTitle}>Executar Sincronização Agora</p>
        </div>
        <p style={S.sectionDesc}>
          Dispara a orquestração completa (DONC API → Freshdesk → Health Score → Trends).
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div style={{ ...S.fieldBox, flex: 1 }}>
            <label style={S.label}>Mês de referência</label>
            <input type="month" style={S.input} value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div style={S.fieldBox}>
            <button style={S.btn('#59c2ed', executing)} onClick={handleRunNow} disabled={executing}>
              {executing ? 'Executando...' : 'Executar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Agendamento ── */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icons.Clock size={16} style={{ color: '#173557' }} />
          <p style={S.sectionTitle}>Agendamento</p>
        </div>
        <p style={S.sectionDesc}>
          Altere a recorrência automática ou agende uma execução única.
        </p>

        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={S.fieldBox}>
              <label style={S.label}>Schedule</label>
              <select style={S.select} value={preset} onChange={e => setPreset(e.target.value)}>
                {SCHEDULE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {preset === '' && (
                <input
                  type="text"
                  style={{ ...S.input, marginTop: 8, fontFamily: 'monospace' }}
                  value={customCron}
                  onChange={e => setCustomCron(e.target.value)}
                  placeholder="Ex: 0 2 * * 1 (toda segunda às 02:00)"
                />
              )}
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button style={S.btn('#173557', saving)} onClick={handleSaveSchedule} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Schedule'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={S.fieldBox}>
              <label style={S.label}>Execução única (data/hora)</label>
              <input
                type="datetime-local"
                style={S.input}
                value={oneoffDatetime}
                onChange={e => setOneoffDatetime(e.target.value)}
              />
              <p style={{ fontSize: 11, color: '#888780', margin: '4px 0 0' }}>
                O job é removido automaticamente após executar.
              </p>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button style={S.btn('#b45309', schedulingOneoff || !oneoffDatetime)} onClick={handleScheduleOneoff} disabled={schedulingOneoff || !oneoffDatetime}>
                {schedulingOneoff ? 'Agendando...' : 'Agendar'}
              </button>
            </div>
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
