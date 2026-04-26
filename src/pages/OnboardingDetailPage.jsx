import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useAuditLog } from '../hooks/useAuditLog'
import { useContacts } from '../hooks/useContacts'
import { useProfiles } from '../hooks/useProfiles'
import { useOnboarding } from '../hooks/useOnboardings'
import { FASE_LABELS } from '../lib/onboardingLabels'
import { ProjectModal } from '../components/projects/ProjectModal'

// ── CSS (extraído do protótipo HTML aprovado) ─────────────────────────────────
const PAGE_CSS = `
  /* timeline */
  .onb-timeline-wrap { overflow-x: auto; padding: 6px 4px 4px; margin: 0 -4px; }
  .onb-timeline { display: flex; align-items: stretch; min-width: max-content; gap: 0; }

  /* milestone */
  .onb-ms { display:flex; flex-direction:column; align-items:center; width:130px; flex:0 0 130px; padding-top:14px; cursor:pointer; user-select:none; }
  .onb-ms-circle {
    width:56px; height:56px; border-radius:50%;
    background:#fff; border:2px solid rgba(15,34,58,0.18);
    display:grid; place-items:center; color:rgba(23,53,87,0.6);
    transition:all 0.18s ease; position:relative;
  }
  .onb-ms-circle svg { width:22px; height:22px; }
  .onb-ms.done .onb-ms-circle { background:#e7f6ee; border-color:#1aa56a; color:#157a47; }
  .onb-ms.done .onb-ms-circle::after {
    content:""; position:absolute; bottom:-3px; right:-3px;
    width:18px; height:18px; border-radius:50%;
    background:#1aa56a url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='3.5 8.5 6.5 11.5 12.5 4.5'/></svg>") no-repeat center / 14px;
    border:2px solid #fff;
  }
  .onb-ms.future .onb-ms-circle { color:rgba(23,53,87,0.35); border-color:rgba(15,34,58,0.12); }
  .onb-ms.active .onb-ms-circle { background:#fff; border-color:#59c2ed; color:#173557; box-shadow:0 0 0 4px rgba(89,194,237,0.18); }
  .onb-ms:hover .onb-ms-circle { box-shadow:0 0 0 5px rgba(89,194,237,0.18); }
  .onb-ms-label { font-size:12px; font-weight:600; margin-top:10px; color:#173557; text-align:center; }
  .onb-ms-date  { font-size:11px; color:rgba(23,53,87,0.55); margin-top:2px; text-align:center; }
  .onb-ms-status { margin-top:6px; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(23,53,87,0.5); font-weight:600; }
  .onb-ms.done .onb-ms-status { color:#157a47; }
  .onb-ms.active .onb-ms-status { color:#0a6a96; }

  /* phase box */
  .onb-phase { flex:1 1 230px; min-width:230px; background:#fff; border:1px solid rgba(15,34,58,0.10); border-radius:12px; padding:12px 14px 10px; margin:14px 0; display:flex; flex-direction:column; transition:all 0.18s ease; }
  .onb-phase.active { border-color:#59c2ed; box-shadow:0 0 0 3px rgba(89,194,237,0.18),0 6px 18px -10px rgba(89,194,237,0.4); background:linear-gradient(180deg,#fff,#f4fbfe); }
  .onb-phase.done { background:#f6fbf8; border-color:rgba(34,160,98,0.32); }
  .onb-phase.future { opacity:0.55; }
  .onb-phase-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; }
  .onb-phase-name { font-size:13px; font-weight:600; }
  .onb-phase-meta { font-size:11px; color:rgba(23,53,87,0.55); margin-top:2px; }
  .onb-phase-bottom { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:8px; }
  .onb-phase-mini { background:transparent; border:none; padding:3px 6px; font-size:11px; color:rgba(23,53,87,0.6); border-radius:5px; cursor:pointer; font-family:inherit; }
  .onb-phase-mini:hover { background:rgba(23,53,87,0.06); color:#173557; }
  .onb-phase-mini:disabled { color:rgba(23,53,87,0.25); cursor:not-allowed; }
  .onb-phase-mini.fwd { color:#0a6a96; font-weight:500; }
  .onb-phase-mini.fwd:hover { background:rgba(89,194,237,0.12); }

  /* connector */
  .onb-conn { flex:0 0 28px; align-self:center; height:2px; background:rgba(15,34,58,0.12); margin-top:32px; }
  .onb-conn.done { background:#1aa56a; }
  .onb-conn.active { background:linear-gradient(90deg,#1aa56a,#59c2ed); }

  /* milestone panel */
  .onb-ms-panel { margin-top:14px; background:#f9fafb; border:1px solid rgba(15,34,58,0.10); border-radius:12px; padding:16px 18px; animation:onb-slide 0.18s ease; }
  @keyframes onb-slide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
  .onb-ms-panel-grid { display:grid; grid-template-columns:200px 1fr; gap:12px; margin-bottom:12px; }
  .onb-ms-panel-grid.full { grid-template-columns:1fr; }
  .onb-ms-panel-actions { display:flex; gap:8px; justify-content:flex-end; }

  /* activity */
  .onb-act-item { background:#fff; border:1px solid rgba(15,34,58,0.09); border-radius:10px; transition:border-color 0.15s,box-shadow 0.15s; }
  .onb-act-item:hover { border-color:rgba(15,34,58,0.16); }
  .onb-act-item.expanded { border-color:rgba(89,194,237,0.5); box-shadow:0 4px 14px -8px rgba(89,194,237,0.4); }
  .onb-act-row { display:grid; grid-template-columns:22px 1fr 130px 160px 110px auto; align-items:center; gap:12px; padding:12px 14px; cursor:pointer; }
  .onb-act-row:hover { background:rgba(15,34,58,0.012); border-radius:10px 10px 0 0; }
  .onb-act-caret { width:20px; height:20px; display:grid; place-items:center; color:rgba(23,53,87,0.4); transition:transform 0.18s; }
  .onb-act-item.expanded .onb-act-caret { transform:rotate(90deg); color:#173557; }
  .onb-act-body { border-top:1px solid rgba(15,34,58,0.08); padding:14px 18px 16px; background:#fbfbfc; border-radius:0 0 10px 10px; }

  /* pending */
  .onb-pend-item { background:#fff; border:1px solid rgba(15,34,58,0.08); border-left:3px solid rgba(15,34,58,0.18); border-radius:8px; padding:9px 12px; display:grid; grid-template-columns:1fr 110px 100px 130px 100px; align-items:center; gap:10px; font-size:12px; }
  .onb-pend-item.blocker { border-left-color:#c44; background:linear-gradient(90deg,rgba(196,60,60,0.04),#fff 18%); }
  .onb-pend-item.high { border-left-color:#d99020; }
  .onb-pend-empty { text-align:center; padding:14px; font-size:12px; color:rgba(23,53,87,0.5); background:#fff; border:1px dashed rgba(15,34,58,0.14); border-radius:8px; }

  /* new pending form */
  .onb-pend-form { background:#fff; border:1px solid rgba(89,194,237,0.4); border-radius:10px; padding:14px 16px; margin-top:8px; box-shadow:0 4px 14px -8px rgba(89,194,237,0.4); animation:onb-slide 0.18s ease; }
  .onb-pf-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 14px; }
  .onb-pf-grid .full { grid-column:1/-1; }
  .onb-pf-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }

  /* resp picker */
  .onb-resp-picker { border:1px solid #d4d3ce; border-radius:7px; padding:6px; max-height:150px; overflow-y:auto; background:#fff; }
  .onb-resp-sec { font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(23,53,87,0.5); font-weight:600; padding:5px 8px 3px; }
  .onb-resp-opt { padding:5px 8px; border-radius:5px; font-size:12px; color:#173557; cursor:pointer; display:flex; align-items:center; gap:8px; }
  .onb-resp-opt:hover { background:#f4f5f7; }
  .onb-resp-opt.selected { background:rgba(89,194,237,0.12); color:#0a6a96; font-weight:500; }
  .onb-mini-avatar { width:20px; height:20px; border-radius:50%; display:grid; place-items:center; font-size:10px; font-weight:600; flex-shrink:0; }
  .onb-mini-avatar.client { background:rgba(89,194,237,0.22); color:#0a6a96; }
  .onb-mini-avatar.team   { background:rgba(211,218,71,0.4); color:#5a6010; }

  /* segmented priority */
  .onb-segmented { display:inline-flex; background:#f4f5f7; border-radius:9px; padding:3px; gap:2px; }
  .onb-segmented button { background:transparent; border:none; padding:6px 12px; font-size:12px; font-weight:500; color:rgba(23,53,87,0.65); border-radius:7px; cursor:pointer; font-family:inherit; }
  .onb-segmented button.on { background:#fff; color:#173557; box-shadow:0 1px 2px rgba(15,34,58,0.08); }
  .onb-segmented button[data-v="bloqueadora"].on { color:#a02020; }
  .onb-segmented button[data-v="alta"].on { color:#875111; }

  /* catalog search */
  .onb-cat-wrap { position:relative; margin-bottom:12px; }
  .onb-cat-input { width:100%; padding:9px 14px 9px 36px; background:#fff; border:1px solid #d4d3ce; border-radius:8px; font-size:13px; font-family:inherit; color:#173557; outline:none; }
  .onb-cat-input:focus { border-color:#59c2ed; box-shadow:0 0 0 3px rgba(89,194,237,0.18); }
  .onb-cat-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:rgba(23,53,87,0.4); pointer-events:none; }
  .onb-cat-dd { position:absolute; top:calc(100% + 4px); left:0; right:0; background:#fff; border:1px solid rgba(15,34,58,0.12); border-radius:10px; box-shadow:0 12px 28px rgba(10,22,40,0.12); padding:4px; z-index:10; max-height:260px; overflow-y:auto; }
  .onb-cat-item { padding:8px 10px; border-radius:6px; font-size:13px; color:#173557; display:flex; align-items:center; justify-content:space-between; cursor:pointer; }
  .onb-cat-item:hover { background:#f4f5f7; }
  .onb-cat-empty { padding:10px; font-size:12px; color:rgba(23,53,87,0.55); text-align:center; }

  /* tags */
  .onb-tag { font-size:11px; padding:3px 9px; border-radius:999px; font-weight:500; display:inline-flex; align-items:center; gap:5px; line-height:1.5; white-space:nowrap; }
  .onb-tag.sky    { background:rgba(89,194,237,0.14); color:#0a6a96; }
  .onb-tag.lime   { background:rgba(211,218,71,0.25); color:#5a6010; }
  .onb-tag.green  { background:rgba(34,160,98,0.14); color:#157a47; }
  .onb-tag.amber  { background:rgba(217,140,30,0.16); color:#875111; }
  .onb-tag.red    { background:rgba(196,60,60,0.14); color:#a02020; }
  .onb-tag.gray   { background:rgba(23,53,87,0.06); color:rgba(23,53,87,0.65); }
  .onb-tag .live-dot { width:6px; height:6px; border-radius:50%; background:#1aa56a; box-shadow:0 0 0 3px rgba(26,165,106,0.18); }

  /* capabilities */
  .onb-cap-chip { font-size:12px; font-weight:500; padding:5px 11px; border-radius:999px; display:inline-flex; align-items:center; gap:6px; }
  .onb-cap-chip::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }

  /* buttons */
  .onb-btn-primary { background:#173557; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; }
  .onb-btn-primary:hover { background:#1f4575; }
  .onb-btn-primary.sm { padding:6px 12px; font-size:12px; }
  .onb-btn-primary:disabled { background:#aaa9a3; cursor:not-allowed; }
  .onb-btn-sec { background:#fff; color:#173557; border:1px solid rgba(15,34,58,0.14); border-radius:8px; padding:9px 16px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; }
  .onb-btn-sec:hover { background:#f4f5f7; }
  .onb-btn-sec.sm { padding:6px 12px; font-size:12px; }
  .onb-btn-link { background:transparent; border:none; padding:0; color:#0a6a96; font-size:12px; font-weight:500; cursor:pointer; font-family:inherit; }
  .onb-btn-link:hover { text-decoration:underline; }
  .onb-icon-btn { background:transparent; border:none; width:28px; height:28px; border-radius:6px; display:grid; place-items:center; color:rgba(23,53,87,0.55); cursor:pointer; }
  .onb-icon-btn:hover { background:rgba(23,53,87,0.06); color:#173557; }
  .onb-icon-btn.danger:hover { background:rgba(196,60,60,0.08); color:#b42828; }
  .onb-back-btn { background:transparent; border:none; padding:0; color:rgba(23,53,87,0.7); font-size:12px; font-weight:500; cursor:pointer; font-family:inherit; margin-bottom:8px; }
  .onb-back-btn:hover { color:#173557; }

  /* inputs */
  .onb-input, .onb-select, .onb-textarea {
    width:100%; border:1px solid #d4d3ce; border-radius:7px; padding:8px 12px;
    font-size:13px; font-family:inherit; color:#173557; background:#fff;
    outline:none; transition:border-color 0.15s, box-shadow 0.15s; box-sizing:border-box;
  }
  .onb-input:focus, .onb-select:focus, .onb-textarea:focus { border-color:#59c2ed; box-shadow:0 0 0 3px rgba(89,194,237,0.18); }
  .onb-textarea { resize:vertical; min-height:64px; }
  .onb-lbl { display:block; font-size:11px; font-weight:600; color:rgba(23,53,87,0.65); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.05em; }

  /* act status select */
  .onb-act-status-sel { padding:4px 8px; font-size:11px; border-radius:6px; border:1px solid rgba(15,34,58,0.12); background:#fff; color:#173557; font-family:inherit; width:100%; outline:none; }
  .onb-act-status-sel:focus { border-color:#59c2ed; }
`

// ── Constants ─────────────────────────────────────────────────────────────────
const FASE_ORDER = ['definicao_escopo', 'preparacao_plataforma', 'treinamento', 'encerrado']
const MS_ORDER   = ['kickoff', 'projeto_tecnico_aprovado', 'go_live']

// milestone icon SVGs (faithfully from the HTML prototype)
const MS_ICON_KICKOFF = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3v18"/>
    <path d="M5 4h12l-2 4 2 4H5"/>
  </svg>
)
const MS_ICON_TECH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6"/>
    <path d="M9 14l2 2 4-4"/>
  </svg>
)
const MS_ICON_GOLIVE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16l3-7 5 4 6-9"/>
    <path d="M14 4h5v5"/>
  </svg>
)
const MS_ICONS = { kickoff: MS_ICON_KICKOFF, projeto_tecnico_aprovado: MS_ICON_TECH, go_live: MS_ICON_GOLIVE }

// cap chip colors (rotating palette for catalog items)
const CAP_PALETTE = [
  { cls: 'onb-cap-chip', style: { background: 'rgba(89,194,237,0.18)', color: '#0a6a96' } },
  { cls: 'onb-cap-chip', style: { background: 'rgba(132,93,212,0.16)', color: '#5a3fa5' } },
  { cls: 'onb-cap-chip', style: { background: 'rgba(34,160,98,0.16)',  color: '#157a47' } },
  { cls: 'onb-cap-chip', style: { background: 'rgba(23,53,87,0.10)',   color: '#173557' } },
  { cls: 'onb-cap-chip', style: { background: 'rgba(217,140,30,0.16)', color: '#875111' } },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}
function faseIdx(fase) { return FASE_ORDER.indexOf(fase ?? 'definicao_escopo') }
function getActiveMs(milestones) {
  for (const key of MS_ORDER) {
    const ms = milestones?.find(m => m.type === key)
    if (ms && !ms.occurred_at) return key
  }
  return null
}
function initials(name = '') {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
}

// ── Data hooks ────────────────────────────────────────────────────────────────
function useProjectDetail(projectId) {
  return useQuery({
    queryKey: ['project_detail', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      console.log('[OnboardingDetailPage] route project id:', projectId)
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          client:clients(id, name, fantasy_name)
        `)
        .eq('id', projectId)
        .single()
      if (error) throw error
      console.log('[OnboardingDetailPage] project fetched:', { id: data.id, onboarding_id: data.onboarding_id })
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

// ── MilestoneEl ───────────────────────────────────────────────────────────────
function MilestoneEl({ ms, activeMsType, openMsId, onToggle }) {
  const isDone    = !!ms.occurred_at
  const isActive  = !isDone && activeMsType === ms.type
  const stateClass = isDone ? 'done' : isActive ? 'active' : 'future'

  const statusLabel = isDone
    ? 'Concluído'
    : isActive ? 'Pendente' : 'Pendente'

  return (
    <div className={`onb-ms ${stateClass}`} onClick={() => onToggle(ms.type)}>
      <div className="onb-ms-circle">{MS_ICONS[ms.type]}</div>
      <div className="onb-ms-label">{FASE_LABELS[ms.type]}</div>
      <div className="onb-ms-date">
        {isDone ? fmt(ms.occurred_at) : (ms.planned_date ? 'Prev. ' + fmt(ms.planned_date) : '—')}
      </div>
      <div className="onb-ms-status">{statusLabel}</div>
    </div>
  )
}

// ── Connector ─────────────────────────────────────────────────────────────────
function Connector({ leftDone, rightActive }) {
  const cls = leftDone && rightActive ? 'active' : leftDone ? 'done' : ''
  return <div className={`onb-conn ${cls}`} />
}

// ── PhaseEl ───────────────────────────────────────────────────────────────────
function PhaseEl({ fase, faseAtual, onAdvance, onRevert, isLastPhase }) {
  const thisIdx  = faseIdx(fase.fase)
  const curIdx   = faseIdx(faseAtual)
  const isDone   = curIdx > thisIdx
  const isActive = curIdx === thisIdx
  const stateClass = isDone ? 'done' : isActive ? 'active' : 'future'

  const start = fase.actual_start ?? fase.planned_start
  const end   = fase.actual_end   ?? fase.planned_end
  const dateLabel = (start || end) ? `${start ? fmt(start) : '—'} → ${end ? fmt(end) : '—'}` : '—'

  return (
    <div className={`onb-phase ${stateClass}`}>
      <div className="onb-phase-head">
        <div className="onb-phase-name">{FASE_LABELS[fase.fase]}</div>
        {isActive && <span className="onb-tag sky" style={{ fontSize: 10, padding: '2px 7px' }}>Ativa</span>}
        {isDone   && <span className="onb-tag green" style={{ fontSize: 10, padding: '2px 7px' }}>Concluída</span>}
        {!isDone && !isActive && <span className="onb-tag gray" style={{ fontSize: 10, padding: '2px 7px' }}>Pendente</span>}
      </div>
      <div className="onb-phase-meta">{dateLabel}</div>
      <div className="onb-phase-bottom">
        <button
          className="onb-phase-mini"
          disabled={!isActive || thisIdx === 0}
          onClick={e => { e.stopPropagation(); onRevert() }}
        >
          ← Voltar
        </button>
        <button
          className="onb-phase-mini fwd"
          disabled={!isActive || isLastPhase}
          onClick={e => { e.stopPropagation(); onAdvance() }}
        >
          Avançar →
        </button>
      </div>
    </div>
  )
}

// ── MilestonePanel ────────────────────────────────────────────────────────────
function MilestonePanel({ ms, onClose, onConfirm, onReopen, saving }) {
  const isDone = !!ms.occurred_at
  const fileRef = useRef()
  const [form, setForm] = useState({
    date:  ms.occurred_at?.slice(0, 10) ?? '',
    link:  '',
    notes: '',
    file:  null,
  })

  const canConfirm = form.date && (form.notes.trim() || form.link.trim() || form.file)

  return (
    <div className="onb-ms-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {isDone ? 'Marco concluído' : 'Registrar conclusão'} — {FASE_LABELS[ms.type]}
        </div>
        <button className="onb-icon-btn" onClick={onClose} title="Fechar">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>

      <div className="onb-ms-panel-grid">
        <div>
          <label className="onb-lbl">Data de realização</label>
          <input type="date" className="onb-input" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div>
          <label className="onb-lbl">Evidência (link ou documento)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="url" className="onb-input"
              placeholder="https://… ou /docs/arquivo.pdf"
              value={form.link}
              onChange={e => setForm(p => ({ ...p, link: e.target.value }))}
              style={{ flex: 1 }}
            />
            <button
              className="onb-icon-btn"
              onClick={() => fileRef.current?.click()}
              title={form.file ? form.file.name : 'Anexar arquivo'}
              style={{ flexShrink: 0, border: '1px solid #d4d3ce', width: 'auto', padding: '4px 8px', borderRadius: 6, fontSize: 11, color: '#173557', whiteSpace: 'nowrap' }}
            >
              {form.file ? '📎 ' + form.file.name.slice(0, 14) : '+ Arquivo'}
            </button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setForm(p => ({ ...p, file: e.target.files?.[0] ?? null }))} />
          </div>
        </div>
      </div>

      <div className="onb-ms-panel-grid full">
        <div>
          <label className="onb-lbl">Justificativa / observações</label>
          <textarea
            className="onb-textarea"
            placeholder="Ex.: reunião realizada com presença de toda equipe operacional…"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </div>

      <div className="onb-ms-panel-actions">
        <button className="onb-btn-sec sm" onClick={onClose}>Cancelar</button>
        {isDone ? (
          <button className="onb-btn-sec sm" onClick={onReopen} disabled={saving}>
            {saving ? 'Aguarde…' : 'Reabrir marco'}
          </button>
        ) : (
          <button
            className="onb-btn-primary sm"
            disabled={!canConfirm || saving}
            onClick={() => onConfirm({ ms, occurredAt: form.date, justificativa: form.notes || form.link || null, file: form.file })}
          >
            {saving ? 'Salvando…' : 'Confirmar conclusão'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── PendingItem ───────────────────────────────────────────────────────────────
function PendingItem({ pend }) {
  const prioMap = {
    bloqueadora: { tag: 'red',   label: 'Bloqueadora', cls: 'blocker' },
    alta:        { tag: 'amber', label: 'Alta',        cls: 'high'    },
    normal:      { tag: 'gray',  label: 'Normal',      cls: ''        },
  }
  const statusMap = {
    criada:               { tag: 'gray',  label: 'Criada'               },
    em_andamento:         { tag: 'sky',   label: 'Em Andamento'         },
    aguardando_validacao: { tag: 'amber', label: 'Ag. Validação'        },
    encerrada:            { tag: 'green', label: 'Encerrada'            },
  }
  const prio   = prioMap[pend.prioridade]   ?? prioMap.normal
  const status = statusMap[pend.status]     ?? statusMap.criada
  const resp   = pend.resp_contato?.name ?? pend.resp_interno?.name ?? pend.responsavel_grupo ?? '—'

  return (
    <div className={`onb-pend-item ${prio.cls}`}>
      <div style={{ fontWeight: 500, color: '#173557', fontSize: 12 }}>{pend.title}</div>
      <span className={`onb-tag ${prio.tag}`}>{prio.label}</span>
      <span className={`onb-tag ${status.tag}`}>{status.label}</span>
      <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resp}</div>
      <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.55)' }}>{fmt(pend.due_date)}</div>
    </div>
  )
}

// ── PendForm ─────────────────────────────────────────────────────────────────
function PendForm({ actId, contacts, profiles, onSave, onCancel, saving }) {
  const [draft, setDraft] = useState({ title: '', desc: '', priority: 'normal', due: '', respId: null, respKind: null, respName: null })

  function pickResp(id, kind, name) {
    setDraft(p => ({ ...p, respId: id, respKind: kind, respName: name }))
  }

  function handleSave() {
    if (!draft.title.trim()) { toast.error('Informe um título'); return }
    onSave(draft)
  }

  return (
    <div className="onb-pend-form">
      <div className="onb-pf-grid">
        <div className="full">
          <label className="onb-lbl">Título da pendência *</label>
          <input className="onb-input" placeholder="Ex.: Receber lista de lojas com horários" value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div className="full">
          <label className="onb-lbl">Descrição (opcional)</label>
          <textarea className="onb-textarea" placeholder="Detalhes, contexto, links…" value={draft.desc} onChange={e => setDraft(p => ({ ...p, desc: e.target.value }))} />
        </div>
        <div>
          <label className="onb-lbl">Prioridade</label>
          <div className="onb-segmented onb-segmented-prio">
            {[['bloqueadora', 'Bloqueadora'], ['alta', 'Alta'], ['normal', 'Normal']].map(([v, lbl]) => (
              <button key={v} data-v={v} className={draft.priority === v ? 'on' : ''} onClick={() => setDraft(p => ({ ...p, priority: v }))}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="onb-lbl">Data limite</label>
          <input type="date" className="onb-input" value={draft.due} onChange={e => setDraft(p => ({ ...p, due: e.target.value }))} />
        </div>
        <div className="full">
          <label className="onb-lbl">Responsável</label>
          <div className="onb-resp-picker">
            {contacts.length > 0 && (
              <>
                <div className="onb-resp-sec">Contatos do cliente</div>
                {contacts.map(c => (
                  <div
                    key={c.id}
                    className={`onb-resp-opt${draft.respId === c.id && draft.respKind === 'contato' ? ' selected' : ''}`}
                    onClick={() => pickResp(c.id, 'contato', c.name)}
                  >
                    <span className="onb-mini-avatar client">{initials(c.name)}</span>
                    <span>{c.name}</span>
                  </div>
                ))}
              </>
            )}
            <div className="onb-resp-sec">Equipe interna</div>
            {profiles.filter(p => p.status === 'active').map(p => (
              <div
                key={p.id}
                className={`onb-resp-opt${draft.respId === p.id && draft.respKind === 'interno' ? ' selected' : ''}`}
                onClick={() => pickResp(p.id, 'interno', p.name)}
              >
                <span className="onb-mini-avatar team">{initials(p.name)}</span>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="onb-pf-actions">
        <button className="onb-btn-sec sm" onClick={onCancel}>Cancelar</button>
        <button className="onb-btn-primary sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar pendência'}
        </button>
      </div>
    </div>
  )
}

// ── ActivityItem ──────────────────────────────────────────────────────────────
function ActivityItem({ act, expanded, showPendForm, contacts, profiles, onboardingId, qc, logAction, onToggleExpand, onTogglePendForm }) {
  const ACT_STATUS = [
    { v: 'pendente',     label: 'Pendente'     },
    { v: 'em_andamento', label: 'Em Andamento' },
    { v: 'concluida',    label: 'Concluída'    },
  ]

  const updateActMut = useMutation({
    mutationFn: async (status) => {
      const { error } = await supabase.from('onboarding_activities')
        .update({ status, completed_at: status === 'concluida' ? new Date().toISOString() : null })
        .eq('id', act.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] }),
    onError: e => toast.error(e.message),
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
    onError: e => toast.error(e.message),
  })

  const createPendMut = useMutation({
    mutationFn: async (draft) => {
      const payload = {
        onboarding_id: onboardingId,
        activity_id: act.id,
        title: draft.title.trim(),
        description: draft.desc || null,
        prioridade: draft.priority,
        status: 'criada',
        due_date: draft.due || null,
        responsavel_contato_id: draft.respKind === 'contato' ? Number(draft.respId) : null,
        responsavel_interno_id: draft.respKind === 'interno' ? draft.respId : null,
        responsavel_grupo: (!draft.respId) ? 'A definir' : null,
      }
      const { data, error } = await supabase.from('onboarding_pendencias').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('create_pendencia', 'onboarding_pendencia', data.id, data.title, null, { activity_id: act.id })
      toast.success('Pendência criada')
      onTogglePendForm(act.id, false)
    },
    onError: e => toast.error(e.message),
  })

  const resp = act.resp_interno?.name ?? act.resp_contato?.name ?? null
  const pendencias = act.pendencias ?? []

  return (
    <div className={`onb-act-item${expanded ? ' expanded' : ''}`}>
      <div className="onb-act-row" onClick={() => onToggleExpand(act.id)}>
        <div className="onb-act-caret">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 2 8 6 4 10"/>
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#173557', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {act.title}
        </div>
        <select
          className="onb-act-status-sel"
          value={act.status}
          onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); updateActMut.mutate(e.target.value) }}
        >
          {ACT_STATUS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {resp
            ? <span>{resp}{act.resp_contato ? <span style={{ color: 'rgba(23,53,87,0.45)' }}> (cliente)</span> : ''}</span>
            : <span style={{ color: 'rgba(23,53,87,0.4)', fontStyle: 'italic' }}>— sem responsável</span>
          }
        </div>
        <div style={{ fontSize: 12, color: act.due_date ? 'rgba(23,53,87,0.7)' : 'rgba(23,53,87,0.4)', fontStyle: act.due_date ? 'normal' : 'italic' }}>
          {act.due_date ? `Limite ${fmt(act.due_date)}` : '— sem prazo'}
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button
            className="onb-icon-btn danger"
            title="Remover"
            onClick={() => { if (window.confirm(`Remover atividade "${act.title}"?`)) deleteActMut.mutate() }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9"/>
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="onb-act-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pendências ({pendencias.length})
            </div>
            <button className="onb-btn-link" onClick={() => onTogglePendForm(act.id, !showPendForm)}>
              {showPendForm ? '× Fechar formulário' : '+ Nova Pendência'}
            </button>
          </div>

          {pendencias.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: showPendForm ? 0 : 0 }}>
              {pendencias.map(p => <PendingItem key={p.id} pend={p} />)}
            </div>
          ) : (
            !showPendForm && <div className="onb-pend-empty">Nenhuma pendência registrada nesta atividade.</div>
          )}

          {showPendForm && (
            <PendForm
              actId={act.id}
              contacts={contacts}
              profiles={profiles}
              onSave={draft => createPendMut.mutate(draft)}
              onCancel={() => onTogglePendForm(act.id, false)}
              saving={createPendMut.isPending}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── CatalogSearch ─────────────────────────────────────────────────────────────
function CatalogSearch({ actTypes, activities, onboardingId, faseAtual, qc, logAction, user }) {
  const [search,    setSearch]    = useState('')
  const [showDd,    setShowDd]    = useState(false)
  const inputRef = useRef()
  const ddRef    = useRef()

  const usedNames = new Set(activities.map(a => a.title.toLowerCase()))
  const filtered  = actTypes.filter(t =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    !usedNames.has(t.name.toLowerCase())
  )

  useEffect(() => {
    function handler(e) {
      if (ddRef.current && !ddRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setShowDd(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addActMut = useMutation({
    mutationFn: async (type) => {
      const payload = {
        onboarding_id: onboardingId,
        activity_type_id: type.id,
        title: type.name,
        fase: faseAtual,
        status: 'pendente',
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
      toast.success(`Atividade adicionada: ${data.title}`)
      setSearch('')
      setShowDd(false)
    },
    onError: e => toast.error(e.message),
  })

  return (
    <div className="onb-cat-wrap">
      <span className="onb-cat-icon">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="5"/><path d="M14 14l-3.2-3.2"/>
        </svg>
      </span>
      <input
        ref={inputRef}
        className="onb-cat-input"
        placeholder="Buscar no catálogo de atividades…"
        value={search}
        onChange={e => { setSearch(e.target.value); setShowDd(true) }}
        onFocus={() => setShowDd(true)}
        autoComplete="off"
      />
      {showDd && (
        <div className="onb-cat-dd" ref={ddRef}>
          {filtered.length === 0 ? (
            <div className="onb-cat-empty">
              {search ? 'Nenhuma atividade encontrada no catálogo' : 'Todas as atividades do catálogo já foram adicionadas'}
            </div>
          ) : (
            filtered.map(t => (
              <div key={t.id} className="onb-cat-item" onClick={() => addActMut.mutate(t)}>
                <span>{t.name}</span>
                <span style={{ fontSize: 10, color: 'rgba(23,53,87,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catálogo</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OnboardingDetailPage() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const qc            = useQueryClient()
  const { user }      = useAuth()
  const { logAction } = useAuditLog()

  const { data: project, isLoading, error } = useProjectDetail(id)
  const onboardingId = project?.onboarding_id
  const clientId     = project?.client?.id

  const {
    data: onboarding,
    isLoading: onboardingLoading,
    error: onboardingError,
  } = useOnboarding(onboardingId)

  const { data: activities  = [], isLoading: actsLoading } = useActivities(onboardingId)
  const { data: actTypes    = [] }                          = useActivityTypes()
  const { data: contacts    = [] }                          = useContacts(clientId ? { client_id: clientId } : {})
  const { data: profiles    = [] }                          = useProfiles()

  useEffect(() => {
    console.log('[OnboardingDetailPage] route param id:', id)
  }, [id])

  useEffect(() => {
    if (!project) return
    console.log('[OnboardingDetailPage] resolved project -> onboarding:', {
      project_id: project.id,
      onboarding_id: project.onboarding_id,
      route_id: id,
    })
  }, [project, id])

  useEffect(() => {
    if (!onboardingId) return
    console.log('[OnboardingDetailPage] useOnboarding input/output:', {
      onboarding_id: onboardingId,
      loaded_onboarding_id: onboarding?.id ?? null,
    })
  }, [onboardingId, onboarding])

  // UI state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [openMsId,      setOpenMsId]      = useState(null)   // milestone type or null
  const [msSaving,      setMsSaving]      = useState(false)
  const [expandedActs,  setExpandedActs]  = useState(new Set())
  const [showPendForms, setShowPendForms] = useState(new Set())

  function toggleExpand(actId) {
    setExpandedActs(prev => {
      const next = new Set(prev)
      if (next.has(actId)) { next.delete(actId); setShowPendForms(p => { const n = new Set(p); n.delete(actId); return n }) }
      else next.add(actId)
      return next
    })
  }

  function togglePendForm(actId, show) {
    setShowPendForms(prev => { const next = new Set(prev); show ? next.add(actId) : next.delete(actId); return next })
    if (show) setExpandedActs(prev => new Set([...prev, actId]))
  }

  // ── Phase mutations ────────────────────────────────────────────────────────
  const phaseMut = useMutation({
    mutationFn: async (direction) => {
      const onb    = onboarding
      if (!onb) throw new Error('Onboarding não carregado')
      const curIdx = faseIdx(onb.fase_atual)
      const newIdx = direction === 'advance' ? curIdx + 1 : curIdx - 1
      const newFase = FASE_ORDER[Math.max(0, Math.min(newIdx, FASE_ORDER.length - 1))]
      const { error } = await supabase.from('onboardings').update({ fase_atual: newFase }).eq('id', onb.id)
      if (error) throw error
      return { oldFase: onb.fase_atual, newFase }
    },
    onSuccess: ({ oldFase, newFase }) => {
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('change_fase', 'onboarding', onboardingId, project.title, { fase: oldFase }, { fase: newFase })
      toast.success(`Fase: ${FASE_LABELS[newFase]}`)
    },
    onError: e => toast.error(e.message),
  })

  // ── Milestone confirm ──────────────────────────────────────────────────────
  async function handleConfirmMs({ ms, occurredAt, justificativa, file }) {
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
      const { error } = await supabase.from('onboarding_milestones')
        .update({ occurred_at: occurredAt, justificativa: justificativa || null })
        .eq('id', ms.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('confirm_milestone', 'onboarding_milestone', ms.id, FASE_LABELS[ms.type], null, { occurred_at: occurredAt })
      toast.success(`${FASE_LABELS[ms.type]} confirmado!`)
      setOpenMsId(null)
    } catch (e) { toast.error(e.message) }
    finally { setMsSaving(false) }
  }

  async function handleReopenMs(ms) {
    setMsSaving(true)
    try {
      const { error } = await supabase.from('onboarding_milestones')
        .update({ occurred_at: null, justificativa: null })
        .eq('id', ms.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      logAction('reopen_milestone', 'onboarding_milestone', ms.id, FASE_LABELS[ms.type], { occurred_at: ms.occurred_at }, null)
      toast.success(`Marco reaberto: ${FASE_LABELS[ms.type]}`)
      setOpenMsId(null)
    } catch (e) { toast.error(e.message) }
    finally { setMsSaving(false) }
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (isLoading || (onboardingId && onboardingLoading)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: 'rgba(23,53,87,0.55)', fontSize: 14 }}>Carregando…</p>
      </div>
    )
  }
  if (error || !project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#b42828', fontSize: 14 }}>Projeto não encontrado.</p>
        <button className="onb-back-btn" onClick={() => navigate('/projetos')}>← Voltar</button>
      </div>
    )
  }
  if (onboardingError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#b42828', fontSize: 14 }}>Onboarding vinculado não encontrado.</p>
        <button className="onb-back-btn" onClick={() => navigate('/projetos')}>← Voltar</button>
      </div>
    )
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const onb       = onboarding
  const faseAtual = onb?.fase_atual ?? 'definicao_escopo'
  const fases     = (onb?.onboarding_fases ?? []).sort((a, b) => faseIdx(a.fase) - faseIdx(b.fase))
  const msMap     = (onb?.onboarding_milestones ?? []).reduce((acc, m) => { acc[m.type] = m; return acc }, {})
  const caps      = onb?.onboarding_capabilities ?? []
  const activeMsType = getActiveMs(onb?.onboarding_milestones ?? [])
  const clientName   = project.client?.fantasy_name || project.client?.name || '—'

  const totalSteps = 3 + 3 // 3 phases + 3 milestones
  const doneSteps  = (onb?.onboarding_milestones ?? []).filter(m => m.occurred_at).length + Math.max(0, faseIdx(faseAtual))

  const situacaoMap = {
    fluindo: { cls: 'green', label: 'Fluindo', dot: true },
    atencao: { cls: 'amber', label: 'Atenção',  dot: false },
    travado: { cls: 'red',   label: 'Travado',  dot: false },
  }
  const situacao = situacaoMap[onb?.situacao_geral] ?? situacaoMap.fluindo

  // which milestone panel is open
  const openMs = openMsId ? msMap[openMsId] : null

  // active phase name (strip for label)
  const activePhase = fases.find(f => f.fase === faseAtual)
  const activePhaseName = activePhase ? FASE_LABELS[faseAtual] : '—'

  return (
    <>
      <style>{PAGE_CSS}</style>
      <div style={{ background: '#f4f5f7', minHeight: '100vh', paddingBottom: 60 }}>

        {/* ── topbar / breadcrumb ─────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(15,34,58,0.07)', padding: '10px 32px' }}>
          <span style={{ fontSize: 13, color: 'rgba(23,53,87,0.6)' }}>
            <strong style={{ color: '#173557' }}>Projetos</strong>
            <span style={{ margin: '0 6px', color: 'rgba(23,53,87,0.35)' }}>/</span>
            <span
              style={{ cursor: 'pointer', color: '#173557' }}
            >
              {project.title}
            </span>
          </span>
        </div>

        <div style={{ padding: '22px 28px 60px' }}>

          {/* ── Page header ─────────────────────────────────────────────────── */}
          <button className="onb-back-btn" onClick={() => navigate('/projetos')}>← Projetos</button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: '#173557' }}>
                {project.title}
              </h1>
              <div style={{ fontSize: 13, color: '#0a6a96', fontWeight: 500, marginTop: 4 }}>{clientName}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <span className="onb-tag sky">{FASE_LABELS[project.type] ?? project.type}</span>
                {onb && (
                  <span className={`onb-tag ${situacao.cls}`}>
                    {situacao.dot && <span className="live-dot" />}
                    {situacao.label}
                  </span>
                )}
                {onb?.csm && (
                  <span className="onb-tag gray">CSM: {onb.csm.name}</span>
                )}
              </div>
            </div>
            <button className="onb-btn-sec" onClick={() => setEditModalOpen(true)}>
              Editar projeto
            </button>
          </div>

          {/* ── Timeline card ───────────────────────────────────────────────── */}
          {onb && (
            <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                  Linha do tempo <span style={{ color: 'rgba(23,53,87,0.55)', fontWeight: 500 }}>— fases e milestones</span>
                </div>
                <span className="onb-tag gray">{doneSteps} de {totalSteps} etapas concluídas</span>
              </div>

              <div className="onb-timeline-wrap">
                <div className="onb-timeline">

                  {/* Kickoff */}
                  {msMap.kickoff && (
                    <MilestoneEl ms={msMap.kickoff} activeMsType={activeMsType} openMsId={openMsId}
                      onToggle={t => setOpenMsId(prev => prev === t ? null : t)} />
                  )}

                  <Connector leftDone={!!msMap.kickoff?.occurred_at} rightActive={faseAtual === 'definicao_escopo'} />

                  {/* Fase 1 */}
                  {fases[0] && (
                    <PhaseEl fase={fases[0]} faseAtual={faseAtual} isLastPhase={false}
                      onAdvance={() => phaseMut.mutate('advance')}
                      onRevert={() => phaseMut.mutate('revert')} />
                  )}

                  <Connector leftDone={faseIdx(faseAtual) > 0} rightActive={faseAtual === 'preparacao_plataforma'} />

                  {/* Projeto Técnico */}
                  {msMap.projeto_tecnico_aprovado && (
                    <MilestoneEl ms={msMap.projeto_tecnico_aprovado} activeMsType={activeMsType} openMsId={openMsId}
                      onToggle={t => setOpenMsId(prev => prev === t ? null : t)} />
                  )}

                  <Connector leftDone={!!msMap.projeto_tecnico_aprovado?.occurred_at} rightActive={faseAtual === 'preparacao_plataforma'} />

                  {/* Fase 2 */}
                  {fases[1] && (
                    <PhaseEl fase={fases[1]} faseAtual={faseAtual} isLastPhase={false}
                      onAdvance={() => phaseMut.mutate('advance')}
                      onRevert={() => phaseMut.mutate('revert')} />
                  )}

                  <Connector leftDone={faseIdx(faseAtual) > 1} rightActive={faseAtual === 'treinamento'} />

                  {/* Fase 3 */}
                  {fases[2] && (
                    <PhaseEl fase={fases[2]} faseAtual={faseAtual} isLastPhase={true}
                      onAdvance={() => phaseMut.mutate('advance')}
                      onRevert={() => phaseMut.mutate('revert')} />
                  )}

                  <Connector leftDone={faseIdx(faseAtual) > 2} rightActive={faseAtual === 'encerrado'} />

                  {/* Go-Live */}
                  {msMap.go_live && (
                    <MilestoneEl ms={msMap.go_live} activeMsType={activeMsType} openMsId={openMsId}
                      onToggle={t => setOpenMsId(prev => prev === t ? null : t)} />
                  )}
                </div>
              </div>

              {/* Milestone panel — inline below timeline */}
              {openMs && (
                <MilestonePanel
                  ms={openMs}
                  onClose={() => setOpenMsId(null)}
                  onConfirm={handleConfirmMs}
                  onReopen={() => handleReopenMs(openMs)}
                  saving={msSaving}
                />
              )}
            </div>
          )}

          {/* ── Activities card ─────────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                Atividades <span style={{ color: 'rgba(23,53,87,0.55)', fontWeight: 500 }}>— {activePhaseName}</span>
              </div>
              <button
                className="onb-btn-primary sm"
                onClick={() => document.getElementById('onb-cat-input')?.focus()}
              >
                + Adicionar Atividade
              </button>
            </div>

            {onb && (
              <CatalogSearch
                actTypes={actTypes}
                activities={activities}
                onboardingId={onboardingId}
                faseAtual={faseAtual}
                qc={qc}
                logAction={logAction}
                user={user}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actsLoading ? (
                <p style={{ fontSize: 13, color: 'rgba(23,53,87,0.5)', padding: '16px 0' }}>Carregando atividades…</p>
              ) : activities.length === 0 ? (
                <div className="onb-pend-empty">Nenhuma atividade nesta fase. Adicione uma do catálogo acima.</div>
              ) : (
                activities.map(act => (
                  <ActivityItem
                    key={act.id}
                    act={act}
                    expanded={expandedActs.has(act.id)}
                    showPendForm={showPendForms.has(act.id)}
                    contacts={contacts}
                    profiles={profiles}
                    onboardingId={onboardingId}
                    qc={qc}
                    logAction={logAction}
                    onToggleExpand={toggleExpand}
                    onTogglePendForm={togglePendForm}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Capabilities card ───────────────────────────────────────────── */}
          {caps.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Capacidades contratadas</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {caps.map((cap, i) => {
                  const item = cap.catalog_item
                  if (!item) return null
                  const palette = CAP_PALETTE[i % CAP_PALETTE.length]
                  return (
                    <span key={cap.id} className="onb-cap-chip" style={palette.style}>{item.name}</span>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {editModalOpen && (
        <ProjectModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} clientId={clientId} project={project} />
      )}
    </>
  )
}
