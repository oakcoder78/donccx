import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useAuditLog } from '../hooks/useAuditLog'
import { useContacts } from '../hooks/useContacts'
import { useProfiles } from '../hooks/useProfiles'
import { FASE_LABELS } from '../lib/onboardingLabels'
import { ProjectModal } from '../components/projects/ProjectModal'

// ── CSS injetado ──────────────────────────────────────────────────────────────
const PAGE_CSS = `
  @keyframes onb-slide { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
  .onb-panel { animation: onb-slide 0.18s ease; }
  .onb-icon-btn { border:none; background:transparent; cursor:pointer; border-radius:6px; padding:4px 7px; color:#888780; font-size:13px; line-height:1; }
  .onb-icon-btn:hover { background:rgba(15,34,58,0.08) !important; color:#173557 !important; }
  .onb-ms-wrap:hover .onb-ms-ring { box-shadow: 0 0 0 5px rgba(89,194,237,0.18); }
  .onb-row-hd { cursor:pointer; }
  .onb-row-hd:hover { background: rgba(15,34,58,0.025) !important; }
  .onb-pend-row:hover { background: rgba(15,34,58,0.03) !important; }
  .onb-adv-btn:hover { background: rgba(89,194,237,0.2) !important; }
  .onb-rev-btn:hover { background: rgba(15,34,58,0.07) !important; }
  .onb-tab { border:none; background:transparent; cursor:pointer; padding:6px 14px; font-size:12px; font-weight:600; color:#888780; border-radius:6px; font-family:inherit; }
  .onb-tab.active { background: rgba(89,194,237,0.12); color:#173557; }
  .onb-tab:hover { background: rgba(15,34,58,0.05); }
`

// ── Constantes ────────────────────────────────────────────────────────────────
const FASE_ORDER = ['definicao_escopo', 'preparacao_plataforma', 'treinamento', 'encerrado']
const MS_ORDER   = ['kickoff', 'projeto_tecnico_aprovado', 'go_live']

const SITUACAO_MAP = {
  fluindo: { color: '#1D9E75', label: 'Fluindo' },
  atencao: { color: '#BA7517', label: 'Atenção' },
  travado: { color: '#E24B4A', label: 'Travado' },
}

const PRIO_MAP = {
  bloqueadora: { label: 'Bloqueadora', color: '#E24B4A', bg: 'rgba(226,75,74,0.10)', border: '#E24B4A' },
  alta:        { label: 'Alta',        color: '#BA7517', bg: 'rgba(186,117,23,0.10)', border: '#BA7517' },
  normal:      { label: 'Normal',      color: '#888780', bg: 'rgba(136,135,128,0.08)', border: '#d4d3ce' },
}

const SPEND_MAP = {
  criada:               { label: 'Criada',               color: '#888780', bg: '#f4f5f7' },
  em_andamento:         { label: 'Em Andamento',         color: '#185FA5', bg: 'rgba(24,95,165,0.10)' },
  aguardando_validacao: { label: 'Aguardando Validação', color: '#BA7517', bg: 'rgba(186,117,23,0.10)' },
  encerrada:            { label: 'Encerrada',            color: '#1D9E75', bg: 'rgba(29,158,117,0.10)' },
}

const SACT_MAP = {
  pendente:     { label: 'Pendente',     color: '#888780' },
  em_andamento: { label: 'Em Andamento', color: '#185FA5' },
  concluida:    { label: 'Concluída',    color: '#1D9E75' },
}

const CAP_COLORS = [
  { color: '#0c447c', bg: 'rgba(89,194,237,0.16)' },
  { color: '#3b2fa0', bg: 'rgba(83,74,183,0.13)' },
  { color: '#0f6b4f', bg: 'rgba(29,158,117,0.13)' },
  { color: '#7a3c00', bg: 'rgba(211,218,71,0.18)' },
  { color: '#5a0a2a', bg: 'rgba(226,75,74,0.12)' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}
function faseIdx(fase) { return FASE_ORDER.indexOf(fase ?? 'definicao_escopo') }

// primeiro milestone não concluído na ordem
function getActiveMs(milestones) {
  for (const key of MS_ORDER) {
    const ms = milestones?.find(m => m.type === key)
    if (ms && !ms.occurred_at) return key
  }
  return null
}

// ── Shared style objects ──────────────────────────────────────────────────────
const card$ = { background: '#fff', borderRadius: 14, border: '1px solid rgba(15,34,58,0.09)', padding: '20px 22px' }
const input$ = { width: '100%', border: '1px solid #d4d3ce', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', color: '#173557', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const label$ = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }
const secTitle$ = { fontSize: 12, fontWeight: 700, color: '#173557', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.06em' }

// ── Data hooks ────────────────────────────────────────────────────────────────

function useProjectDetail(projectId) {
  return useQuery({
    queryKey: ['project_detail', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          client:clients(id, name, fantasy_name),
          onboarding:onboardings!onboarding_id(
            *,
            csm:profiles!csm_id(id, name),
            fases:onboarding_fases(*),
            milestones:onboarding_milestones(*),
            capabilities:onboarding_capabilities(
              id, catalog_item_id,
              catalog_item:catalog_items(id, name, type)
            )
          )
        `)
        .eq('id', projectId)
        .single()
      if (error) throw error
      return data
    },
    retry: 1,
  })
}

function useActivities(onboardingId) {
  return useQuery({
    queryKey: ['onb_activities', onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_activities')
        .select(`
          *,
          activity_type:onboarding_activity_types(id, name),
          resp_contato:contacts!responsible_contato_id(id, name),
          resp_interno:profiles!responsible_interno_id(id, name),
          pendencias:onboarding_pendencias!activity_id(
            *,
            resp_contato:contacts!responsavel_contato_id(id, name),
            resp_interno:profiles!responsavel_interno_id(id, name)
          )
        `)
        .eq('onboarding_id', onboardingId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    retry: 0,
  })
}

function useActivityTypes() {
  return useQuery({
    queryKey: ['onb_activity_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_activity_types')
        .select('id, name')
        .eq('active', true)
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SituacaoBadge({ situacao }) {
  const m = SITUACAO_MAP[situacao]
  if (!m) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: m.color, background: m.color + '18', borderRadius: 20, padding: '3px 10px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  )
}

function PrioBadge({ p }) {
  const m = PRIO_MAP[p] ?? PRIO_MAP.normal
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function StatusPendBadge({ s }) {
  const m = SPEND_MAP[s] ?? SPEND_MAP.criada
  return (
    <span style={{ fontSize: 11, fontWeight: 500, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function StatusActDot({ s }) {
  const m = SACT_MAP[s] ?? SACT_MAP.pendente
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0, display: 'inline-block' }} title={m.label} />
}

function Connector({ done, active }) {
  const bg = done
    ? '#1D9E75'
    : active
      ? 'linear-gradient(90deg, #1D9E75 0%, #59c2ed 100%)'
      : '#d4d3ce'
  return (
    <div style={{ flexShrink: 0, width: 28, height: 2, background: bg, alignSelf: 'center' }} />
  )
}

// ── MilestoneNode ─────────────────────────────────────────────────────────────

function MilestoneNode({ ms, isActive, onOpen, openMs, onClose, onConfirm, saving, clientId }) {
  const isDone = !!ms.occurred_at
  const isOpen = openMs === ms.type

  const ringColor = isDone ? '#1D9E75' : isActive ? '#59c2ed' : '#d4d3ce'
  const bgColor   = isDone ? '#1D9E75' : isActive ? 'rgba(89,194,237,0.1)' : '#f4f5f7'
  const textColor = isDone ? '#fff'    : isActive ? '#173557' : '#888780'

  const [form, setForm] = useState({ date: ms.occurred_at?.slice(0, 10) ?? '', notes: '', file: null })
  const fileRef = useRef()

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (f) setForm(p => ({ ...p, file: f }))
  }

  const canConfirm = form.date && (form.notes.trim() || form.file)

  const MS_ICONS = { kickoff: '🚀', projeto_tecnico_aprovado: '📋', go_live: '🟢' }
  const icon = MS_ICONS[ms.type] ?? '⭕'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: 80 }}>
      {/* Circle */}
      <div
        className="onb-ms-wrap"
        onClick={() => isDone ? onClose() : isOpen ? onClose() : onOpen(ms.type)}
        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
      >
        <div
          className="onb-ms-ring"
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: bgColor,
            border: `2px solid ${ringColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
            transition: 'box-shadow 0.2s',
            position: 'relative',
          }}
        >
          {isDone
            ? <span style={{ fontSize: 22 }}>✅</span>
            : <span>{icon}</span>
          }
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: isDone ? '#1D9E75' : isActive ? '#173557' : '#888780', margin: 0, lineHeight: 1.3, maxWidth: 80, textAlign: 'center' }}>
            {FASE_LABELS[ms.type]}
          </p>
          {ms.planned_date && (
            <p style={{ fontSize: 10, color: '#aaa9a3', margin: '2px 0 0', textAlign: 'center' }}>
              {isDone ? fmt(ms.occurred_at) : 'Prev. ' + fmt(ms.planned_date)}
            </p>
          )}
        </div>
      </div>

      {/* Confirm panel */}
      {isOpen && !isDone && (
        <div
          className="onb-panel"
          style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 20, marginTop: 8,
            background: '#fff', border: '1px solid rgba(89,194,237,0.35)',
            borderRadius: 10, padding: '14px 16px', width: 280,
            boxShadow: '0 4px 20px rgba(15,34,58,0.12)',
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: '#173557', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Registrar {FASE_LABELS[ms.type]}
          </p>
          <div style={{ marginBottom: 10 }}>
            <label style={label$}>Data de realização *</label>
            <input type="date" style={input$} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={label$}>Justificativa / Link *</label>
            <textarea
              style={{ ...input$, resize: 'vertical', minHeight: 54 }}
              placeholder="Link de evidência ou observação..."
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label$}>Arquivo (opcional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="onb-icon-btn"
                onClick={() => fileRef.current?.click()}
                style={{ fontSize: 12, border: '1px solid #d4d3ce', borderRadius: 6, padding: '5px 10px', color: '#173557' }}
              >
                {form.file ? '📎 ' + form.file.name.slice(0, 20) : '+ Anexar arquivo'}
              </button>
              {form.file && (
                <button className="onb-icon-btn" onClick={() => setForm(p => ({ ...p, file: null }))} style={{ color: '#E24B4A' }}>✕</button>
              )}
              <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={handleFile} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onConfirm({ ms, occurredAt: form.date, justificativa: form.notes, file: form.file })}
              disabled={!canConfirm || saving}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: canConfirm && !saving ? 'pointer' : 'not-allowed',
                background: canConfirm && !saving ? '#173557' : '#d4d3ce', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              {saving ? 'Salvando…' : 'Confirmar'}
            </button>
            <button className="onb-icon-btn" onClick={onClose} style={{ border: '1px solid #d4d3ce', borderRadius: 7, padding: '7px 12px', fontSize: 12 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Undo button for done milestone */}
      {isDone && (
        <button
          className="onb-icon-btn"
          onClick={() => onOpen('reopen_' + ms.type)}
          style={{ fontSize: 10, marginTop: 2, color: '#aaa9a3' }}
          title="Desfazer conclusão"
        >
          ↩ desfazer
        </button>
      )}
    </div>
  )
}

// ── PhaseBox ──────────────────────────────────────────────────────────────────

function PhaseBox({ fase, faseAtual, onAdvance, onRevert, faseIndex, totalFases }) {
  const thisIdx  = faseIdx(fase.fase)
  const curIdx   = faseIdx(faseAtual)
  const isDone   = curIdx > thisIdx
  const isActive = curIdx === thisIdx
  const isLast   = thisIdx === totalFases - 1

  const borderColor = isDone ? '#1D9E75' : isActive ? '#59c2ed' : 'rgba(15,34,58,0.09)'
  const bgColor     = isDone ? 'rgba(29,158,117,0.04)' : isActive ? 'rgba(89,194,237,0.06)' : '#fafaf9'

  return (
    <div style={{
      flex: '1 1 170px', minWidth: 150,
      border: isActive ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
      borderRadius: 12, padding: '12px 14px',
      background: bgColor,
      opacity: (!isDone && !isActive) ? 0.6 : 1,
      transition: 'all 0.2s',
      boxShadow: isActive ? '0 0 0 3px rgba(89,194,237,0.12)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isDone ? '#0f6b4f' : isActive ? '#173557' : '#888780', lineHeight: 1.3 }}>
          {FASE_LABELS[fase.fase]}
        </span>
        {isActive && <span style={{ fontSize: 10, fontWeight: 700, color: '#59c2ed', background: 'rgba(89,194,237,0.12)', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>Ativa</span>}
        {isDone   && <span style={{ fontSize: 10, fontWeight: 700, color: '#1D9E75', background: 'rgba(29,158,117,0.10)', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>Concluída</span>}
        {!isDone && !isActive && <span style={{ fontSize: 10, fontWeight: 600, color: '#aaa9a3', background: '#f0f0ee', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>Pendente</span>}
      </div>
      <p style={{ fontSize: 10, color: '#aaa9a3', margin: '5px 0 0' }}>
        {fase.actual_start ? fmt(fase.actual_start) : (fase.planned_start ? 'Prev. ' + fmt(fase.planned_start) : '—')}
        {' → '}
        {fase.actual_end ? fmt(fase.actual_end) : (fase.planned_end ? 'Prev. ' + fmt(fase.planned_end) : '—')}
      </p>
      {isActive && (
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {!isLast && (
            <button className="onb-adv-btn" onClick={onAdvance} style={{
              fontSize: 11, fontWeight: 600, color: '#59c2ed',
              background: 'rgba(89,194,237,0.10)', border: '1px solid rgba(89,194,237,0.3)',
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Avançar →
            </button>
          )}
          {thisIdx > 0 && (
            <button className="onb-rev-btn" onClick={onRevert} style={{
              fontSize: 11, fontWeight: 500, color: '#888780',
              background: 'rgba(15,34,58,0.04)', border: '1px solid rgba(15,34,58,0.12)',
              borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ← Voltar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── PendenciaItem ─────────────────────────────────────────────────────────────

function PendenciaItem({ pend, onStatusChange, onDelete, loading }) {
  const prio = PRIO_MAP[pend.prioridade] ?? PRIO_MAP.normal
  const resp = pend.resp_contato?.name ?? pend.resp_interno?.name ?? pend.responsavel_grupo ?? '—'

  return (
    <div
      className="onb-pend-row"
      style={{
        display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px 90px',
        gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 8,
        borderLeft: `3px solid ${prio.border}`,
        background: pend.prioridade === 'bloqueadora' ? 'rgba(226,75,74,0.02)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18', margin: 0 }}>{pend.title}</p>
        <p style={{ fontSize: 10, color: '#aaa9a3', margin: '2px 0 0' }}>
          {resp}
          {pend.due_date && <span> · {fmt(pend.due_date)}</span>}
        </p>
      </div>
      <PrioBadge p={pend.prioridade} />
      <StatusPendBadge s={pend.status} />
      <select
        value={pend.status}
        onChange={e => onStatusChange(pend.id, e.target.value)}
        disabled={loading}
        style={{ ...input$, fontSize: 11, padding: '4px 8px', width: 'auto' }}
      >
        {Object.entries(SPEND_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <button className="onb-icon-btn" onClick={() => onDelete(pend.id)} title="Remover" style={{ color: '#E24B4A', justifySelf: 'center' }}>✕</button>
    </div>
  )
}

// ── ActivityRow ───────────────────────────────────────────────────────────────

function ActivityRow({ act, onboardingId, clientId, contacts, profiles, qc, logAction, user }) {
  const [expanded,     setExpanded]    = useState(false)
  const [showNewPend,  setShowNewPend] = useState(false)
  const [newPend,      setNewPend]     = useState({ title: '', prioridade: 'normal', resp_tipo: 'interno', resp_contato_id: '', resp_interno_id: '', responsavel_grupo: 'A definir', due_date: '' })

  const pendencias = act.pendencias ?? []
  const pendCnt = pendencias.filter(p => p.status !== 'encerrada').length

  // Pendência CRUD mutations
  const createPendMut = useMutation({
    mutationFn: async (payload) => {
      const { error, data } = await supabase.from('onboarding_pendencias').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('create_pendencia', 'onboarding_pendencia', data.id, newPend.title, null, { activity_id: act.id })
      toast.success('Pendência adicionada')
      setShowNewPend(false)
      setNewPend({ title: '', prioridade: 'normal', resp_tipo: 'interno', resp_contato_id: '', resp_interno_id: '', responsavel_grupo: 'A definir', due_date: '' })
    },
    onError: (e) => toast.error(e.message),
  })

  const updatePendMut = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('onboarding_pendencias').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] }),
    onError: (e) => toast.error(e.message),
  })

  const deletePendMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('onboarding_pendencias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] }),
    onError: (e) => toast.error(e.message),
  })

  const updateActMut = useMutation({
    mutationFn: async (status) => {
      const { error } = await supabase.from('onboarding_activities').update({ status, completed_at: status === 'concluida' ? new Date().toISOString() : null }).eq('id', act.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] }),
    onError: (e) => toast.error(e.message),
  })

  const deleteActMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('onboarding_activities').delete().eq('id', act.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('delete_activity', 'onboarding_activity', act.id, act.title, { title: act.title }, null)
      toast.success('Atividade removida')
    },
    onError: (e) => toast.error(e.message),
  })

  function submitNewPend() {
    if (!newPend.title.trim()) return
    const payload = {
      onboarding_id: onboardingId,
      activity_id: act.id,
      title: newPend.title.trim(),
      prioridade: newPend.prioridade,
      status: 'criada',
      due_date: newPend.due_date || null,
      responsavel_contato_id: newPend.resp_tipo === 'contato' && newPend.resp_contato_id ? Number(newPend.resp_contato_id) : null,
      responsavel_interno_id: newPend.resp_tipo === 'interno' && newPend.resp_interno_id ? newPend.resp_interno_id : null,
      responsavel_grupo:      (!newPend.resp_contato_id && !newPend.resp_interno_id) ? (newPend.responsavel_grupo || 'A definir') : null,
    }
    createPendMut.mutate(payload)
  }

  const resp = act.resp_interno?.name ?? act.resp_contato?.name ?? '—'
  const sact = SACT_MAP[act.status] ?? SACT_MAP.pendente

  return (
    <div style={{ border: '1px solid rgba(15,34,58,0.09)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* Row header */}
      <div
        className="onb-row-hd"
        style={{ display: 'grid', gridTemplateColumns: '22px 1fr 130px 150px 110px auto', gap: 10, alignItems: 'center', padding: '10px 14px', transition: 'background 0.1s' }}
        onClick={() => setExpanded(v => !v)}
      >
        <StatusActDot s={act.status} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#173557', margin: 0, lineHeight: 1.3 }}>{act.title}</p>
          {act.activity_type && <p style={{ fontSize: 10, color: '#888780', margin: '2px 0 0' }}>{act.activity_type.name}</p>}
        </div>
        <span style={{ fontSize: 11, color: '#888780', textAlign: 'center' }}>
          {FASE_LABELS[act.fase] ?? act.fase}
        </span>
        <span style={{ fontSize: 11, color: '#888780', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {resp}
        </span>
        <span style={{ fontSize: 11, color: act.due_date ? '#173557' : '#aaa9a3', whiteSpace: 'nowrap' }}>
          {act.due_date ? fmt(act.due_date) : '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {pendCnt > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#E24B4A', background: 'rgba(226,75,74,0.1)', padding: '1px 6px', borderRadius: 10 }}>
              {pendCnt}
            </span>
          )}
          <span style={{ color: '#aaa9a3', fontSize: 12, transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="onb-panel" style={{ borderTop: '1px solid rgba(15,34,58,0.07)', padding: '12px 14px', background: '#fafaf9' }}>
          {/* Activity controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#888780' }}>Status:</span>
            {Object.entries(SACT_MAP).map(([k, v]) => (
              <button
                key={k}
                className={'onb-tab' + (act.status === k ? ' active' : '')}
                onClick={e => { e.stopPropagation(); updateActMut.mutate(k) }}
              >
                {v.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button className="onb-icon-btn" onClick={e => { e.stopPropagation(); deleteActMut.mutate() }} title="Remover atividade" style={{ color: '#E24B4A', fontSize: 12 }}>
              🗑 Remover
            </button>
          </div>

          {/* Pendências */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ ...label$, margin: 0 }}>Pendências {pendencias.length > 0 && `(${pendencias.length})`}</p>
              <button
                className="onb-icon-btn"
                onClick={e => { e.stopPropagation(); setShowNewPend(v => !v) }}
                style={{ fontSize: 11, border: '1px solid rgba(15,34,58,0.15)', borderRadius: 6, padding: '3px 8px', color: '#173557' }}
              >
                {showNewPend ? '✕ Cancelar' : '+ Pendência'}
              </button>
            </div>

            {pendencias.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 130px 90px', gap: 8, padding: '2px 12px' }}>
                  {['Título', 'Prioridade', 'Status', 'Alterar status', ''].map((h, i) => (
                    <span key={i} style={{ ...label$, margin: 0 }}>{h}</span>
                  ))}
                </div>
                {pendencias.map(pend => (
                  <PendenciaItem
                    key={pend.id}
                    pend={pend}
                    onStatusChange={(pendId, status) => updatePendMut.mutate({ id: pendId, status })}
                    onDelete={deletePendMut.mutate}
                    loading={updatePendMut.isPending || deletePendMut.isPending}
                  />
                ))}
              </div>
            )}

            {pendencias.length === 0 && !showNewPend && (
              <p style={{ fontSize: 12, color: '#aaa9a3', padding: '8px 12px' }}>Nenhuma pendência.</p>
            )}

            {/* New pendência form */}
            {showNewPend && (
              <div className="onb-panel" onClick={e => e.stopPropagation()} style={{ marginTop: 10, border: '1px solid rgba(89,194,237,0.3)', borderRadius: 8, padding: '12px 14px', background: 'rgba(89,194,237,0.03)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={label$}>Título *</label>
                    <input style={input$} placeholder="Descreva a pendência..." value={newPend.title} onChange={e => setNewPend(p => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div>
                    <label style={label$}>Prioridade</label>
                    <select style={input$} value={newPend.prioridade} onChange={e => setNewPend(p => ({ ...p, prioridade: e.target.value }))}>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="bloqueadora">Bloqueadora</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={label$}>Tipo de resp.</label>
                    <select style={input$} value={newPend.resp_tipo} onChange={e => setNewPend(p => ({ ...p, resp_tipo: e.target.value, resp_contato_id: '', resp_interno_id: '' }))}>
                      <option value="interno">Interno</option>
                      <option value="contato">Cliente</option>
                      <option value="grupo">Grupo</option>
                    </select>
                  </div>
                  <div>
                    <label style={label$}>Responsável</label>
                    {newPend.resp_tipo === 'interno' ? (
                      <select style={input$} value={newPend.resp_interno_id} onChange={e => setNewPend(p => ({ ...p, resp_interno_id: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {(profiles ?? []).filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : newPend.resp_tipo === 'contato' ? (
                      <select style={input$} value={newPend.resp_contato_id} onChange={e => setNewPend(p => ({ ...p, resp_contato_id: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {(contacts ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <input style={input$} placeholder="Nome do grupo..." value={newPend.responsavel_grupo} onChange={e => setNewPend(p => ({ ...p, responsavel_grupo: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label style={label$}>Data limite</label>
                    <input type="date" style={input$} value={newPend.due_date} onChange={e => setNewPend(p => ({ ...p, due_date: e.target.value }))} />
                  </div>
                </div>
                <button
                  onClick={submitNewPend}
                  disabled={!newPend.title.trim() || createPendMut.isPending}
                  style={{
                    padding: '6px 16px', borderRadius: 7, border: 'none',
                    background: newPend.title.trim() ? '#173557' : '#d4d3ce', color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: newPend.title.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  }}
                >
                  {createPendMut.isPending ? 'Salvando…' : 'Adicionar pendência'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingDetailPage() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const qc           = useQueryClient()
  const { user }     = useAuth()
  const { logAction } = useAuditLog()

  const { data: project, isLoading, error } = useProjectDetail(id)
  const onboardingId = project?.onboarding?.id
  const clientId     = project?.client?.id

  const { data: activities = [], isLoading: actsLoading } = useActivities(onboardingId)
  const { data: actTypes   = [] } = useActivityTypes()
  const { data: contacts   = [] } = useContacts(clientId ? { client_id: clientId } : {})
  const { data: profiles   = [] } = useProfiles()

  // UI state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [openMs,        setOpenMs]        = useState(null)  // ms.type or 'reopen_<type>'
  const [msSaving,      setMsSaving]      = useState(false)
  const [showNewAct,    setShowNewAct]    = useState(false)
  const [newAct,        setNewAct]        = useState({ activity_type_id: '', title: '', fase: '', due_date: '', resp_tipo: 'interno', resp_interno_id: '', resp_contato_id: '' })
  const [actTab,        setActTab]        = useState('todas')  // 'todas' | fase key

  // ── Phase advance/revert ───────────────────────────────────────────────────
  const phaseMut = useMutation({
    mutationFn: async (direction) => {
      const onb    = project.onboarding
      const curIdx = faseIdx(onb.fase_atual)
      const newIdx = direction === 'advance' ? curIdx + 1 : curIdx - 1
      const newFase = FASE_ORDER[Math.max(0, Math.min(newIdx, FASE_ORDER.length - 1))]
      const { error } = await supabase.from('onboardings').update({ fase_atual: newFase }).eq('id', onb.id)
      if (error) throw error
      return { oldFase: onb.fase_atual, newFase }
    },
    onSuccess: ({ oldFase, newFase }) => {
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('change_fase', 'onboarding', onboardingId, project.title, { fase: oldFase }, { fase: newFase })
      toast.success(`Fase: ${FASE_LABELS[newFase]}`)
    },
    onError: (e) => toast.error(e.message),
  })

  // ── Milestone confirm ──────────────────────────────────────────────────────
  async function confirmMilestone({ ms, occurredAt, justificativa, file }) {
    setMsSaving(true)
    try {
      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `${clientId}/onboarding/${ms.type}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('activity-attachments').upload(path, file)
        if (upErr) throw upErr
        const { error: evErr } = await supabase.from('onboarding_evidencias').insert({
          milestone_id: ms.id, uploaded_by: user.id, client_id: clientId,
          file_name: file.name, file_size: file.size, file_type: file.type, storage_path: path,
        })
        if (evErr) throw evErr
      }
      const { error } = await supabase
        .from('onboarding_milestones')
        .update({ occurred_at: occurredAt, justificativa: justificativa || null })
        .eq('id', ms.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('confirm_milestone', 'onboarding_milestone', ms.id, FASE_LABELS[ms.type], null, { occurred_at: occurredAt })
      toast.success(`${FASE_LABELS[ms.type]} confirmado!`)
      setOpenMs(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setMsSaving(false)
    }
  }

  // ── Milestone reopen ───────────────────────────────────────────────────────
  const msReopenMut = useMutation({
    mutationFn: async (msId) => {
      const { error } = await supabase.from('onboarding_milestones').update({ occurred_at: null, justificativa: null }).eq('id', msId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      toast.success('Milestone reaberto')
      setOpenMs(null)
    },
    onError: (e) => toast.error(e.message),
  })

  // ── Create activity ────────────────────────────────────────────────────────
  const createActMut = useMutation({
    mutationFn: async () => {
      const typeObj = actTypes.find(t => t.id === Number(newAct.activity_type_id))
      const fase = newAct.fase || project?.onboarding?.fase_atual || 'definicao_escopo'
      const payload = {
        onboarding_id: onboardingId,
        activity_type_id: Number(newAct.activity_type_id),
        title: newAct.title || typeObj?.name || 'Atividade',
        fase,
        status: 'pendente',
        due_date: newAct.due_date || null,
        responsible_contato_id: newAct.resp_tipo === 'contato' && newAct.resp_contato_id ? Number(newAct.resp_contato_id) : null,
        responsible_interno_id: newAct.resp_tipo === 'interno' && newAct.resp_interno_id ? newAct.resp_interno_id : null,
        created_by: user?.id ?? null,
        display_order: activities.length,
      }
      const { data, error } = await supabase.from('onboarding_activities').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('create_activity', 'onboarding_activity', data.id, data.title, null, { onboarding_id: onboardingId })
      toast.success('Atividade adicionada')
      setShowNewAct(false)
      setNewAct({ activity_type_id: '', title: '', fase: '', due_date: '', resp_tipo: 'interno', resp_interno_id: '', resp_contato_id: '' })
    },
    onError: (e) => toast.error(e.message),
  })

  // ── Derived data ───────────────────────────────────────────────────────────
  const onb      = project?.onboarding
  const fases    = (onb?.fases ?? []).sort((a, b) => faseIdx(a.fase) - faseIdx(b.fase))
  const ms       = (onb?.milestones ?? []).reduce((acc, m) => { acc[m.type] = m; return acc }, {})
  const caps     = onb?.capabilities ?? []
  const activeMs = getActiveMs(onb?.milestones ?? [])
  const faseAtual = onb?.fase_atual ?? 'definicao_escopo'

  // Filtered activities by tab
  const filteredActs = actTab === 'todas' ? activities : activities.filter(a => a.fase === actTab)

  // Reopen confirm
  if (openMs?.startsWith('reopen_')) {
    const msType = openMs.replace('reopen_', '')
    const msObj  = ms[msType]
    if (msObj && !msReopenMut.isPending) {
      // Show confirm via toast — handled below in inline confirm
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#888780', fontSize: 14 }}>Carregando...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#E24B4A', fontSize: 14 }}>Projeto não encontrado.</p>
        <button onClick={() => navigate('/projetos')} style={{ color: '#59c2ed', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← Voltar aos projetos</button>
      </div>
    )
  }

  const clientName = project.client?.fantasy_name || project.client?.name || '—'

  return (
    <>
      <style>{PAGE_CSS}</style>
      <div style={{ background: '#f4f5f7', minHeight: '100vh', paddingBottom: 60 }}>

        {/* Breadcrumb */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(15,34,58,0.07)', padding: '10px 32px' }}>
          <span style={{ fontSize: 12, color: '#888780' }}>
            <span onClick={() => navigate('/projetos')} style={{ cursor: 'pointer', color: '#59c2ed' }}>Projetos</span>
            {' / '}
            <span style={{ color: '#173557', fontWeight: 500 }}>{project.title}</span>
          </span>
        </div>

        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 0' }}>

          {/* ── HEADER ────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
            <div>
              <button
                onClick={() => navigate('/projetos')}
                style={{ fontSize: 13, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ← Voltar
              </button>
              <h1 style={{ fontSize: 21, fontWeight: 700, color: '#173557', margin: 0, lineHeight: 1.3 }}>{project.title}</h1>
              <p style={{ fontSize: 14, color: '#59c2ed', fontWeight: 500, margin: '4px 0 10px' }}>
                {clientName}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#185FA5', background: 'rgba(24,95,165,0.10)', padding: '3px 10px', borderRadius: 20 }}>
                  {FASE_LABELS[project.type] ?? project.type}
                </span>
                {onb && <SituacaoBadge situacao={onb.situacao_geral} />}
                {onb?.csm && (
                  <span style={{ fontSize: 11, color: '#888780', background: '#f4f5f7', padding: '3px 10px', borderRadius: 20 }}>
                    CSM: {onb.csm.name}
                  </span>
                )}
                {project.start_date && (
                  <span style={{ fontSize: 11, color: '#888780' }}>{fmt(project.start_date)} → {fmt(project.end_date)}</span>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0, paddingTop: 24 }}>
              <button
                onClick={() => setEditModalOpen(true)}
                style={{
                  fontSize: 13, fontWeight: 500, color: '#173557',
                  background: '#fff', border: '1px solid rgba(15,34,58,0.15)',
                  borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ✏ Editar projeto
              </button>
            </div>
          </div>

          {/* ── LINHA DO TEMPO ─────────────────────────────────────────────── */}
          {onb && (
            <div style={{ ...card$, marginBottom: 18, overflowX: 'auto' }}>
              <p style={secTitle$}>Linha do Tempo</p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minWidth: 700, paddingBottom: 8 }}>

                {/* Kickoff */}
                <MilestoneNode
                  ms={ms.kickoff ?? { id: null, type: 'kickoff', occurred_at: null, planned_date: null }}
                  isActive={activeMs === 'kickoff'}
                  openMs={openMs}
                  onOpen={setOpenMs}
                  onClose={() => setOpenMs(null)}
                  onConfirm={confirmMilestone}
                  saving={msSaving}
                  clientId={clientId}
                />

                <Connector done={!!ms.kickoff?.occurred_at} active={activeMs === 'kickoff' && !!ms.kickoff?.occurred_at} />

                {/* Fase 1 */}
                {fases[0] && (
                  <PhaseBox
                    fase={fases[0]}
                    faseAtual={faseAtual}
                    onAdvance={() => phaseMut.mutate('advance')}
                    onRevert={() => phaseMut.mutate('revert')}
                    faseIndex={0}
                    totalFases={3}
                  />
                )}

                <Connector done={faseIdx(faseAtual) > 0} active={faseAtual === 'preparacao_plataforma'} />

                {/* Projeto Técnico */}
                <MilestoneNode
                  ms={ms.projeto_tecnico_aprovado ?? { id: null, type: 'projeto_tecnico_aprovado', occurred_at: null, planned_date: null }}
                  isActive={activeMs === 'projeto_tecnico_aprovado'}
                  openMs={openMs}
                  onOpen={setOpenMs}
                  onClose={() => setOpenMs(null)}
                  onConfirm={confirmMilestone}
                  saving={msSaving}
                  clientId={clientId}
                />

                <Connector done={!!ms.projeto_tecnico_aprovado?.occurred_at} active={activeMs === 'projeto_tecnico_aprovado'} />

                {/* Fase 2 */}
                {fases[1] && (
                  <PhaseBox
                    fase={fases[1]}
                    faseAtual={faseAtual}
                    onAdvance={() => phaseMut.mutate('advance')}
                    onRevert={() => phaseMut.mutate('revert')}
                    faseIndex={1}
                    totalFases={3}
                  />
                )}

                <Connector done={faseIdx(faseAtual) > 1} active={faseAtual === 'treinamento'} />

                {/* Fase 3 */}
                {fases[2] && (
                  <PhaseBox
                    fase={fases[2]}
                    faseAtual={faseAtual}
                    onAdvance={() => phaseMut.mutate('advance')}
                    onRevert={() => phaseMut.mutate('revert')}
                    faseIndex={2}
                    totalFases={3}
                  />
                )}

                <Connector done={faseIdx(faseAtual) > 2} active={faseAtual === 'encerrado'} />

                {/* Go-Live */}
                <MilestoneNode
                  ms={ms.go_live ?? { id: null, type: 'go_live', occurred_at: null, planned_date: null }}
                  isActive={activeMs === 'go_live'}
                  openMs={openMs}
                  onOpen={setOpenMs}
                  onClose={() => setOpenMs(null)}
                  onConfirm={confirmMilestone}
                  saving={msSaving}
                  clientId={clientId}
                />
              </div>

              {/* Reopen confirm overlay */}
              {openMs?.startsWith('reopen_') && (() => {
                const msType = openMs.replace('reopen_', '')
                const msObj  = ms[msType]
                return msObj ? (
                  <div className="onb-panel" style={{ marginTop: 12, border: '1px solid rgba(226,75,74,0.25)', borderRadius: 8, padding: '12px 16px', background: 'rgba(226,75,74,0.03)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <p style={{ fontSize: 13, color: '#173557', margin: 0 }}>
                      Desfazer conclusão de <strong>{FASE_LABELS[msType]}</strong>?
                    </p>
                    <button
                      onClick={() => msReopenMut.mutate(msObj.id)}
                      disabled={msReopenMut.isPending}
                      style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#E24B4A', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {msReopenMut.isPending ? 'Aguarde…' : 'Confirmar'}
                    </button>
                    <button className="onb-icon-btn" onClick={() => setOpenMs(null)} style={{ border: '1px solid #d4d3ce', borderRadius: 6, padding: '5px 12px', fontSize: 12 }}>
                      Cancelar
                    </button>
                  </div>
                ) : null
              })()}
            </div>
          )}

          {/* ── CAPACIDADES ────────────────────────────────────────────────── */}
          {caps.length > 0 && (
            <div style={{ ...card$, marginBottom: 18 }}>
              <p style={secTitle$}>Capacidades Contratadas</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {caps.map((cap, i) => {
                  const item = cap.catalog_item
                  if (!item) return null
                  const c = CAP_COLORS[i % CAP_COLORS.length]
                  return (
                    <span key={cap.id} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.color}28` }}>
                      {item.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ATIVIDADES ─────────────────────────────────────────────────── */}
          <div style={{ ...card$, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <p style={{ ...secTitle$, margin: 0 }}>
                Atividades
                {activities.length > 0 && <span style={{ fontWeight: 400, color: '#888780', marginLeft: 6 }}>({activities.length})</span>}
              </p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Phase filter tabs */}
                {['todas', 'definicao_escopo', 'preparacao_plataforma', 'treinamento'].map(tab => (
                  <button
                    key={tab}
                    className={'onb-tab' + (actTab === tab ? ' active' : '')}
                    onClick={() => setActTab(tab)}
                  >
                    {tab === 'todas' ? 'Todas' : FASE_LABELS[tab]}
                  </button>
                ))}
                <button
                  onClick={() => setShowNewAct(v => !v)}
                  style={{
                    fontSize: 12, fontWeight: 600, color: '#173557',
                    background: 'rgba(23,53,87,0.07)', border: '1px solid rgba(23,53,87,0.15)',
                    borderRadius: 7, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {showNewAct ? '✕ Cancelar' : '+ Atividade'}
                </button>
              </div>
            </div>

            {/* New activity form */}
            {showNewAct && (
              <div className="onb-panel" style={{ border: '1px solid rgba(89,194,237,0.3)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, background: 'rgba(89,194,237,0.03)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={label$}>Tipo de atividade *</label>
                    <select
                      style={input$}
                      value={newAct.activity_type_id}
                      onChange={e => {
                        const t = actTypes.find(t => t.id === Number(e.target.value))
                        setNewAct(p => ({ ...p, activity_type_id: e.target.value, title: t?.name ?? '' }))
                      }}
                    >
                      <option value="">Selecione...</option>
                      {actTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label$}>Título (customizável)</label>
                    <input style={input$} placeholder="Título da atividade" value={newAct.title} onChange={e => setNewAct(p => ({ ...p, title: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={label$}>Fase</label>
                    <select style={input$} value={newAct.fase || faseAtual} onChange={e => setNewAct(p => ({ ...p, fase: e.target.value }))}>
                      {['definicao_escopo', 'preparacao_plataforma', 'treinamento'].map(f => (
                        <option key={f} value={f}>{FASE_LABELS[f]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={label$}>Tipo resp.</label>
                    <select style={input$} value={newAct.resp_tipo} onChange={e => setNewAct(p => ({ ...p, resp_tipo: e.target.value, resp_interno_id: '', resp_contato_id: '' }))}>
                      <option value="interno">Interno</option>
                      <option value="contato">Cliente</option>
                    </select>
                  </div>
                  <div>
                    <label style={label$}>Responsável</label>
                    {newAct.resp_tipo === 'interno' ? (
                      <select style={input$} value={newAct.resp_interno_id} onChange={e => setNewAct(p => ({ ...p, resp_interno_id: e.target.value }))}>
                        <option value="">—</option>
                        {profiles.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <select style={input$} value={newAct.resp_contato_id} onChange={e => setNewAct(p => ({ ...p, resp_contato_id: e.target.value }))}>
                        <option value="">—</option>
                        {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label style={label$}>Data limite</label>
                    <input type="date" style={input$} value={newAct.due_date} onChange={e => setNewAct(p => ({ ...p, due_date: e.target.value }))} />
                  </div>
                </div>
                <button
                  onClick={() => createActMut.mutate()}
                  disabled={!newAct.activity_type_id || createActMut.isPending}
                  style={{
                    padding: '7px 20px', borderRadius: 7, border: 'none',
                    background: newAct.activity_type_id ? '#173557' : '#d4d3ce',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: newAct.activity_type_id ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  }}
                >
                  {createActMut.isPending ? 'Salvando…' : 'Adicionar atividade'}
                </button>
              </div>
            )}

            {/* Activities list */}
            {actsLoading ? (
              <p style={{ fontSize: 13, color: '#888780', padding: '16px 0' }}>Carregando atividades...</p>
            ) : filteredActs.length === 0 ? (
              <p style={{ fontSize: 13, color: '#aaa9a3', textAlign: 'center', padding: '24px 0' }}>
                {activities.length === 0 ? 'Nenhuma atividade cadastrada.' : 'Nenhuma atividade nesta fase.'}
              </p>
            ) : (
              <>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 130px 150px 110px auto', gap: 10, padding: '4px 14px', marginBottom: 4 }}>
                  {['', 'Atividade', 'Fase', 'Responsável', 'Prazo', ''].map((h, i) => (
                    <span key={i} style={{ ...label$, margin: 0 }}>{h}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredActs.map(act => (
                    <ActivityRow
                      key={act.id}
                      act={act}
                      onboardingId={onboardingId}
                      clientId={clientId}
                      contacts={contacts}
                      profiles={profiles}
                      qc={qc}
                      logAction={logAction}
                      user={user}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Project edit modal */}
      {editModalOpen && (
        <ProjectModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          clientId={clientId}
          project={project}
        />
      )}
    </>
  )
}
