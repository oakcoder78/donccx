import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useAuditLog } from '../hooks/useAuditLog'
import { useContacts } from '../hooks/useContacts'
import { useProfiles } from '../hooks/useProfiles'
import { useOnboarding } from '../hooks/useOnboardings'
import { useDeleteProject } from '../hooks/useProjects'
import { useBrief } from '../hooks/useBrief'
import { BriefCreateModal, BriefResponsesModal } from '../components/brief'
import { FASE_LABELS } from '../lib/onboardingLabels'
import { FASE_TYPE_IDS } from '../lib/constants'
import { ProjectModal } from '../components/projects/ProjectModal'
import { styles } from '../components/onboarding/OnboardingStyles'
import { Icons } from '../lib/icons'


// ── Local style constants ─────────────────────────────────────────────────────
const S = {
  tag: { fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5, lineHeight: 1.5, whiteSpace: 'nowrap' },
  tagColors: {
    sky:   { background: 'rgba(89,194,237,0.14)', color: '#0a6a96' },
    green: { background: 'rgba(34,160,98,0.14)',  color: '#157a47' },
    amber: { background: 'rgba(217,140,30,0.16)', color: '#875111' },
    red:   { background: 'rgba(196,60,60,0.14)',  color: '#a02020' },
    gray:  { background: 'rgba(23,53,87,0.06)',   color: 'rgba(23,53,87,0.65)' },
  },
  liveDot: { width: 6, height: 6, borderRadius: '50%', background: '#1aa56a', boxShadow: '0 0 0 3px rgba(26,165,106,0.18)', flexShrink: 0 },
  btnPrimary:    { background: '#173557', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimarySm:  { background: '#173557', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimarySmDis: { background: '#aaa9a3', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'not-allowed', fontFamily: 'inherit' },
  btnSec:   { background: '#fff', color: '#173557', border: '1px solid rgba(15,34,58,0.14)', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecSm: { background: '#fff', color: '#173557', border: '1px solid rgba(15,34,58,0.14)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnLink: { background: 'transparent', border: 'none', padding: 0, color: '#0a6a96', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnBack: { background: 'transparent', border: 'none', padding: 0, color: 'rgba(23,53,87,0.7)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 },
  iconBtn: { background: 'transparent', border: 'none', width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'rgba(23,53,87,0.55)', cursor: 'pointer', padding: 0 },
  input:    { width: '100%', border: '1px solid #d4d3ce', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', color: '#173557', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  select:   { width: '100%', border: '1px solid #d4d3ce', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', color: '#173557', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', border: '1px solid #d4d3ce', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', color: '#173557', background: '#fff', outline: 'none', resize: 'vertical', minHeight: 64, boxSizing: 'border-box' },
  label:    { display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  segmented: { display: 'inline-flex', background: '#f4f5f7', borderRadius: 9, padding: 3, gap: 2 },
  segBtn:    { background: 'transparent', border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'rgba(23,53,87,0.65)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' },
  segBtnOn:  { background: '#fff', border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: 500, color: '#173557', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(15,34,58,0.08)' },
  segBtnAtiva: { background: '#DFEDF5', border: 'none', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#173557', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' },
  actStatusSel: { padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid rgba(15,34,58,0.12)', background: '#fff', color: '#173557', fontFamily: 'inherit', width: '100%', outline: 'none' },
  capChipBase:  { fontSize: 12, fontWeight: 500, padding: '5px 11px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 },
}

function Tag({ color, children, style: extra }) {
  return <span style={{ ...S.tag, ...S.tagColors[color], ...extra }}>{children}</span>
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, title: ttl }) {
  return (
    <span title={ttl}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          width: 30, height: 17, borderRadius: 9,
          background: checked ? '#173557' : '#d4d3ce',
          border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer',
          position: 'relative', flexShrink: 0, display: 'inline-block',
          transition: 'background 0.2s',
          verticalAlign: 'middle',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 13 : 2,
          width: 13, height: 13, borderRadius: '50%', background: '#fff',
          display: 'block', transition: 'left 0.18s',
        }} />
      </button>
    </span>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PEND_STATUS = [
  { v: 'criada',               label: 'Criada'         },
  { v: 'em_andamento',         label: 'Em Andamento'   },
  { v: 'aguardando_validacao', label: 'Ag. Validação'  },
  { v: 'encerrada',            label: 'Encerrada'      },
]

const ACT_STATUS = [
  { v: 'pendente', label: 'Pendente', color: '#d99020', bg: 'rgba(217,140,30,0.14)' },
  { v: 'em_andamento', label: 'Em Andamento', color: '#0a6a96', bg: 'rgba(89,194,237,0.14)' },
  { v: 'concluida', label: 'Concluída', color: '#157a47', bg: 'rgba(34,160,98,0.14)' },
]

const getActStatusColor = (status) => {
  const s = ACT_STATUS.find(o => o.v === status)
  return s ? { color: s.color, bg: s.bg } : { color: 'rgba(23,53,87,0.7)', bg: 'rgba(23,53,87,0.08)' }
}

const CAP_PALETTE = [
  { background: 'rgba(89,194,237,0.18)', color: '#0a6a96' },
  { background: 'rgba(132,93,212,0.16)', color: '#5a3fa5' },
  { background: 'rgba(34,160,98,0.16)',  color: '#157a47' },
  { background: 'rgba(23,53,87,0.10)',   color: '#173557' },
  { background: 'rgba(217,140,30,0.16)', color: '#875111' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—'
  try {
    const dateStr = typeof d === 'string' ? d.slice(0, 10) : d
    if (!dateStr || dateStr.length < 10) return '—'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR')
  } catch { return '—' }
}
function phaseName(fase) {
  return fase?.onboarding_fase_types?.name || `Fase ${fase?.display_order ?? '—'}`
}
function initials(name = '') {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function addDaysToISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Data hooks ────────────────────────────────────────────────────────────────
function useProjectDetail(projectId) {
  return useQuery({
    queryKey: ['project_detail', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, client:clients(id, name, fantasy_name)')
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

function useFaseTypes() {
  return useQuery({
    queryKey: ['onb_fase_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_fase_types')
        .select('id, name, is_milestone, requires_evidence, allows_attachments, display_order, active')
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })
}

// ── RespPicker ────────────────────────────────────────────────────────────────
function RespPicker({ contacts, profiles, selectedId, selectedKind, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef()

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedName = selectedId
    ? selectedKind === 'contato'
      ? contacts.find(c => c.id === selectedId)?.name
      : profiles.find(p => p.id === selectedId)?.name
    : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        style={{ ...S.select, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ color: selectedName ? '#173557' : 'rgba(23,53,87,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedName || '— Selecionar responsável —'}
        </span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="2 4 6 8 10 4"/>
        </svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid rgba(15,34,58,0.12)', borderRadius: 9, boxShadow: '0 8px 24px rgba(10,22,40,0.14)', zIndex: 300, maxHeight: 220, overflowY: 'auto', padding: '4px' }}>
          {contacts.length > 0 && (
            <>
              <div style={styles.respPicker.section}>Contatos do cliente</div>
              {contacts.map(c => {
                const sel = selectedId === c.id && selectedKind === 'contato'
                return (
                  <div key={c.id} style={{ ...styles.respPicker.option, ...(sel ? styles.respPicker.optionSelected : {}) }} onClick={() => { onChange(c.id, 'contato', c.name); setOpen(false) }}>
                    <span style={styles.respPicker.miniAvatar}>{initials(c.name)}</span>
                    <span>{c.name}</span>
                  </div>
                )
              })}
            </>
          )}
          <div style={styles.respPicker.section}>Equipe interna</div>
          {profiles.filter(p => p.status === 'active').map(p => {
            const sel = selectedId === p.id && selectedKind === 'interno'
            return (
              <div key={p.id} style={{ ...styles.respPicker.option, ...(sel ? styles.respPicker.optionSelected : {}) }} onClick={() => { onChange(p.id, 'interno', p.name); setOpen(false) }}>
                <span style={{ ...styles.respPicker.miniAvatar, ...styles.respPicker.miniAvatarTeam }}>{initials(p.name)}</span>
                <span>{p.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── PhaseCircle — all clickable, icons from Icons ───────────────────────────
function PhaseCircle({ fase, isActive, isDone, onClick }) {
  const isMilestone = !!fase.onboarding_fase_types?.is_milestone

  let circleBg, circleBorder, circleColor, circleShadow
  if (isDone) {
    circleBg = '#1aa56a'; circleBorder = '#1aa56a'; circleColor = '#fff'; circleShadow = 'none'
  } else if (isActive) {
    circleBg = 'rgba(89,194,237,0.12)'; circleBorder = '#59c2ed'; circleColor = '#0a6a96'
    circleShadow = '0 0 0 4px rgba(89,194,237,0.18)'
  } else {
    circleBg = '#f4f5f7'; circleBorder = '#d4d3ce'; circleColor = 'rgba(23,53,87,0.35)'; circleShadow = 'none'
  }

  const labelColor = isDone ? '#157a47' : isActive ? '#0a6a96' : 'rgba(23,53,87,0.4)'
  const Icon = isDone ? Icons.Check : isMilestone ? Icons.Flag : Icons.FileText
  const iconSize = isDone ? 18 : 15

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 72, maxWidth: 96 }}>
      <div
        onClick={onClick}
        style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `2.5px solid ${circleBorder}`,
          background: circleBg, color: circleColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
          cursor: 'pointer',
          boxShadow: circleShadow,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
      >
        <Icon size={iconSize} color={circleColor} strokeWidth={isDone ? 2.4 : 1.6} />
      </div>
      <div style={{ fontSize: 11, textAlign: 'center', fontWeight: isDone || isActive ? 600 : 400, color: labelColor, lineHeight: 1.3, maxWidth: 88, wordBreak: 'break-word' }}>
        {phaseName(fase)}
      </div>
      <div style={{ fontSize: 10, textAlign: 'center', color: 'rgba(23,53,87,0.5)', lineHeight: 1.3 }}>
        {isDone ? fmt(fase.occurred_at ?? fase.actual_end) : fase.planned_start ? `Prev. ${fmt(fase.planned_start)}` : '—'}
      </div>
    </div>
  )
}

// ── Connector ─────────────────────────────────────────────────────────────────
function Connector({ leftDone, rightActive }) {
  const bg = leftDone && rightActive
    ? 'linear-gradient(90deg, #1aa56a, #59c2ed)'
    : leftDone ? '#1aa56a' : '#d4d3ce'
  return <div style={{ flex: 1, minWidth: 10, height: 2, background: bg, marginTop: 23, flexShrink: 0, alignSelf: 'flex-start' }} />
}

// ── EvidenceRow — redesigned ──────────────────────────────────────────────────
function EvidenceRow({ ev, onView, onDelete }) {
  const ext = (ev.file_name?.split('.').pop() || '').toLowerCase()
  const extConf = {
    pdf:  { bg: 'rgba(196,60,60,0.12)',  color: '#a02020' },
    png:  { bg: 'rgba(132,93,212,0.14)', color: '#5a3fa5' },
    jpg:  { bg: 'rgba(132,93,212,0.14)', color: '#5a3fa5' },
    jpeg: { bg: 'rgba(132,93,212,0.14)', color: '#5a3fa5' },
  }
  const ic = extConf[ext] || { bg: 'rgba(89,194,237,0.12)', color: '#0a6a96' }
  const extLabel = ext.slice(0, 3).toUpperCase() || 'DOC'
  const sizeKB = ev.file_size ? Math.max(1, Math.round(ev.file_size / 1024)) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 10, padding: '9px 12px 9px 10px' }}>
      <div style={{ width: 30, height: 36, borderRadius: 5, background: ic.bg, color: ic.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
        {extLabel}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#173557', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.file_name}</div>
        <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.55)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>{ev.uploaded_by?.name ?? '—'}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{ev.created_at ? new Date(ev.created_at).toLocaleDateString('pt-BR') : '—'}</span>
          {sizeKB && <><span style={{ opacity: 0.4 }}>·</span><span>{sizeKB} KB</span></>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <button style={{ background: 'transparent', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#0a6a96', cursor: 'pointer', fontFamily: 'inherit' }} onClick={onView}>Ver</button>
        <button style={{ background: 'transparent', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: 'rgba(180,40,40,0.85)', cursor: 'pointer', fontFamily: 'inherit' }} onClick={onDelete}>Remover</button>
      </div>
    </div>
  )
}

// ── BriefHeaderButton — botão no header do projeto ─────────────────────────────
function BriefHeaderButton({ project, onboardingId, clientId, clientName }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState(null)

  const { briefInstances, briefTemplates, createBrief, updateBriefStatus, copyPublicLink, isLoading } = useBrief(onboardingId, clientId)

  const instance = briefInstances[0]

  const handleClick = () => {
    if (instance) {
      setSelectedInstance(instance)
      setShowResponses(true)
    } else {
      setShowCreate(true)
    }
  }

  const handleSend = async () => {
    if (!instance) return
    await updateBriefStatus.mutateAsync({ id: instance.id, status: 'sent' })
    await copyPublicLink(instance.access_token)
  }

  const STATUS_CONFIG = {
    draft: { bg: '#e2e8f0', color: '#475569' },
    sent: { bg: 'rgba(89,194,237,0.15)', color: '#0a6a96' },
    in_progress: { bg: 'rgba(211,218,71,0.2)', color: '#4a5c20' },
    completed: { bg: '#173557', color: '#ffffff' },
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isLoading}
        style={{
          ...S.btnSec,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: instance ? 'rgba(89,194,237,0.08)' : 'transparent',
        }}
      >
        {isLoading ? (
          <span style={{ fontSize: 12 }}>...</span>
        ) : instance ? (
          <>
            <Icons.ClipboardList size={14} />
            <span>Brief</span>
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 999,
              background: STATUS_CONFIG[instance.status]?.bg,
              color: STATUS_CONFIG[instance.status]?.color,
            }}>
              {instance.status === 'draft' ? 'Rascunho' : instance.status === 'sent' ? 'Enviado' : instance.status === 'in_progress' ? 'Em progresso' : 'Concluído'}
            </span>
          </>
        ) : (
          <>
            <Icons.FileQuestion size={14} />
            <span>Criar Brief</span>
          </>
        )}
      </button>

      {showCreate && (
        <BriefCreateModal
          onboardingId={onboardingId}
          clientId={clientId}
          clientName={clientName}
          faseName={project?.title || ''}
          templates={briefTemplates}
          onClose={() => setShowCreate(false)}
          onCreate={createBrief.mutateAsync}
          isCreating={createBrief.isPending}
        />
      )}

      {showResponses && selectedInstance && (
        <BriefResponsesModal
          instance={selectedInstance}
          onClose={() => { setShowResponses(false); setSelectedInstance(null) }}
        />
      )}
    </>
  )
}

// ── FasePanel — modal overlay, design do HTML aprovado ───────────────────────
function FasePanel({ fase, orderedFases, onboardingId, onClose, user, clientId, qc, logAction, activities, onboardingTitle, onboarding }) {
  const isMilestone      = !!fase.onboarding_fase_types?.is_milestone
  const needsEvidence    = isMilestone || !!fase.onboarding_fase_types?.requires_evidence || !!fase.evidence_required
  const allowsAttach     = !!fase.allows_attachments
  const today         = todayISO()
  const fileInputId   = `ev-input-${fase.id}`

  const [plannedStart,   setPlannedStart]   = useState(fase.planned_start?.slice(0, 10) || '')
  const [plannedEnd,    setPlannedEnd]    = useState(fase.planned_end?.slice(0, 10) || '')
  const [actualEnd,     setActualEnd]     = useState(fase.actual_end?.slice(0, 10) || '')
  const [justificativa, setJustificativa] = useState(fase.justificativa ?? '')
  const [saving,        setSaving]        = useState(false)
  const [uploadingEv,   setUploadingEv]   = useState(false)
  const [saveState,     setSaveState]     = useState('idle')
  const [savedAt,       setSavedAt]       = useState('')

  const [plannedStartOrig, setPlannedStartOrig] = useState(fase.planned_start?.slice(0, 10) || '')

  const phaseActs  = activities.filter(a => a.fase_id === fase.id)
  const maxDueDate = phaseActs.reduce((mx, a) => (!a.due_date ? mx : !mx || a.due_date > mx ? a.due_date : mx), null)

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const { data: evidencias = [] } = useQuery({
    queryKey: ['fase_evidencias', fase.id],
    enabled: (needsEvidence || allowsAttach) && !!fase.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_evidencias')
        .select('*, uploaded_by:profiles!uploaded_by(id, name)')
        .eq('fase_id', fase.id)
      if (error) { console.error(error); return [] }
      return (data ?? []).filter(e => !e.is_deleted)
    },
  })

  function markSaved() {
    setSaveState('saved')
    setSavedAt(new Date().toLocaleTimeString('pt-BR'))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {}
      if (plannedStart !== plannedStartOrig) {
        updates.planned_start = plannedStart || null
        setPlannedStartOrig(plannedStart)
      }
      if (plannedEnd !== (fase.planned_end?.slice(0, 10) || '')) updates.planned_end = plannedEnd || null
      if (justificativa !== (fase.justificativa ?? '')) updates.justificativa = justificativa || null

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('onboarding_fases').update(updates).eq('id', fase.id)
        if (error) throw error
        logAction('updated', 'onboarding_fase', fase.id, phaseName(fase), null, updates)
        qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      }
      markSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function savePlannedEndBlur(val) {
    if (val === (fase.planned_end?.slice(0, 10) || '')) return
    const { error } = await supabase.from('onboarding_fases').update({ planned_end: val || null }).eq('id', fase.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
    markSaved()
  }

  async function saveActualEndBlur(val) {
    if (val === (fase.actual_end?.slice(0, 10) || '')) return
    const { error } = await supabase.from('onboarding_fases').update({ actual_end: val || null }).eq('id', fase.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
    markSaved()
  }

  async function saveJustBlur(val) {
    if (val === (fase.justificativa ?? '')) return
    const { error } = await supabase.from('onboarding_fases').update({ justificativa: val || null }).eq('id', fase.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
    markSaved()
  }

  async function handleViewEv(ev) {
    const { data, error } = await supabase.storage.from('activity-attachments').createSignedUrl(ev.storage_path, 3600)
    if (error) { toast.error('Erro ao gerar link'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function handleDeleteEv(ev) {
    if (!window.confirm(`Remover evidência "${ev.file_name}"?`)) return
    await supabase.storage.from('activity-attachments').remove([ev.storage_path])
    const { error } = await supabase.from('onboarding_evidencias').update({ is_deleted: true }).eq('id', ev.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['fase_evidencias', fase.id] })
    toast.success('Evidência removida')
  }

  async function handleUploadEv(files) {
    if (!files?.length) return
    setUploadingEv(true)
    try {
      for (const file of Array.from(files)) {
        const ext  = file.name.split('.').pop()
        const path = `${clientId}/onboarding/fase_${fase.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
        const { error: upErr } = await supabase.storage.from('activity-attachments').upload(path, file)
        if (upErr) throw upErr
        const { error: dbErr } = await supabase.from('onboarding_evidencias').insert({
          fase_id: fase.id, uploaded_by: user.id, client_id: clientId,
          file_name: file.name, file_size: file.size, file_type: file.type, storage_path: path,
        })
        if (dbErr) throw dbErr
      }
      qc.invalidateQueries({ queryKey: ['fase_evidencias', fase.id] })
      toast.success('Evidência(s) adicionada(s)')
    } catch (e) { toast.error(e.message) }
    finally { setUploadingEv(false) }
  }

  async function handleActivate() {
    setSaving(true)
    try {
      const { error } = await supabase.from('onboarding_fases').update({ status: 'ativa', actual_start: today }).eq('id', fase.id)
      if (error) throw error
      await supabase.from('onboardings').update({ fase_atual_id: fase.id }).eq('id', onboardingId)
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('activated', 'onboarding_fase', fase.id, phaseName(fase), { status: 'pendente' }, { status: 'ativa' })
      toast.success(`Fase ativada: ${phaseName(fase)}`)
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

async function handleComplete() {
    const hasConcluida = activities.some(a => a.fase_id === fase.id && a.status === 'concluida')
    if (!hasConcluida) { toast.error('Conclua pelo menos uma atividade desta fase antes de avançar'); return }
    setSaving(true)
    try {
      await supabase.from('onboarding_fases').update({ status: 'concluida', actual_end: actualEnd || null }).eq('id', fase.id)
      const idx = orderedFases.findIndex(f => f.id === fase.id)
      const next = orderedFases.slice(idx + 1).find(f => f.status === 'pendente')
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('advanced', 'onboarding_fase', fase.id, phaseName(fase), { status: 'ativa' }, { status: 'concluida' })
      
      if (next) {
        toast.success(`Fase concluída: ${phaseName(fase)}`, {
          action: {
            label: `Ativar: ${next.onboarding_fase_types?.name || 'Próxima fase'}`,
            onClick: () => handleActivateNext(next.id)
          },
          duration: 8000
        })
      } else {
        toast.success(`Fase concluída: ${phaseName(fase)}`)
      }
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleActivateNext(faseId) {
    try {
      await supabase.from('onboarding_fases').update({ status: 'ativa', actual_start: today }).eq('id', faseId)
      await supabase.from('onboardings').update({ fase_atual_id: faseId }).eq('id', onboardingId)
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      const nextFase = orderedFases.find(f => f.id === faseId)
      logAction('activated', 'onboarding_fase', faseId, phaseName(nextFase), { status: 'pendente' }, { status: 'ativa' })
      toast.success(`Fase ativada: ${phaseName(nextFase)}`)
      onClose()
    } catch (e) { toast.error(e.message) }
  }

  async function handleCompleteMilestone() {
    if (evidencias.length === 0 && !justificativa.trim()) {
      toast.error('Adicione uma evidência ou preencha a justificativa'); return
    }
    setSaving(true)
    try {
      await supabase.from('onboarding_fases')
        .update({ status: 'concluida', occurred_at: actualEnd || today, actual_end: actualEnd || today, justificativa: justificativa || null })
        .eq('id', fase.id)
      const idx = orderedFases.findIndex(f => f.id === fase.id)
      const next = orderedFases.slice(idx + 1).find(f => f.status === 'pendente')
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('marco_concluido', 'onboarding_fase', fase.id, phaseName(fase), { status: 'ativa' }, { status: 'concluida', occurred_at: actualEnd || today })

      const isGoLive = fase.fase_type_id === FASE_TYPE_IDS.GOLIVE
      const isImplantacao = onboarding?.context === 'implantacao_inicial'
      if (isGoLive && isImplantacao) {
        const dueDate = addDaysToISO(today, 2)
        const payload = {
          type: 'tarefa',
          title: 'Go-Live concluído — revisar stage do cliente para Estabilização',
          description: 'O onboarding de implantação inicial foi concluído. Revise o stage do cliente e altere para Estabilização para que o Health Score passe a ser calculado normalmente.',
          client_id: clientId,
          responsible_id: onboarding.csm_id || null,
          status: 'pendente',
          activity_date: today,
          due_date: dueDate,
          notes: `Gerado automaticamente pelo sistema ao concluir o Go-Live do onboarding: ${onboardingTitle}`,
        }
        const { data, error } = await supabase.from('activities').insert(payload).select().single()
        if (!error) {
          logAction('golive_alerta_criado', 'onboarding_fase', fase.id, onboardingTitle, null, { activity_title: 'Go-Live concluído — revisar stage do cliente para Estabilização' })
          qc.invalidateQueries({ queryKey: ['activities'] })
        }
        toast.success('🎉 Go-Live registrado! Uma tarefa foi criada para revisão do stage do cliente.')
      } else if (next) {
        toast.success(`Marco concluído: ${phaseName(fase)}`, {
          action: {
            label: `Ativar: ${next.onboarding_fase_types?.name || 'Próxima fase'}`,
            onClick: () => handleActivateNext(next.id)
          },
          duration: 8000
        })
      } else {
        toast.success(`Marco concluído: ${phaseName(fase)}`)
      }

      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleRevert() {
    setSaving(true)
    try {
      await supabase.from('onboarding_fases').update({ status: 'pendente', actual_start: null }).eq('id', fase.id)
      const idx  = orderedFases.findIndex(f => f.id === fase.id)
      const prev = idx > 0 ? orderedFases[idx - 1] : null
      if (prev) {
        await supabase.from('onboarding_fases').update({ status: 'ativa' }).eq('id', prev.id)
        await supabase.from('onboardings').update({ fase_atual_id: prev.id }).eq('id', onboardingId)
      } else {
        await supabase.from('onboardings').update({ fase_atual_id: null }).eq('id', onboardingId)
      }
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      logAction('reverted', 'onboarding_fase', fase.id, phaseName(fase), { status: 'ativa' }, { status: 'pendente' })
      toast.success(`Fase revertida: ${phaseName(fase)}`)
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleReopen() {
    setSaving(true)
    try {
      await supabase.from('onboarding_fases').update({ status: 'pendente', actual_end: null, occurred_at: null }).eq('id', fase.id)
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      logAction('reopened', 'onboarding_fase', fase.id, phaseName(fase), { status: 'concluida' }, { status: 'pendente' })
      toast.success(`Fase reaberta: ${phaseName(fase)}`)
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  // Status pill
  const pillConf = {
    ativa:    { bg: 'rgba(89,194,237,0.14)', fg: '#0a6a96',             dot: true,  label: 'Ativo'     },
    concluida:{ bg: 'rgba(34,160,98,0.14)',  fg: '#157a47',             dot: false, label: 'Concluído' },
    pendente: { bg: 'rgba(23,53,87,0.06)',   fg: 'rgba(23,53,87,0.65)', dot: false, label: 'Pendente'  },
  }
  const pc = pillConf[fase.status] || pillConf.pendente

  const dateInputStyle = (confirmed) => ({
    width: '100%', border: `1px solid ${confirmed ? 'rgba(34,160,98,0.45)' : '#d4d3ce'}`,
    borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
    color: '#173557', background: confirmed ? '#f6fbf8' : '#fff', outline: 'none', boxSizing: 'border-box',
  })

  const sectionDiv = (last) => ({
    padding: '14px 0 18px',
    borderBottom: last ? 'none' : '1px solid rgba(15,34,58,0.06)',
  })

  const footBtnStyle = (primary, dis) => ({
    background: primary ? (dis ? '#aaa9a3' : '#173557') : 'transparent',
    color: primary ? '#fff' : 'rgba(23,53,87,0.7)',
    border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500,
    cursor: dis ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  })

  const footBtnSecStyle = (dis) => ({
    background: '#fff', color: '#173557',
    border: '1px solid rgba(15,34,58,0.14)', borderRadius: 8, padding: '9px 16px',
    fontSize: 13, fontWeight: 500, cursor: dis ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
  })

  const footBtnGhostStyle = (dis) => ({
    background: 'transparent', color: 'rgba(23,53,87,0.6)',
    border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500,
    cursor: dis ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
  })

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
        background: 'rgba(15,28,48,0.45)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center',
        padding: '32px 16px', zIndex: 200, overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 'min(720px, 100%)',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px -12px rgba(15,28,48,0.35), 0 0 0 1px rgba(15,28,48,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid rgba(15,34,58,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(23,53,87,0.55)', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(89,194,237,0.16)', color: '#0a6a96', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {isMilestone
                  ? <Icons.Flag size={10} strokeWidth={1.6} />
                  : <Icons.FileText    size={10} strokeWidth={1.6} />}
              </span>
              {isMilestone ? 'Marco' : 'Fase'} · {onboardingTitle}
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px', color: '#173557', margin: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {phaseName(fase)}
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: pc.bg, color: pc.fg, display: 'inline-flex', alignItems: 'center', gap: 5, lineHeight: 1.5 }}>
                {pc.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: pc.fg, boxShadow: `0 0 0 3px ${pc.fg}28` }} />}
                {pc.label}
              </span>
            </h2>
            <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.6)', marginTop: 6 }}>
              {isMilestone
                ? 'Registre as datas, evidências e observações para concluir este marco.'
                : 'Registre as datas e observações desta fase.'}
            </div>
          </div>
          <button
            style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none', color: 'rgba(23,53,87,0.55)', display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer' }}
            onClick={onClose} title="Fechar (Esc)"
          >
            <Icons.X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 4px', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>

          {/* Datas */}
          <div style={sectionDiv(false)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Datas {isMilestone ? 'do Marco' : 'da Fase'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)' }}>Sugestão baseada nas atividades</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  <span>Previsão de início</span>
                </div>
                <input
                  type="date"
                  style={dateInputStyle(!!plannedStart)}
                  value={plannedStart}
                  onChange={e => { setPlannedStart(e.target.value); setSaveState('dirty') }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  <span>Previsão de conclusão</span>
                  {maxDueDate && (
                    <button type="button" style={{ fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#0a6a96', background: 'rgba(89,194,237,0.12)', padding: '2px 8px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }} onClick={() => { setPlannedEnd(maxDueDate); setSaveState('dirty') }}>
                      Sugestão · {fmt(maxDueDate)}
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  style={dateInputStyle(!!plannedEnd)}
                  value={plannedEnd}
                  onChange={e => { setPlannedEnd(e.target.value); setSaveState('dirty') }}
                  onBlur={e => savePlannedEndBlur(e.target.value)}
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  <span>Data de conclusão</span>
                  {fase.status !== 'pendente' && (
                    <button type="button" style={{ fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#0a6a96', background: 'rgba(89,194,237,0.12)', padding: '2px 8px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }} onClick={() => { setActualEnd(today); setSaveState('dirty') }}>
                      Hoje
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  style={{ ...dateInputStyle(!!actualEnd), opacity: fase.status === 'pendente' ? 0.5 : 1 }}
                  value={actualEnd}
                  disabled={fase.status === 'pendente'}
                  onChange={e => { setActualEnd(e.target.value); setSaveState('dirty') }}
                  onBlur={e => saveActualEndBlur(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Anexos */}
          {allowsAttach && (
            <div style={sectionDiv(false)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Anexos
                  {evidencias.length > 0 && <span style={{ fontSize: 10, background: 'rgba(23,53,87,0.08)', color: 'rgba(23,53,87,0.7)', padding: '1px 7px', borderRadius: 999, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{evidencias.length}</span>}
                </div>
              </div>
              {evidencias.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {evidencias.map(ev => (
                    <EvidenceRow key={ev.id} ev={ev} onView={() => handleViewEv(ev)} onDelete={() => handleDeleteEv(ev)} />
                  ))}
                </div>
              )}
              <label
                htmlFor={fileInputId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  border: '1.5px dashed rgba(15,34,58,0.18)', borderRadius: 10,
                  padding: '14px 16px', background: uploadingEv ? 'rgba(89,194,237,0.06)' : '#fafbfc',
                  color: 'rgba(23,53,87,0.65)', fontSize: 12,
                  cursor: uploadingEv ? 'default' : 'pointer', boxSizing: 'border-box', width: '100%',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v9"/><polyline points="4.5 6 8 2.5 11.5 6"/>
                  <path d="M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/>
                </svg>
                {uploadingEv
                  ? 'Enviando…'
                  : <span>Arraste arquivos aqui ou <strong style={{ color: '#0a6a96', fontWeight: 600 }}>clique para selecionar</strong></span>}
              </label>
              <input
                id={fileInputId}
                type="file"
                multiple
                style={{ display: 'none' }}
                disabled={uploadingEv}
                onChange={e => { if (e.target.files?.length) handleUploadEv(e.target.files); e.target.value = '' }}
              />
            </div>
          )}

          {/* Evidência obrigatória (texto descritivo) */}
          {needsEvidence && !allowsAttach && (
            <div style={sectionDiv(false)}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Evidência</div>
              <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)', marginBottom: 8 }}>Esta fase exige comprovação. Anexe arquivos acima ou descreva a evidência abaixo.</div>
            </div>
          )}

          {/* Justificativa */}
          <div style={sectionDiv(true)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Justificativa &amp; Observações</div>
              <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)' }}>Opcional — aparece no histórico</div>
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                maxLength={600}
                placeholder="Ex.: reunião realizada com presença de toda equipe operacional do cliente. Ata anexa."
                style={{ width: '100%', border: '1px solid #d4d3ce', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: '#173557', background: '#fff', outline: 'none', resize: 'vertical', minHeight: 86, lineHeight: 1.55, boxSizing: 'border-box' }}
                value={justificativa}
                onChange={e => { setJustificativa(e.target.value); setSaveState('dirty') }}
                onBlur={e => saveJustBlur(e.target.value)}
              />
              <div style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 10, color: 'rgba(23,53,87,0.4)', pointerEvents: 'none' }}>
                {justificativa.length}/600
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: '#fafbfc', borderTop: '1px solid rgba(15,34,58,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.55)', display: 'flex', alignItems: 'center', gap: 6, minHeight: 20 }}>
            {saveState !== 'idle' && (
              <>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: saveState === 'saved' ? '#1aa56a' : 'rgba(217,140,30,0.7)',
                  boxShadow: saveState === 'saved' ? '0 0 0 3px rgba(26,165,106,0.18)' : '0 0 0 3px rgba(217,140,30,0.18)',
                }} />
                <span>{saveState === 'saved' ? `Salvo · ${savedAt}` : 'Alterações não salvas'}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {fase.status === 'pendente' && (
              <>
                <button style={footBtnSecStyle(saving)} disabled={saving} onClick={handleSave}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button style={footBtnStyle(true, saving)} disabled={saving} onClick={handleActivate}>
                  {saving ? 'Salvando…' : 'Tornar ativa'}
                </button>
              </>
            )}
            {fase.status === 'ativa' && !isMilestone && (
              <>
                <button style={footBtnGhostStyle(saving)} disabled={saving} onClick={handleRevert}>Voltar para pendente</button>
                <button style={footBtnSecStyle(saving)} disabled={saving} onClick={handleSave}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button style={footBtnStyle(true, saving)} disabled={saving} onClick={handleComplete}>
                  {saving ? 'Salvando…' : 'Registrar conclusão'}
                </button>
              </>
            )}
            {fase.status === 'ativa' && isMilestone && (
              <>
                <button style={footBtnGhostStyle(saving)} disabled={saving} onClick={handleRevert}>Voltar para pendente</button>
                <button style={footBtnSecStyle(saving)} disabled={saving} onClick={handleSave}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button style={footBtnStyle(true, saving)} disabled={saving} onClick={handleCompleteMilestone}>
                  {saving ? 'Salvando…' : 'Registrar conclusão'}
                </button>
              </>
            )}
            {fase.status === 'concluida' && (
              <button style={footBtnStyle(true, saving)} disabled={saving} onClick={handleReopen}>
                {saving ? 'Salvando…' : 'Reabrir fase'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PendingItem ───────────────────────────────────────────────────────────────
function PendingItem({ pend, onEdit, onDelete }) {
  const prioMap = {
    bloqueadora: { color: 'red',   label: 'Bloqueadora', border: { borderLeftColor: '#c44', background: 'linear-gradient(90deg,rgba(196,60,60,0.04),#fff 18%)' } },
    alta:        { color: 'amber', label: 'Alta',        border: { borderLeftColor: '#d99020' } },
    normal:      { color: 'gray',  label: 'Normal',      border: {} },
  }
  const statusMap = {
    criada:               { color: 'gray',  label: 'Criada'        },
    em_andamento:         { color: 'sky',   label: 'Em Andamento'  },
    aguardando_validacao: { color: 'amber', label: 'Ag. Validação' },
    encerrada:            { color: 'green', label: 'Encerrada'     },
  }
  const prio   = prioMap[pend.prioridade] ?? prioMap.normal
  const status = statusMap[pend.status]   ?? statusMap.criada
  const resp   = pend.resp_contato?.name ?? pend.resp_interno?.name ?? pend.responsavel_grupo ?? '—'

  return (
    <div style={{ ...styles.pending.item, ...prio.border }}>
      <div style={styles.pending.title}>{pend.title}</div>
      <Tag color={prio.color}>{prio.label}</Tag>
      <Tag color={status.color}>{status.label}</Tag>
      <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resp}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.55)' }}>{fmt(pend.due_date)}</span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <button style={S.iconBtn} title="Editar" onClick={onEdit}><Icons.Pencil size={13} /></button>
          <button style={S.iconBtn} title="Remover" onClick={onDelete}><Icons.Trash2 size={13} /></button>
        </span>
      </div>
    </div>
  )
}

// ── PendForm ─────────────────────────────────────────────────────────────────
function PendForm({ contacts, profiles, onSave, onCancel, saving, initialDraft = null, showStatus = false }) {
  const [draft, setDraft] = useState(initialDraft ?? {
    title: '', desc: '', priority: 'normal', status: 'criada', due: '', respId: null, respKind: null,
  })

  const segBtnStyle = (v) => {
    if (draft.priority !== v) return S.segBtn
    const color = v === 'bloqueadora' ? '#a02020' : v === 'alta' ? '#875111' : '#173557'
    return { ...S.segBtnOn, color }
  }

  return (
    <div style={styles.pending.form}>
      <div style={styles.pending.formGrid}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Título da pendência *</label>
          <input style={S.input} placeholder="Ex.: Receber lista de lojas com horários" value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Descrição (opcional)</label>
          <textarea style={S.textarea} placeholder="Detalhes, contexto, links…" value={draft.desc} onChange={e => setDraft(p => ({ ...p, desc: e.target.value }))} />
        </div>
        <div>
          <label style={S.label}>Prioridade</label>
          <div style={S.segmented}>
            {[['bloqueadora', 'Bloqueadora'], ['alta', 'Alta'], ['normal', 'Normal']].map(([v, lbl]) => (
              <button key={v} style={segBtnStyle(v)} onClick={() => setDraft(p => ({ ...p, priority: v }))}>{lbl}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={S.label}>Data limite</label>
          <input type="date" style={S.input} value={draft.due} onChange={e => setDraft(p => ({ ...p, due: e.target.value }))} />
        </div>
        {showStatus && (
          <div>
            <label style={S.label}>Status</label>
            <select style={S.select} value={draft.status} onChange={e => setDraft(p => ({ ...p, status: e.target.value }))}>
              {PEND_STATUS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Responsável</label>
          <RespPicker contacts={contacts} profiles={profiles} selectedId={draft.respId} selectedKind={draft.respKind} onChange={(id, kind) => setDraft(p => ({ ...p, respId: id, respKind: kind }))} />
        </div>
      </div>
      <div style={styles.pending.formActions}>
        <button style={S.btnSecSm} onClick={onCancel}>Cancelar</button>
        <button style={saving ? S.btnPrimarySmDis : S.btnPrimarySm} disabled={saving} onClick={() => { if (!draft.title.trim()) { toast.error('Informe um título'); return } onSave(draft) }}>
          {saving ? 'Salvando…' : 'Salvar pendência'}
        </button>
      </div>
    </div>
  )
}

// ── ActivityItem ──────────────────────────────────────────────────────────────
function ActivityItem({ act, expanded, showPendForm, contacts, profiles, onboardingId, qc, logAction, onToggleExpand, onTogglePendForm }) {
  const [editActOpen, setEditActOpen] = useState(false)
  const [editPendId,  setEditPendId]  = useState(null)
  const [editActDraft, setEditActDraft] = useState({
    title:    act.title,
    status:   act.status,
    due:      act.due_date || '',
    respId:   act.responsible_contato_id || act.responsible_interno_id || null,
    respKind: act.responsible_contato_id ? 'contato' : act.responsible_interno_id ? 'interno' : null,
  })

  const updateActMut = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('onboarding_activities').update(payload).eq('id', act.id)
      if (error) throw error
    },
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('updated', 'onboarding_activity', act.id, act.title, { title: act.title, status: act.status, due_date: act.due_date }, payload)
    },
    onError: e => toast.error(e.message),
  })

  const deleteActMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('onboarding_activities').delete().eq('id', act.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('deleted', 'onboarding_activity', act.id, act.title, { title: act.title }, null)
      toast.success('Atividade removida')
    },
    onError: e => toast.error(e.message),
  })

  const createPendMut = useMutation({
    mutationFn: async (draft) => {
      const payload = {
        onboarding_id: onboardingId, activity_id: act.id, title: draft.title.trim(),
        description: draft.desc || null, prioridade: draft.priority, status: 'criada',
        due_date: draft.due || null,
        responsavel_contato_id: draft.respKind === 'contato' ? Number(draft.respId) : null,
        responsavel_interno_id: draft.respKind === 'interno' ? draft.respId : null,
        responsavel_grupo: !draft.respId ? 'A definir' : null,
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

  const updatePendMut = useMutation({
    mutationFn: async ({ pendId, payload }) => {
      const { error } = await supabase.from('onboarding_pendencias').update(payload).eq('id', pendId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      const target = pendencias.find(p => p.id === vars.pendId)
      logAction('updated', 'onboarding_pendencia', vars.pendId, target?.title ?? 'Pendência', target ?? null, vars.payload)
      setEditPendId(null)
      toast.success('Pendência atualizada')
    },
    onError: e => toast.error(e.message),
  })

  const deletePendMut = useMutation({
    mutationFn: async (pend) => {
      const { error } = await supabase.from('onboarding_pendencias').delete().eq('id', pend.id)
      if (error) throw error
      return pend
    },
    onSuccess: (pend) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('deleted', 'onboarding_pendencia', pend.id, pend.title, pend, null)
      toast.success('Pendência removida')
    },
    onError: e => toast.error(e.message),
  })

  const resp      = act.resp_interno?.name ?? act.resp_contato?.name ?? null
  const pendencias = act.pendencias ?? []

  function saveActivityEdit() {
    const payload = {
      title: editActDraft.title.trim(), status: editActDraft.status,
      due_date: editActDraft.due || null,
      completed_at: editActDraft.status === 'concluida' ? new Date().toISOString() : null,
      responsible_contato_id: editActDraft.respKind === 'contato' ? Number(editActDraft.respId) : null,
      responsible_interno_id: editActDraft.respKind === 'interno' ? editActDraft.respId : null,
    }
    if (!payload.title) { toast.error('Informe um título'); return }
    updateActMut.mutate(payload)
    setEditActOpen(false)
    toast.success('Atividade atualizada')
  }

  const caretStyle = { ...styles.activity.caret, transform: expanded ? 'rotate(90deg)' : 'none', color: expanded ? '#173557' : 'rgba(23,53,87,0.4)' }
  const itemStyle  = { ...styles.activity.item, ...(expanded ? { borderColor: 'rgba(89,194,237,0.5)', boxShadow: '0 4px 14px -8px rgba(89,194,237,0.4)' } : {}) }
  const statusColors = getActStatusColor(act.status)
  const todayStr = new Date().toISOString().slice(0, 10)
  const isOverdue = act.due_date && act.due_date < todayStr && act.status !== 'concluida'
  const pendingCount = pendencias.filter(p => p.status !== 'encerrada').length

  return (
    <div style={itemStyle}>
      <div style={styles.activity.row} onClick={() => onToggleExpand(act.id)}>
        <div style={caretStyle}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 2 8 6 4 10"/>
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#173557', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {act.title}
          {pendingCount > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#d99020', background: 'rgba(217,140,30,0.14)', padding: '2px 6px', borderRadius: 4 }}>{pendingCount} Pendência{pendingCount > 1 ? 's' : ''}</span>}
        </div>
        <select style={{ ...S.actStatusSel, background: statusColors.bg, color: statusColors.color, borderColor: statusColors.color }} value={act.status} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); updateActMut.mutate({ status: e.target.value, completed_at: e.target.value === 'concluida' ? new Date().toISOString() : null }) }}>
          {ACT_STATUS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {resp ? <span>{resp}{act.resp_contato && <span style={{ color: 'rgba(23,53,87,0.45)' }}> (cliente)</span>}</span> : <span style={{ color: 'rgba(23,53,87,0.4)', fontStyle: 'italic' }}>— sem responsável</span>}
        </div>
        <div style={{ fontSize: 12, color: isOverdue ? '#c44' : (act.due_date ? 'rgba(23,53,87,0.7)' : 'rgba(23,53,87,0.4)'), fontWeight: isOverdue ? 700 : 400, fontStyle: act.due_date ? 'normal' : 'italic' }}>
          {act.due_date ? `Limite ${fmt(act.due_date)}` : '— sem prazo'}
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button style={S.iconBtn} title="Editar" onClick={() => { setEditActDraft({ title: act.title, status: act.status, due: act.due_date || '', respId: act.responsible_contato_id || act.responsible_interno_id || null, respKind: act.responsible_contato_id ? 'contato' : act.responsible_interno_id ? 'interno' : null }); if (!expanded) onToggleExpand(act.id); setEditActOpen(true) }}>
            <Icons.Pencil size={13} />
          </button>
          <button style={S.iconBtn} title="Remover" onClick={() => { if (window.confirm(`Remover atividade "${act.title}"?`)) deleteActMut.mutate() }}>
            <Icons.Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={styles.activity.body}>
          {editActOpen && (
            <div style={{ ...styles.pending.form, marginBottom: 10 }}>
              <div style={styles.pending.formGrid}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Título</label>
                  <input style={S.input} value={editActDraft.title} onChange={e => setEditActDraft(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>Status</label>
                  <select style={S.select} value={editActDraft.status} onChange={e => setEditActDraft(p => ({ ...p, status: e.target.value }))}>
                    {ACT_STATUS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Data limite</label>
                  <input type="date" style={S.input} value={editActDraft.due} onChange={e => setEditActDraft(p => ({ ...p, due: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Responsável</label>
                  <RespPicker contacts={contacts} profiles={profiles} selectedId={editActDraft.respId} selectedKind={editActDraft.respKind} onChange={(id, kind) => setEditActDraft(p => ({ ...p, respId: id, respKind: kind }))} />
                </div>
              </div>
              <div style={styles.pending.formActions}>
                <button style={S.btnSecSm} onClick={() => setEditActOpen(false)}>Cancelar</button>
                <button style={updateActMut.isPending ? S.btnPrimarySmDis : S.btnPrimarySm} onClick={saveActivityEdit} disabled={updateActMut.isPending}>Salvar</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendências ({pendencias.length})</div>
            <button style={S.btnLink} onClick={() => onTogglePendForm(act.id, !showPendForm)}>{showPendForm ? '× Fechar formulário' : '+ Nova Pendência'}</button>
          </div>

          {pendencias.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendencias.map(p => (
                <div key={p.id}>
                  <PendingItem pend={p} onEdit={() => setEditPendId(prev => prev === p.id ? null : p.id)} onDelete={() => { if (window.confirm(`Remover pendência "${p.title}"?`)) deletePendMut.mutate(p) }} />
                  {editPendId === p.id && (
                    <PendForm
                      contacts={contacts} profiles={profiles}
                      initialDraft={{ title: p.title || '', desc: p.description || '', priority: p.prioridade || 'normal', status: p.status || 'criada', due: p.due_date || '', respId: p.responsavel_contato_id || p.responsavel_interno_id || null, respKind: p.responsavel_contato_id ? 'contato' : p.responsavel_interno_id ? 'interno' : null }}
                      showStatus
                      onSave={draft => updatePendMut.mutate({ pendId: p.id, payload: { title: draft.title.trim(), description: draft.desc || null, prioridade: draft.priority, status: draft.status, due_date: draft.due || null, responsavel_contato_id: draft.respKind === 'contato' ? Number(draft.respId) : null, responsavel_interno_id: draft.respKind === 'interno' ? draft.respId : null, responsavel_grupo: !draft.respId ? 'A definir' : null } })}
                      onCancel={() => setEditPendId(null)}
                      saving={updatePendMut.isPending}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (!showPendForm && <div style={styles.pending.empty}>Nenhuma pendência registrada nesta atividade.</div>)}

          {showPendForm && (
            <PendForm contacts={contacts} profiles={profiles} onSave={draft => createPendMut.mutate(draft)} onCancel={() => onTogglePendForm(act.id, false)} saving={createPendMut.isPending} />
          )}
        </div>
      )}
    </div>
  )
}

// ── CatalogSearch ─────────────────────────────────────────────────────────────
function CatalogSearch({ actTypes, activities, onboardingId, targetFaseId, qc, logAction, user }) {
  const [search, setSearch] = useState('')
  const [showDd, setShowDd] = useState(false)
  const inputRef = useRef()
  const ddRef    = useRef()

  const usedNames  = new Set(activities.map(a => a.title.toLowerCase()))
  const filtered   = actTypes.filter(t => (!search || t.name.toLowerCase().includes(search.toLowerCase())) && !usedNames.has(t.name.toLowerCase()))
  const exactMatch = actTypes.some(t => t.name.toLowerCase() === search.trim().toLowerCase())

  useEffect(() => {
    function handler(e) {
      if (ddRef.current && !ddRef.current.contains(e.target) && !inputRef.current?.contains(e.target)) setShowDd(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addActMut = useMutation({
    mutationFn: async (option) => {
      let type = option
      if (option?.__new) {
        const { data: created, error: typeErr } = await supabase.from('onboarding_activity_types').insert({ name: option.name.trim(), active: true }).select('id, name').single()
        if (typeErr) throw typeErr
        type = created
      }
      const payload = { onboarding_id: onboardingId, activity_type_id: type.id, title: type.name, fase_id: targetFaseId ?? null, status: 'pendente', due_date: null, responsible_contato_id: null, responsible_interno_id: null, created_by: user?.id ?? null, display_order: activities.length }
      const { data, error } = await supabase.from('onboarding_activities').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['onb_activities', onboardingId] })
      logAction('create_activity', 'onboarding_activity', data.id, data.title, null, { onboarding_id: onboardingId })
      toast.success(`Atividade adicionada: ${data.title}`)
      setSearch(''); setShowDd(false)
    },
    onError: e => toast.error(e.message),
  })

  if (!targetFaseId) {
    return <div style={{ padding: '8px 2px 12px', fontSize: 13, color: 'rgba(23,53,87,0.5)', fontStyle: 'italic' }}>Selecione uma fase para adicionar atividades</div>
  }

  return (
    <div>
      <div style={styles.activity.searchWrap}>
        <span style={styles.activity.searchIcon}><Icons.Search size={14} /></span>
        <input id="onb-cat-input" ref={inputRef} style={styles.activity.search} placeholder="Buscar no catálogo de atividades…" value={search} onChange={e => { setSearch(e.target.value); setShowDd(true) }} onFocus={() => setShowDd(true)} autoComplete="off" />
        {showDd && (
          <div style={styles.activity.catalogDropdown} ref={ddRef}>
            {filtered.map(t => (
              <div key={t.id} style={styles.activity.catalogItem} onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'} onMouseLeave={e => e.currentTarget.style.background = ''} onClick={() => addActMut.mutate(t)}>
                <span>{t.name}</span>
                <span style={{ fontSize: 10, color: 'rgba(23,53,87,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catálogo</span>
              </div>
            ))}
            {search.trim() && !exactMatch && (
              <div style={styles.activity.catalogItem} onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'} onMouseLeave={e => e.currentTarget.style.background = ''} onClick={() => addActMut.mutate({ __new: true, name: search.trim() })}>
                <span>Criar atividade: <strong>{search.trim()}</strong></span>
                <span style={{ fontSize: 10, color: '#0a6a96', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Novo</span>
              </div>
            )}
            {filtered.length === 0 && (!search.trim() || exactMatch) && (
              <div style={{ padding: 10, fontSize: 12, color: 'rgba(23,53,87,0.55)', textAlign: 'center' }}>Todas as atividades do catálogo já foram adicionadas</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── FaseMgmtPanel — drag and drop + toggles + criar nova fase ────────────────
function FaseMgmtPanel({ fases, faseTypes, onboardingId, qc, onClose }) {
  const [search, setSearch]         = useState('')
  const [localFases, setLocalFases] = useState(fases)

  useEffect(() => { setLocalFases(fases) }, [fases])

  const usedTypeIds = new Set(localFases.map(f => f.fase_type_id))
  const available   = faseTypes.filter(t => !usedTypeIds.has(t.id) && (!search || t.name.toLowerCase().includes(search.toLowerCase())))
  const exactMatch  = faseTypes.some(t => t.name.toLowerCase() === search.trim().toLowerCase())
  const showCreate  = search.trim() && !exactMatch

  const reorderMut = useMutation({
    mutationFn: async (orderedIds) => {
      await Promise.all(orderedIds.map((faseId, idx) => supabase.from('onboarding_fases').update({ display_order: idx + 1 }).eq('id', faseId)))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] }),
    onError: e => toast.error(e.message),
  })

  const addFaseMut = useMutation({
    mutationFn: async (faseType) => {
      const maxOrder = localFases.length > 0 ? Math.max(...localFases.map(f => f.display_order ?? 0)) : 0
      const { data, error } = await supabase.from('onboarding_fases')
        .insert({ onboarding_id: onboardingId, fase_type_id: faseType.id, display_order: maxOrder + 1, status: 'pendente', evidence_required: faseType.requires_evidence })
        .select('*, onboarding_fase_types(*)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] }); toast.success('Fase adicionada'); setSearch('') },
    onError: e => toast.error(e.message),
  })

  const createFaseMut = useMutation({
    mutationFn: async (name) => {
      const maxTypeOrder = faseTypes.length > 0 ? Math.max(...faseTypes.map(t => t.display_order ?? 0)) : 0
      const { data: newType, error: typeErr } = await supabase
        .from('onboarding_fase_types')
        .insert({ name: name.trim(), active: true, display_order: maxTypeOrder + 1, is_milestone: false, requires_evidence: false })
        .select('id, name, is_milestone, requires_evidence, display_order, active')
        .single()
      if (typeErr) throw typeErr
      const maxOrder = localFases.length > 0 ? Math.max(...localFases.map(f => f.display_order ?? 0)) : 0
      const { data: newFase, error: faseErr } = await supabase
        .from('onboarding_fases')
        .insert({ onboarding_id: onboardingId, fase_type_id: newType.id, display_order: maxOrder + 1, status: 'pendente', evidence_required: false })
        .select('*, onboarding_fase_types(*)')
        .single()
      if (faseErr) throw faseErr
      return { newType, newFase }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['onb_fase_types'] })
      toast.success('Fase criada e adicionada')
      setSearch('')
    },
    onError: e => toast.error(e.message),
  })

  const removeFaseMut = useMutation({
    mutationFn: async (faseId) => {
      const { error } = await supabase.from('onboarding_fases').delete().eq('id', faseId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] }); toast.success('Fase removida') },
    onError: e => toast.error(e.message),
  })

  const updateTypeMut = useMutation({
    mutationFn: async ({ typeId, updates }) => {
      const { error } = await supabase.from('onboarding_fase_types').update(updates).eq('id', typeId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['onb_fase_types'] })
    },
    onError: e => toast.error(e.message),
  })

  const updateFaseInstMut = useMutation({
    mutationFn: async ({ faseId, updates }) => {
      const { error } = await supabase.from('onboarding_fases').update(updates).eq('id', faseId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] }),
    onError: e => toast.error(e.message),
  })

  function onDragEnd(result) {
    if (!result.destination) return
    const items = Array.from(localFases)
    const [moved] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, moved)
    setLocalFases(items)
    reorderMut.mutate(items.map(f => f.id))
  }

  const statusLabel = (s) => s === 'concluida' ? 'Concluída' : s === 'ativa' ? 'Ativa' : 'Pendente'
  const statusColor = (s) => s === 'concluida' ? 'green' : s === 'ativa' ? 'sky' : 'gray'

  const catalogItemStyle = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
    borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(15,34,58,0.08)', background: '#fff',
  }

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid rgba(15,34,58,0.08)', paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#173557' }}>Personalizar fases deste projeto</div>
        <button style={S.btnLink} onClick={onClose}>Fechar</button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="fases-list">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {localFases.map((f, idx) => (
                <Draggable key={f.id} draggableId={String(f.id)} index={idx}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                        background: snapshot.isDragging ? '#edf4fa' : '#f8f9fb',
                        borderRadius: 8,
                        border: snapshot.isDragging ? '1px solid rgba(89,194,237,0.4)' : '1px solid transparent',
                        ...provided.draggableProps.style,
                      }}
                    >
                      <div {...provided.dragHandleProps} style={{ cursor: 'grab', color: 'rgba(23,53,87,0.3)', flexShrink: 0, display: 'flex' }}>
                        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                          <circle cx="3" cy="2" r="1.5"/><circle cx="7" cy="2" r="1.5"/>
                          <circle cx="3" cy="7" r="1.5"/><circle cx="7" cy="7" r="1.5"/>
                          <circle cx="3" cy="12" r="1.5"/><circle cx="7" cy="12" r="1.5"/>
                        </svg>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#173557', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phaseName(f)}</span>
                      {/* is_milestone toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(23,53,87,0.55)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Toggle
                          checked={!!f.onboarding_fase_types?.is_milestone}
                          onChange={(val) => updateTypeMut.mutate({ typeId: f.fase_type_id, updates: { is_milestone: val } })}
                          title="Afeta todos os projetos com este tipo de fase"
                        />
                        Marco
                      </div>
                      {/* evidence_required toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(23,53,87,0.55)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Toggle
                          checked={!!f.evidence_required}
                          onChange={(val) => updateFaseInstMut.mutate({ faseId: f.id, updates: { evidence_required: val } })}
                        />
                        Evidência
                      </div>
                      {/* allows_attachments toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(23,53,87,0.55)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Toggle
                          checked={!!f.allows_attachments}
                          onChange={(val) => updateFaseInstMut.mutate({ faseId: f.id, updates: { allows_attachments: val } })}
                        />
                        Anexos
                      </div>
                      <Tag color={statusColor(f.status)}>{statusLabel(f.status)}</Tag>
                      {f.status === 'pendente' ? (
                        <button style={{ ...S.btnLink, color: '#b42828', flexShrink: 0 }} disabled={removeFaseMut.isPending} onClick={() => { if (window.confirm(`Remover fase "${phaseName(f)}"?`)) removeFaseMut.mutate(f.id) }}>Remover</button>
                      ) : (
                        <span style={{ width: 52, flexShrink: 0 }} />
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div>
        <label style={S.label}>Adicionar fase</label>
        <input
          style={{ ...S.input, marginBottom: 6 }}
          placeholder="Buscar ou criar tipo de fase…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {showCreate && (
            <div
              style={catalogItemStyle}
              onMouseEnter={e => { e.currentTarget.style.background = '#f4f5f7' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
              onClick={() => { if (!createFaseMut.isPending) createFaseMut.mutate(search.trim()) }}
            >
              <span style={{ fontSize: 12, color: '#173557', flex: 1 }}>Criar fase: <strong>{search.trim()}</strong></span>
              <span style={{ fontSize: 11, color: '#0a6a96', fontWeight: 500 }}>Novo</span>
            </div>
          )}
          {available.map(t => (
            <div
              key={t.id}
              style={{ ...catalogItemStyle, cursor: addFaseMut.isPending ? 'default' : 'pointer' }}
              onClick={() => { if (!addFaseMut.isPending) addFaseMut.mutate(t) }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f4f5f7' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            >
              <span style={{ fontSize: 12, color: '#173557', flex: 1 }}>{t.name}</span>
              {t.is_milestone    && <Tag color="sky">Marco</Tag>}
              {t.requires_evidence && <Tag color="amber">Evidência</Tag>}
              <span style={{ fontSize: 11, color: '#0a6a96', fontWeight: 500 }}>+ Adicionar</span>
            </div>
          ))}
          {!showCreate && available.length === 0 && (
            <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.5)', padding: '6px 2px' }}>
              {search ? 'Nenhum tipo encontrado' : 'Todos os tipos já estão neste projeto'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OnboardingDetailPage() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const qc            = useQueryClient()
  const { user, isAdmin } = useAuth()
  const { logAction }   = useAuditLog()
  const deleteProject   = useDeleteProject()

  const { data: project, isLoading, error } = useProjectDetail(id)
  const onboardingId = project?.onboarding_id
  const clientId     = project?.client?.id

  const { data: onboarding, isLoading: onboardingLoading, error: onboardingError } = useOnboarding(onboardingId)
  const { data: activities = [], isLoading: actsLoading } = useActivities(onboardingId)
  const { data: actTypes   = [] }                          = useActivityTypes()
  const { data: contacts   = [] }                          = useContacts(clientId ? { client_id: clientId } : {})
  const { data: profiles   = [] }                          = useProfiles()
  const { data: faseTypes  = [] }                          = useFaseTypes()

  const [editModalOpen,   setEditModalOpen]   = useState(false)
  const [openFaseId,      setOpenFaseId]      = useState(null)
  const [expandedActs,    setExpandedActs]    = useState(new Set())
  const [showPendForms,   setShowPendForms]   = useState(new Set())
  const [selectedFaseTab, setSelectedFaseTab] = useState(null)
  const [showFaseMgmt,    setShowFaseMgmt]    = useState(false)
  const faseTabInitialized = useRef(false)

  const orderedFases      = (onboarding?.onboarding_fases ?? []).slice().sort((a, b) => a.display_order - b.display_order)
  const faseAtualId       = onboarding?.fase_atual_id ?? orderedFases[0]?.id ?? null
  const currentPhaseIndex = Math.max(0, orderedFases.findIndex(f => f.id === faseAtualId))
  const activeFaseId = orderedFases.find(f => f.status === 'ativa')?.id ?? faseAtualId

  useEffect(() => {
    if (faseTabInitialized.current) return
    if (orderedFases.length > 0) {
      const faseAtiva = orderedFases.find(f => f.status === 'ativa')
      if (faseAtiva) {
        setSelectedFaseTab(faseAtiva.id)
        faseTabInitialized.current = true
      }
    }
  }, [orderedFases])

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

  if (isLoading || (onboardingId && onboardingLoading)) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><p style={{ color: 'rgba(23,53,87,0.55)', fontSize: 14 }}>Carregando…</p></div>
  }
  if (error || !project) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}><p style={{ color: '#b42828', fontSize: 14 }}>Projeto não encontrado.</p><button style={S.btnBack} onClick={() => navigate('/projetos')}>← Voltar</button></div>
  }
  if (onboardingError) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}><p style={{ color: '#b42828', fontSize: 14 }}>Onboarding vinculado não encontrado.</p><button style={S.btnBack} onClick={() => navigate('/projetos')}>← Voltar</button></div>
  }

  const onb        = onboarding
  const fases      = orderedFases
  const caps       = onb?.onboarding_capabilities ?? []
  const visibleActs = selectedFaseTab ? activities.filter(a => a.fase_id === selectedFaseTab) : activities
  const clientName  = project.client?.fantasy_name || project.client?.name || '—'
  const totalSteps  = fases.length
  const doneSteps   = fases.filter(f => f.status === 'concluida').length

  const situacaoMap = {
    fluindo: { color: 'green', label: 'Fluindo', dot: true  },
    atencao: { color: 'amber', label: 'Atenção',  dot: false },
    travado: { color: 'red',   label: 'Travado',  dot: false },
  }
  const situacao     = situacaoMap[onb?.situacao_geral] ?? situacaoMap.fluindo
  const openFase     = openFaseId ? fases.find(f => f.id === openFaseId) : null
  const contextLabel = FASE_LABELS[onb?.context] ?? onb?.context ?? ''

  const projectTypeLabel = project?.type ? { onboarding: 'Onboarding', expansao: 'Expansão', interno: 'Interno' }[project.type] : ''

  const goLiveFase = fases.find(f => f.fase_type_id === FASE_TYPE_IDS.GOLIVE)
  const startDateLabel = onb?.start_date ? fmt(onb.start_date) : '—'
  const goLiveLabel = goLiveFase?.planned_end ? fmt(goLiveFase.planned_end) : 'a definir'

  const capsServico = caps.filter(c => c.catalog_item?.type === 'servico')
  const capsSolucao = caps.filter(c => c.catalog_item?.type === 'solucao')

  function renderCapChip(cap, i) {
    const item = cap.catalog_item
    if (!item) return null
    const palette = CAP_PALETTE[i % CAP_PALETTE.length]
    return (
      <span key={cap.id} style={{ ...S.capChipBase, ...palette }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block', flexShrink: 0 }} />
        {item.name}
      </span>
    )
  }

  return (
    <>
      <div style={{ background: '#f4f5f7', minHeight: '100vh', paddingBottom: 60 }}>

        <div style={{ background: '#fff', borderBottom: '1px solid rgba(15,34,58,0.07)', padding: '10px 32px' }}>
          <span style={{ fontSize: 13, color: 'rgba(23,53,87,0.6)' }}>
            <strong style={{ color: '#173557' }}>Projetos</strong>
            <span style={{ margin: '0 6px', color: 'rgba(23,53,87,0.35)' }}>/</span>
            <span style={{ color: '#173557' }}>{project.title}</span>
          </span>
        </div>

        <div style={{ padding: '22px 28px 60px' }}>

          <button style={S.btnBack} onClick={() => navigate('/projetos')}>← Projetos</button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: '#173557' }}>{project.title}</h1>
              <div style={{ fontSize: 13, color: '#0a6a96', fontWeight: 500, marginTop: 4 }}>{clientName}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {projectTypeLabel && <Tag color="amber">{projectTypeLabel}</Tag>}
                {contextLabel && <Tag color="sky">{contextLabel}</Tag>}
                {onb && <Tag color={situacao.color}>{situacao.dot && <span style={S.liveDot} />}{situacao.label}</Tag>}
                {onb?.csm && <Tag color="gray">CSM: {onb.csm.name}</Tag>}
              </div>
              {onb && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 12, color: 'rgba(23,53,87,0.65)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icons.Calendar size={12} />
                    Início: {startDateLabel}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icons.Calendar size={12} />
                    Go-Live previsto: {goLiveLabel}
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {isAdmin && (
                <button
                  style={{ ...S.btnSec, color: '#b42828', borderColor: 'rgba(180,40,40,0.25)' }}
                  onClick={() => {
                    if (!window.confirm(`Tem certeza que deseja excluir o projeto "${project.title}"? Esta ação não pode ser desfeita.`)) return
                    deleteProject.mutate({ id: project.id, onboarding_id: project.onboarding_id, title: project.title })
                  }}
                >
                  Excluir projeto
                </button>
              )}
              <button style={S.btnSec} onClick={() => setEditModalOpen(true)}>Editar projeto</button>
            </div>
          </div>

          {/* timeline */}
          {onb && (
            <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#173557', display: 'flex', alignItems: 'center', gap: 10 }}>
                  Linha do tempo
                  <span style={{ color: 'rgba(23,53,87,0.55)', fontWeight: 500 }}>— fases e milestones</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Tag color="gray">{doneSteps} de {totalSteps} etapas concluídas</Tag>
                  <button style={S.btnSecSm} onClick={() => setShowFaseMgmt(p => !p)}>
                    {showFaseMgmt ? 'Fechar' : 'Gerenciar fases'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8, gap: 0 }}>
                {fases.map((fase, idx) => {
                  const isActive = fase.id === faseAtualId || (!faseAtualId && fase.status === 'ativa')
                  const isDone   = fase.status === 'concluida'
                  const isLast   = idx === fases.length - 1
                  const next     = fases[idx + 1]
                  return (
                    <div key={fase.id} style={{ display: 'contents' }}>
                      <PhaseCircle
                        fase={fase}
                        isActive={isActive}
                        isDone={isDone}
                        onClick={() => setOpenFaseId(prev => prev === fase.id ? null : fase.id)}
                      />
                      {!isLast && <Connector leftDone={isDone} rightActive={!!(next?.id === faseAtualId || next?.status === 'ativa')} />}
                    </div>
                  )
                })}
              </div>

              {showFaseMgmt && (
                <FaseMgmtPanel
                  fases={orderedFases}
                  faseTypes={faseTypes}
                  onboardingId={onboardingId}
                  qc={qc}
                  onClose={() => setShowFaseMgmt(false)}
                />
              )}
            </div>
          )}

          {/* activities */}
          <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#173557' }}>Atividades</div>
              <button style={S.btnPrimarySm} onClick={() => document.getElementById('onb-cat-input')?.focus()}>+ Adicionar Atividade</button>
            </div>

            {fases.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                <button style={selectedFaseTab === null ? S.segBtnAtiva : S.segBtn} onClick={() => setSelectedFaseTab(null)}>Todas</button>
                {fases.map(f => (
                  <button key={f.id} style={{ 
                    ...(selectedFaseTab === f.id ? S.segBtnAtiva : S.segBtn), 
                    whiteSpace: 'nowrap' 
                  }} onClick={() => setSelectedFaseTab(f.id)}>
                    {phaseName(f)}
                  </button>
                ))}
              </div>
            )}

            {onb && (
              <CatalogSearch
                actTypes={actTypes}
                activities={activities}
                onboardingId={onboardingId}
                targetFaseId={selectedFaseTab ?? faseAtualId}
                qc={qc}
                logAction={logAction}
                user={user}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actsLoading ? (
                <p style={{ fontSize: 13, color: 'rgba(23,53,87,0.5)', padding: '16px 0' }}>Carregando atividades…</p>
              ) : visibleActs.length === 0 ? (
                <div style={styles.pending.empty}>
                  {selectedFaseTab ? 'Nenhuma atividade nesta fase.' : 'Nenhuma atividade. Adicione uma do catálogo acima.'}
                </div>
              ) : (
                visibleActs.map(act => (
                  <ActivityItem
                    key={act.id} act={act}
                    expanded={expandedActs.has(act.id)}
                    showPendForm={showPendForms.has(act.id)}
                    contacts={contacts} profiles={profiles}
                    onboardingId={onboardingId} qc={qc} logAction={logAction}
                    onToggleExpand={toggleExpand} onTogglePendForm={togglePendForm}
                  />
                ))
              )}
            </div>
          </div>

          {/* capabilities */}
          {caps.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#173557', marginBottom: 16 }}>Capacidades contratadas</div>

              {capsServico.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(23,53,87,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Serviços</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {capsServico.map((cap, i) => renderCapChip(cap, i))}
                  </div>
                </div>
              )}

              {capsServico.length > 0 && capsSolucao.length > 0 && (
                <div style={{ height: 1, background: 'rgba(15,34,58,0.06)', margin: '12px 0' }} />
              )}

              {capsSolucao.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(23,53,87,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Soluções</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {capsSolucao.map((cap, i) => renderCapChip(cap, i))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {openFase && (
        <FasePanel
          fase={openFase}
          orderedFases={orderedFases}
          onboardingId={onboardingId}
          onClose={() => setOpenFaseId(null)}
          user={user}
          clientId={clientId}
          qc={qc}
          logAction={logAction}
          activities={activities}
          onboardingTitle={project?.title ?? ''}
          onboarding={onboarding}
        />
      )}

      {editModalOpen && (
        <ProjectModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} clientId={clientId} project={project} />
      )}
    </>
  )
}
