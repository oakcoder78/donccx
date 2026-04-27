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
import { styles } from '../components/onboarding/OnboardingStyles'
import { ActionIcons, ActivityIcons } from '../lib/icons'

// ── Local style constants (values not covered by OnboardingStyles.js) ─────────
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
  phaseBox:       { flex: '1 1 230px', minWidth: 230, background: '#fff', border: '1px solid rgba(15,34,58,0.10)', borderRadius: 12, padding: '12px 14px 10px', margin: '14px 0', display: 'flex', flexDirection: 'column', transition: 'all 0.18s ease' },
  phaseBoxActive: { flex: '1 1 230px', minWidth: 230, background: 'linear-gradient(180deg,#fff,#f4fbfe)', border: '1px solid #59c2ed', borderRadius: 12, padding: '12px 14px 10px', margin: '14px 0', display: 'flex', flexDirection: 'column', transition: 'all 0.18s ease', boxShadow: '0 0 0 3px rgba(89,194,237,0.18),0 6px 18px -10px rgba(89,194,237,0.4)' },
  phaseBoxDone:   { flex: '1 1 230px', minWidth: 230, background: '#f6fbf8', border: '1px solid rgba(34,160,98,0.32)', borderRadius: 12, padding: '12px 14px 10px', margin: '14px 0', display: 'flex', flexDirection: 'column', transition: 'all 0.18s ease' },
  phaseBoxFuture: { flex: '1 1 230px', minWidth: 230, background: '#fff', border: '1px solid rgba(15,34,58,0.10)', borderRadius: 12, padding: '12px 14px 10px', margin: '14px 0', display: 'flex', flexDirection: 'column', transition: 'all 0.18s ease', opacity: 0.55 },
  phaseMiniBtn:      { background: 'transparent', border: 'none', padding: '3px 6px', fontSize: 11, color: 'rgba(23,53,87,0.6)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' },
  phaseMiniBtnDis:   { background: 'transparent', border: 'none', padding: '3px 6px', fontSize: 11, color: 'rgba(23,53,87,0.25)', borderRadius: 5, cursor: 'not-allowed', fontFamily: 'inherit' },
  phaseMiniFwd:      { background: 'transparent', border: 'none', padding: '3px 6px', fontSize: 11, color: '#0a6a96', fontWeight: 500, borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' },
  phaseMiniFwdDis:   { background: 'transparent', border: 'none', padding: '3px 6px', fontSize: 11, color: 'rgba(23,53,87,0.25)', fontWeight: 500, borderRadius: 5, cursor: 'not-allowed', fontFamily: 'inherit' },
  actStatusSel: { padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid rgba(15,34,58,0.12)', background: '#fff', color: '#173557', fontFamily: 'inherit', width: '100%', outline: 'none' },
  capChipBase:  { fontSize: 12, fontWeight: 500, padding: '5px 11px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 },
  msPanelGrid:     { display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, marginBottom: 12 },
  msPanelGridFull: { display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 12 },
  msPanelActions:  { display: 'flex', gap: 8, justifyContent: 'flex-end' },
}

function Tag({ color, children, style: extra }) {
  return <span style={{ ...S.tag, ...S.tagColors[color], ...extra }}>{children}</span>
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PEND_STATUS = [
  { v: 'criada',               label: 'Criada'         },
  { v: 'em_andamento',         label: 'Em Andamento'   },
  { v: 'aguardando_validacao', label: 'Ag. Validação'  },
  { v: 'encerrada',            label: 'Encerrada'      },
]

const ACT_STATUS = [
  { v: 'pendente',     label: 'Pendente'     },
  { v: 'em_andamento', label: 'Em Andamento' },
  { v: 'concluida',    label: 'Concluída'    },
]

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
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}
function phaseName(fase) {
  return fase?.onboarding_fase_types?.name || `Fase ${fase?.display_order ?? '—'}`
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
        .select('id, name, is_milestone, requires_evidence, display_order, active')
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
        style={{
          ...S.select, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ color: selectedName ? '#173557' : 'rgba(23,53,87,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedName || '— Selecionar responsável —'}
        </span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="2 4 6 8 10 4"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', border: '1px solid rgba(15,34,58,0.12)',
          borderRadius: 9, boxShadow: '0 8px 24px rgba(10,22,40,0.14)',
          zIndex: 300, maxHeight: 220, overflowY: 'auto', padding: '4px',
        }}>
          {contacts.length > 0 && (
            <>
              <div style={styles.respPicker.section}>Contatos do cliente</div>
              {contacts.map(c => {
                const sel = selectedId === c.id && selectedKind === 'contato'
                return (
                  <div
                    key={c.id}
                    style={{ ...styles.respPicker.option, ...(sel ? styles.respPicker.optionSelected : {}) }}
                    onClick={() => { onChange(c.id, 'contato', c.name); setOpen(false) }}
                  >
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
              <div
                key={p.id}
                style={{ ...styles.respPicker.option, ...(sel ? styles.respPicker.optionSelected : {}) }}
                onClick={() => { onChange(p.id, 'interno', p.name); setOpen(false) }}
              >
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

// ── PhaseCircle ───────────────────────────────────────────────────────────────
function PhaseCircle({ fase, isActive, isDone, isLastPhase, onMilestoneClick, onAdvance, onRevert }) {
  const isMilestone = !!fase.onboarding_fase_types?.is_milestone
  const canClick    = isMilestone && (isDone || isActive)
  const canRevert   = !isMilestone && fase.display_order > 1
  const canAdvance  = !isMilestone && !isLastPhase

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 72, maxWidth: 96 }}>
      <div
        onClick={canClick ? onMilestoneClick : undefined}
        style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `2.5px solid ${circleBorder}`,
          background: circleBg, color: circleColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
          cursor: canClick ? 'pointer' : 'default',
          boxShadow: circleShadow,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
      >
        {isDone ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 8.5 6.5 12 13 4.5"/>
          </svg>
        ) : isMilestone ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2.5" y="1" width="11" height="14" rx="2"/>
            <line x1="5" y1="5.5" x2="11" y2="5.5"/>
            <line x1="5" y1="8" x2="11" y2="8"/>
            <line x1="5" y1="10.5" x2="8.5" y2="10.5"/>
          </svg>
        ) : isActive ? (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#59c2ed' }} />
        ) : null}
      </div>

      <div style={{ fontSize: 11, textAlign: 'center', fontWeight: isDone || isActive ? 600 : 400, color: labelColor, lineHeight: 1.3, maxWidth: 88, wordBreak: 'break-word' }}>
        {phaseName(fase)}
      </div>

      <div style={{ fontSize: 10, textAlign: 'center', color: 'rgba(23,53,87,0.5)', lineHeight: 1.3 }}>
        {isDone
          ? fmt(fase.occurred_at ?? fase.actual_end)
          : fase.planned_start ? `Prev. ${fmt(fase.planned_start)}` : '—'}
      </div>

      {isActive && !isMilestone && (
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            style={{ fontSize: 10, background: 'transparent', border: 'none', padding: '2px 5px', borderRadius: 4, fontFamily: 'inherit', cursor: canRevert ? 'pointer' : 'default', color: canRevert ? 'rgba(23,53,87,0.6)' : 'rgba(23,53,87,0.25)' }}
            disabled={!canRevert}
            onClick={e => { e.stopPropagation(); if (canRevert) onRevert() }}
          >
            ← Voltar
          </button>
          <button
            style={{ fontSize: 10, background: 'transparent', border: 'none', padding: '2px 5px', borderRadius: 4, fontFamily: 'inherit', cursor: canAdvance ? 'pointer' : 'default', color: canAdvance ? '#0a6a96' : 'rgba(23,53,87,0.25)', fontWeight: 500 }}
            disabled={!canAdvance}
            onClick={e => { e.stopPropagation(); if (canAdvance) onAdvance() }}
          >
            Avançar →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Connector ─────────────────────────────────────────────────────────────────
function Connector({ leftDone, rightActive }) {
  const bg = leftDone && rightActive
    ? 'linear-gradient(90deg, #1aa56a, #59c2ed)'
    : leftDone ? '#1aa56a' : '#d4d3ce'
  return (
    <div style={{ flex: 1, minWidth: 10, height: 2, background: bg, marginTop: 23, flexShrink: 0, alignSelf: 'flex-start' }} />
  )
}

// ── MilestonePanel ────────────────────────────────────────────────────────────
function MilestonePanel({ ms, onClose, onConfirm, onReopen, saving, user, clientId, qc }) {
  const isDone = ms.status === 'concluida' || !!ms.occurred_at
  const fileRef = useRef()
  const [form, setForm] = useState({
    date:  ms.occurred_at?.slice(0, 10) ?? '',
    link:  '',
    notes: ms.justificativa ?? '',
    file:  null,
  })
  const [savingJust, setSavingJust] = useState(false)
  const canConfirm = form.date && (form.notes.trim() || form.link.trim() || form.file)

  const { data: evidencias = [] } = useQuery({
    queryKey: ['ms_evidencias', ms.id],
    enabled: !!ms.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_evidencias')
        .select('*, uploaded_by:profiles!uploaded_by(id, name)')
        .eq('fase_id', ms.id)
      if (error) { console.error('[ms_evidencias]', error); return [] }
      return (data ?? []).filter(e => !e.is_deleted)
    },
  })

  async function handleViewEvidence(ev) {
    const { data, error } = await supabase.storage
      .from('activity-attachments')
      .createSignedUrl(ev.storage_path, 3600)
    if (error) { toast.error('Erro ao gerar link'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function handleDeleteEvidence(ev) {
    if (!window.confirm(`Remover evidência "${ev.file_name}"?`)) return
    const { error: storErr } = await supabase.storage
      .from('activity-attachments')
      .remove([ev.storage_path])
    if (storErr) { toast.error(storErr.message); return }
    const { error: dbErr } = await supabase
      .from('onboarding_evidencias')
      .update({ is_deleted: true })
      .eq('id', ev.id)
    if (dbErr) { toast.error(dbErr.message); return }
    if (qc) qc.invalidateQueries({ queryKey: ['ms_evidencias', ms.id] })
    toast.success('Evidência removida')
  }

  async function handleSaveJustificativa() {
    setSavingJust(true)
    const { error } = await supabase.from('onboarding_fases')
      .update({ justificativa: form.notes || null })
      .eq('id', ms.id)
    setSavingJust(false)
    if (error) { toast.error(error.message); return }
    if (qc) qc.invalidateQueries({ queryKey: ['onboarding', ms.onboarding_id] })
    toast.success('Justificativa salva')
  }

  return (
    <div style={styles.timeline.milestonePanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#173557' }}>
          {isDone ? 'Marco concluído' : 'Registrar conclusão'} — {phaseName(ms)}
        </div>
        <button style={S.iconBtn} onClick={onClose} title="Fechar">
          <ActionIcons.remove size={14} />
        </button>
      </div>

      {evidencias.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Evidências ({evidencias.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {evidencias.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f8f9fb', borderRadius: 7 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="rgba(23,53,87,0.55)" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="2.5" y="1" width="11" height="14" rx="2"/>
                  <line x1="5" y1="5.5" x2="11" y2="5.5"/>
                  <line x1="5" y1="8" x2="11" y2="8"/>
                  <line x1="5" y1="10.5" x2="8.5" y2="10.5"/>
                </svg>
                <span style={{ flex: 1, fontSize: 12, color: '#173557', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.file_name}</span>
                <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)', whiteSpace: 'nowrap' }}>{ev.uploaded_by?.name ?? '—'}</span>
                <button style={S.btnLink} onClick={() => handleViewEvidence(ev)}>Ver</button>
                <button style={{ ...S.btnLink, color: '#b42828' }} onClick={() => handleDeleteEvidence(ev)}>Remover</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.msPanelGrid}>
        <div>
          <label style={S.label}>Data de realização</label>
          <input type="date" style={S.input} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div>
          <label style={S.label}>Evidência (link ou documento)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="url"
              style={{ ...S.input, flex: 1 }}
              placeholder="https://…"
              value={form.link}
              onChange={e => setForm(p => ({ ...p, link: e.target.value }))}
            />
            <button
              style={{ ...S.iconBtn, width: 'auto', padding: '4px 8px', border: '1px solid #d4d3ce', borderRadius: 6, fontSize: 11, color: '#173557', whiteSpace: 'nowrap', flexShrink: 0, gap: 4, display: 'inline-flex', alignItems: 'center' }}
              onClick={() => fileRef.current?.click()}
              title={form.file ? form.file.name : 'Anexar arquivo'}
            >
              <ActionIcons.attachment size={12} />
              {form.file ? form.file.name.slice(0, 14) : '+ Arquivo'}
            </button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setForm(p => ({ ...p, file: e.target.files?.[0] ?? null }))} />
          </div>
        </div>
      </div>

      <div style={S.msPanelGridFull}>
        <div>
          <label style={S.label}>Justificativa / observações</label>
          <textarea
            style={S.textarea}
            placeholder="Ex.: reunião realizada com presença de toda equipe operacional…"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </div>

      <div style={S.msPanelActions}>
        <button style={S.btnSecSm} onClick={onClose}>Cancelar</button>
        {isDone ? (
          <>
            <button style={S.btnSecSm} onClick={onReopen} disabled={saving}>
              {saving ? 'Aguarde…' : 'Reabrir marco'}
            </button>
            <button style={savingJust ? S.btnPrimarySmDis : S.btnPrimarySm} disabled={savingJust} onClick={handleSaveJustificativa}>
              {savingJust ? 'Salvando…' : 'Salvar justificativa'}
            </button>
          </>
        ) : (
          <button
            style={canConfirm && !saving ? S.btnPrimarySm : S.btnPrimarySmDis}
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
  const prio   = prioMap[pend.prioridade]   ?? prioMap.normal
  const status = statusMap[pend.status]     ?? statusMap.criada
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
          <button style={S.iconBtn} title="Editar" onClick={onEdit}><ActionIcons.edit size={13} /></button>
          <button style={S.iconBtn} title="Remover" onClick={onDelete}><ActionIcons.delete size={13} /></button>
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
          <RespPicker
            contacts={contacts}
            profiles={profiles}
            selectedId={draft.respId}
            selectedKind={draft.respKind}
            onChange={(id, kind) => setDraft(p => ({ ...p, respId: id, respKind: kind }))}
          />
        </div>
      </div>
      <div style={styles.pending.formActions}>
        <button style={S.btnSecSm} onClick={onCancel}>Cancelar</button>
        <button
          style={saving ? S.btnPrimarySmDis : S.btnPrimarySm}
          disabled={saving}
          onClick={() => {
            if (!draft.title.trim()) { toast.error('Informe um título'); return }
            onSave(draft)
          }}
        >
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
      logAction('updated', 'onboarding_activity', act.id, act.title,
        { title: act.title, status: act.status, due_date: act.due_date }, payload)
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
        onboarding_id: onboardingId,
        activity_id: act.id,
        title: draft.title.trim(),
        description: draft.desc || null,
        prioridade: draft.priority,
        status: 'criada',
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

  const resp = act.resp_interno?.name ?? act.resp_contato?.name ?? null
  const pendencias = act.pendencias ?? []

  function saveActivityEdit() {
    const payload = {
      title: editActDraft.title.trim(),
      status: editActDraft.status,
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

  const caretStyle = {
    ...styles.activity.caret,
    transform: expanded ? 'rotate(90deg)' : 'none',
    color: expanded ? '#173557' : 'rgba(23,53,87,0.4)',
  }

  const itemStyle = {
    ...styles.activity.item,
    ...(expanded ? { borderColor: 'rgba(89,194,237,0.5)', boxShadow: '0 4px 14px -8px rgba(89,194,237,0.4)' } : {}),
  }

  return (
    <div style={itemStyle}>
      <div style={styles.activity.row} onClick={() => onToggleExpand(act.id)}>
        <div style={caretStyle}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 2 8 6 4 10"/>
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#173557', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {act.title}
        </div>
        <select
          style={S.actStatusSel}
          value={act.status}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            e.stopPropagation()
            updateActMut.mutate({ status: e.target.value, completed_at: e.target.value === 'concluida' ? new Date().toISOString() : null })
          }}
        >
          {ACT_STATUS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {resp
            ? <span>{resp}{act.resp_contato && <span style={{ color: 'rgba(23,53,87,0.45)' }}> (cliente)</span>}</span>
            : <span style={{ color: 'rgba(23,53,87,0.4)', fontStyle: 'italic' }}>— sem responsável</span>}
        </div>
        <div style={{ fontSize: 12, color: act.due_date ? 'rgba(23,53,87,0.7)' : 'rgba(23,53,87,0.4)', fontStyle: act.due_date ? 'normal' : 'italic' }}>
          {act.due_date ? `Limite ${fmt(act.due_date)}` : '— sem prazo'}
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <button
            style={S.iconBtn}
            title="Editar"
            onClick={() => {
              setEditActDraft({
                title: act.title, status: act.status, due: act.due_date || '',
                respId: act.responsible_contato_id || act.responsible_interno_id || null,
                respKind: act.responsible_contato_id ? 'contato' : act.responsible_interno_id ? 'interno' : null,
              })
              if (!expanded) onToggleExpand(act.id)
              setEditActOpen(true)
            }}
          >
            <ActionIcons.edit size={13} />
          </button>
          <button
            style={S.iconBtn}
            title="Remover"
            onClick={() => { if (window.confirm(`Remover atividade "${act.title}"?`)) deleteActMut.mutate() }}
          >
            <ActionIcons.delete size={13} />
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
                  <RespPicker
                    contacts={contacts}
                    profiles={profiles}
                    selectedId={editActDraft.respId}
                    selectedKind={editActDraft.respKind}
                    onChange={(id, kind) => setEditActDraft(p => ({ ...p, respId: id, respKind: kind }))}
                  />
                </div>
              </div>
              <div style={styles.pending.formActions}>
                <button style={S.btnSecSm} onClick={() => setEditActOpen(false)}>Cancelar</button>
                <button style={updateActMut.isPending ? S.btnPrimarySmDis : S.btnPrimarySm} onClick={saveActivityEdit} disabled={updateActMut.isPending}>Salvar</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pendências ({pendencias.length})
            </div>
            <button style={S.btnLink} onClick={() => onTogglePendForm(act.id, !showPendForm)}>
              {showPendForm ? '× Fechar formulário' : '+ Nova Pendência'}
            </button>
          </div>

          {pendencias.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendencias.map(p => (
                <div key={p.id}>
                  <PendingItem
                    pend={p}
                    onEdit={() => setEditPendId(prev => prev === p.id ? null : p.id)}
                    onDelete={() => { if (window.confirm(`Remover pendência "${p.title}"?`)) deletePendMut.mutate(p) }}
                  />
                  {editPendId === p.id && (
                    <PendForm
                      contacts={contacts}
                      profiles={profiles}
                      initialDraft={{
                        title: p.title || '', desc: p.description || '', priority: p.prioridade || 'normal',
                        status: p.status || 'criada', due: p.due_date || '',
                        respId: p.responsavel_contato_id || p.responsavel_interno_id || null,
                        respKind: p.responsavel_contato_id ? 'contato' : p.responsavel_interno_id ? 'interno' : null,
                      }}
                      showStatus
                      onSave={draft => updatePendMut.mutate({
                        pendId: p.id,
                        payload: {
                          title: draft.title.trim(), description: draft.desc || null,
                          prioridade: draft.priority, status: draft.status, due_date: draft.due || null,
                          responsavel_contato_id: draft.respKind === 'contato' ? Number(draft.respId) : null,
                          responsavel_interno_id: draft.respKind === 'interno' ? draft.respId : null,
                          responsavel_grupo: !draft.respId ? 'A definir' : null,
                        },
                      })}
                      onCancel={() => setEditPendId(null)}
                      saving={updatePendMut.isPending}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            !showPendForm && <div style={styles.pending.empty}>Nenhuma pendência registrada nesta atividade.</div>
          )}

          {showPendForm && (
            <PendForm
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
function CatalogSearch({ actTypes, activities, onboardingId, targetFaseId, qc, logAction, user }) {
  const [search, setSearch] = useState('')
  const [showDd, setShowDd] = useState(false)
  const inputRef = useRef()
  const ddRef    = useRef()

  const usedNames  = new Set(activities.map(a => a.title.toLowerCase()))
  const filtered   = actTypes.filter(t =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    !usedNames.has(t.name.toLowerCase())
  )
  const exactMatch = actTypes.some(t => t.name.toLowerCase() === search.trim().toLowerCase())

  useEffect(() => {
    function handler(e) {
      if (ddRef.current && !ddRef.current.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setShowDd(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addActMut = useMutation({
    mutationFn: async (option) => {
      let type = option
      if (option?.__new) {
        const { data: created, error: typeErr } = await supabase
          .from('onboarding_activity_types')
          .insert({ name: option.name.trim(), active: true })
          .select('id, name')
          .single()
        if (typeErr) throw typeErr
        type = created
      }
      const payload = {
        onboarding_id: onboardingId,
        activity_type_id: type.id,
        title: type.name,
        fase_id: targetFaseId ?? null,
        status: 'pendente',
        due_date: null,
        responsible_contato_id: null,
        responsible_interno_id: null,
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

  if (!targetFaseId) {
    return (
      <div style={{ padding: '8px 2px 12px', fontSize: 13, color: 'rgba(23,53,87,0.5)', fontStyle: 'italic' }}>
        Selecione uma fase para adicionar atividades
      </div>
    )
  }

  return (
    <div>
      <div style={styles.activity.searchWrap}>
        <span style={styles.activity.searchIcon}>
          <ActionIcons.search size={14} />
        </span>
        <input
          id="onb-cat-input"
          ref={inputRef}
          style={styles.activity.search}
          placeholder="Buscar no catálogo de atividades…"
          value={search}
          onChange={e => { setSearch(e.target.value); setShowDd(true) }}
          onFocus={() => setShowDd(true)}
          autoComplete="off"
        />
        {showDd && (
          <div style={styles.activity.catalogDropdown} ref={ddRef}>
            {filtered.map(t => (
              <div
                key={t.id}
                style={styles.activity.catalogItem}
                onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
                onClick={() => addActMut.mutate(t)}
              >
                <span>{t.name}</span>
                <span style={{ fontSize: 10, color: 'rgba(23,53,87,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catálogo</span>
              </div>
            ))}
            {search.trim() && !exactMatch && (
              <div
                style={styles.activity.catalogItem}
                onMouseEnter={e => e.currentTarget.style.background = '#f4f5f7'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
                onClick={() => addActMut.mutate({ __new: true, name: search.trim() })}
              >
                <span>Criar atividade: <strong>{search.trim()}</strong></span>
                <span style={{ fontSize: 10, color: '#0a6a96', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Novo</span>
              </div>
            )}
            {filtered.length === 0 && (!search.trim() || exactMatch) && (
              <div style={{ padding: 10, fontSize: 12, color: 'rgba(23,53,87,0.55)', textAlign: 'center' }}>
                Todas as atividades do catálogo já foram adicionadas
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

// ── FaseMgmtPanel ─────────────────────────────────────────────────────────────
function FaseMgmtPanel({ fases, faseTypes, onboardingId, qc, onClose }) {
  const [search, setSearch] = useState('')

  const usedTypeIds = new Set(fases.map(f => f.fase_type_id))
  const available = faseTypes.filter(t =>
    !usedTypeIds.has(t.id) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  )

  const addFaseMut = useMutation({
    mutationFn: async (faseType) => {
      const maxOrder = fases.length > 0 ? Math.max(...fases.map(f => f.display_order)) : 0
      const { data, error } = await supabase.from('onboarding_fases').insert({
        onboarding_id: onboardingId,
        fase_type_id:  faseType.id,
        display_order: maxOrder + 1,
        status:        'pendente',
        evidence_required: faseType.requires_evidence,
      }).select('*, onboarding_fase_types(*)').single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      toast.success('Fase adicionada')
      setSearch('')
    },
    onError: e => toast.error(e.message),
  })

  const removeFaseMut = useMutation({
    mutationFn: async (faseId) => {
      const { error } = await supabase.from('onboarding_fases').delete().eq('id', faseId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      toast.success('Fase removida')
    },
    onError: e => toast.error(e.message),
  })

  const statusLabel = (s) => s === 'concluida' ? 'Concluída' : s === 'ativa' ? 'Ativa' : 'Pendente'
  const statusColor = (s) => s === 'concluida' ? 'green' : s === 'ativa' ? 'sky' : 'gray'

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid rgba(15,34,58,0.08)', paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#173557' }}>Personalizar fases deste projeto</div>
        <button style={S.btnLink} onClick={onClose}>Fechar</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {fases.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#f8f9fb', borderRadius: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#173557', flex: 1 }}>{phaseName(f)}</span>
            {f.onboarding_fase_types?.is_milestone && <Tag color="sky">Marco</Tag>}
            {f.onboarding_fase_types?.requires_evidence && <Tag color="amber">Evidência</Tag>}
            <Tag color={statusColor(f.status)}>{statusLabel(f.status)}</Tag>
            {f.status === 'pendente' ? (
              <button
                style={{ ...S.btnLink, color: '#b42828' }}
                disabled={removeFaseMut.isPending}
                onClick={() => { if (window.confirm(`Remover fase "${phaseName(f)}"?`)) removeFaseMut.mutate(f.id) }}
              >
                Remover
              </button>
            ) : (
              <span style={{ width: 52 }} />
            )}
          </div>
        ))}
      </div>

      <div>
        <label style={S.label}>Adicionar fase</label>
        <input
          style={{ ...S.input, marginBottom: 6 }}
          placeholder="Buscar tipo de fase…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {available.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.5)', padding: '6px 2px' }}>
            {search ? 'Nenhum tipo encontrado' : 'Todos os tipos já estão neste projeto'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {available.map(t => (
              <div
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, cursor: addFaseMut.isPending ? 'default' : 'pointer', border: '1px solid rgba(15,34,58,0.08)', background: '#fff' }}
                onClick={() => { if (!addFaseMut.isPending) addFaseMut.mutate(t) }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f4f5f7' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
              >
                <span style={{ fontSize: 12, color: '#173557', flex: 1 }}>{t.name}</span>
                {t.is_milestone && <Tag color="sky">Marco</Tag>}
                {t.requires_evidence && <Tag color="amber">Evidência</Tag>}
                <span style={{ fontSize: 11, color: '#0a6a96', fontWeight: 500 }}>+ Adicionar</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
  console.log('[detail] project:', project)
  const onboardingId = project?.onboarding_id
  console.log('[detail] onboardingId:', onboardingId)
  const clientId     = project?.client?.id

  const { data: onboarding, isLoading: onboardingLoading, error: onboardingError } = useOnboarding(onboardingId)
  const { data: activities = [], isLoading: actsLoading } = useActivities(onboardingId)
  const { data: actTypes   = [] }                          = useActivityTypes()
  const { data: contacts   = [] }                          = useContacts(clientId ? { client_id: clientId } : {})
  const { data: profiles   = [] }                          = useProfiles()
  const { data: faseTypes  = [] }                          = useFaseTypes()

  const [editModalOpen,   setEditModalOpen]   = useState(false)
  const [openMsId,        setOpenMsId]        = useState(null)
  const [msSaving,        setMsSaving]        = useState(false)
  const [expandedActs,    setExpandedActs]    = useState(new Set())
  const [showPendForms,   setShowPendForms]   = useState(new Set())
  const [selectedFaseTab, setSelectedFaseTab] = useState(null)
  const [showFaseMgmt,    setShowFaseMgmt]    = useState(false)

  const orderedFases      = (onboarding?.onboarding_fases ?? []).slice().sort((a, b) => a.display_order - b.display_order)
  const faseAtualId       = onboarding?.fase_atual_id ?? orderedFases[0]?.id ?? null
  const currentPhaseIndex = Math.max(0, orderedFases.findIndex(f => f.id === faseAtualId))

  function toggleExpand(actId) {
    setExpandedActs(prev => {
      const next = new Set(prev)
      if (next.has(actId)) {
        next.delete(actId)
        setShowPendForms(p => { const n = new Set(p); n.delete(actId); return n })
      } else {
        next.add(actId)
      }
      return next
    })
  }

  function togglePendForm(actId, show) {
    setShowPendForms(prev => { const next = new Set(prev); show ? next.add(actId) : next.delete(actId); return next })
    if (show) setExpandedActs(prev => new Set([...prev, actId]))
  }

  // ── Phase mutations ──────────────────────────────────────────────────────────
  const phaseMut = useMutation({
    mutationFn: async (direction) => {
      if (!onboarding || !orderedFases.length) throw new Error('Onboarding não carregado')
      const curIdx    = currentPhaseIndex
      const targetIdx = direction === 'advance' ? curIdx + 1 : curIdx - 1
      if (targetIdx < 0 || targetIdx >= orderedFases.length) return null

      const current = orderedFases[curIdx]
      const target  = orderedFases[targetIdx]
      const today   = new Date().toISOString().slice(0, 10)

      if (direction === 'advance' && current) {
        const { error } = await supabase.from('onboarding_fases')
          .update({ status: 'concluida', actual_end: current.actual_end || today })
          .eq('id', current.id)
        if (error) throw error
      }
      if (direction === 'revert' && current) {
        const { error } = await supabase.from('onboarding_fases')
          .update({ status: 'pendente', actual_end: null })
          .eq('id', current.id)
        if (error) throw error
      }

      const { error: activeErr } = await supabase.from('onboarding_fases')
        .update({ status: 'ativa', actual_start: target.actual_start || today })
        .eq('id', target.id)
      if (activeErr) throw activeErr

      const { error: onbErr } = await supabase.from('onboardings')
        .update({ fase_atual_id: target.id })
        .eq('id', onboarding.id)
      if (onbErr) throw onbErr

      return { oldFase: phaseName(current), newFase: phaseName(target) }
    },
    onSuccess: (res) => {
      if (!res) return
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('updated', 'onboarding', onboardingId, project.title, { fase: res.oldFase }, { fase: res.newFase })
      toast.success(`Fase: ${res.newFase}`)
    },
    onError: e => toast.error(e.message),
  })

  // ── Milestone confirm ────────────────────────────────────────────────────────
  async function handleConfirmMs({ ms, occurredAt, justificativa, file }) {
    setMsSaving(true)
    try {
      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `${clientId}/onboarding/fase-${ms.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('activity-attachments').upload(path, file)
        if (upErr) throw upErr
        const { error: evErr } = await supabase.from('onboarding_evidencias').insert({
          fase_id: ms.id, uploaded_by: user.id, client_id: clientId,
          file_name: file.name, file_size: file.size, file_type: file.type, storage_path: path,
        })
        if (evErr) throw evErr
      }

      const { error } = await supabase.from('onboarding_fases')
        .update({ status: 'concluida', occurred_at: occurredAt, justificativa: justificativa || null, actual_end: occurredAt })
        .eq('id', ms.id)
      if (error) throw error

      const idx  = orderedFases.findIndex(f => f.id === ms.id)
      const next = idx >= 0 ? orderedFases[idx + 1] : null
      if (next) {
        const { error: nextErr } = await supabase.from('onboarding_fases')
          .update({ status: 'ativa', actual_start: next.actual_start || occurredAt })
          .eq('id', next.id)
        if (nextErr) throw nextErr
        const { error: onbErr } = await supabase.from('onboardings')
          .update({ fase_atual_id: next.id })
          .eq('id', onboardingId)
        if (onbErr) throw onbErr
      }

      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      logAction('updated', 'onboarding_fase', ms.id, phaseName(ms), null, { occurred_at: occurredAt, status: 'concluida' })
      toast.success(`${phaseName(ms)} concluído!`)
      setOpenMsId(null)
    } catch (e) { toast.error(e.message) }
    finally { setMsSaving(false) }
  }

  async function handleReopenMs(ms) {
    setMsSaving(true)
    try {
      const { error } = await supabase.from('onboarding_fases')
        .update({ status: 'ativa', occurred_at: null, justificativa: null, actual_end: null })
        .eq('id', ms.id)
      if (error) throw error
      const { error: onbErr } = await supabase.from('onboardings')
        .update({ fase_atual_id: ms.id })
        .eq('id', onboardingId)
      if (onbErr) throw onbErr
      qc.invalidateQueries({ queryKey: ['project_detail', id] })
      qc.invalidateQueries({ queryKey: ['onboarding', onboardingId] })
      logAction('updated', 'onboarding_fase', ms.id, phaseName(ms), { occurred_at: ms.occurred_at }, { occurred_at: null, status: 'ativa' })
      toast.success(`Marco reaberto: ${phaseName(ms)}`)
      setOpenMsId(null)
    } catch (e) { toast.error(e.message) }
    finally { setMsSaving(false) }
  }

  // ── Loading / error ──────────────────────────────────────────────────────────
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
        <button style={S.btnBack} onClick={() => navigate('/projetos')}>← Voltar</button>
      </div>
    )
  }
  if (onboardingError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#b42828', fontSize: 14 }}>Onboarding vinculado não encontrado.</p>
        <button style={S.btnBack} onClick={() => navigate('/projetos')}>← Voltar</button>
      </div>
    )
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const onb         = onboarding
  const fases       = orderedFases
  const caps        = onb?.onboarding_capabilities ?? []
  const activePhase  = fases[currentPhaseIndex] ?? fases[0] ?? null
  const visibleActs  = selectedFaseTab ? activities.filter(a => a.fase_id === selectedFaseTab) : activities
  const clientName   = project.client?.fantasy_name || project.client?.name || '—'
  const totalSteps  = fases.length
  const doneSteps   = fases.filter(f => f.status === 'concluida').length

  const situacaoMap = {
    fluindo: { color: 'green', label: 'Fluindo', dot: true  },
    atencao: { color: 'amber', label: 'Atenção',  dot: false },
    travado: { color: 'red',   label: 'Travado',  dot: false },
  }
  const situacao    = situacaoMap[onb?.situacao_geral] ?? situacaoMap.fluindo
  const openMs      = openMsId ? fases.find(f => f.id === openMsId) : null
  const contextLabel = FASE_LABELS[onb?.context] ?? onb?.context ?? ''

  return (
    <>
      <div style={{ background: '#f4f5f7', minHeight: '100vh', paddingBottom: 60 }}>

        {/* breadcrumb */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(15,34,58,0.07)', padding: '10px 32px' }}>
          <span style={{ fontSize: 13, color: 'rgba(23,53,87,0.6)' }}>
            <strong style={{ color: '#173557' }}>Projetos</strong>
            <span style={{ margin: '0 6px', color: 'rgba(23,53,87,0.35)' }}>/</span>
            <span style={{ color: '#173557' }}>{project.title}</span>
          </span>
        </div>

        <div style={{ padding: '22px 28px 60px' }}>

          {/* header */}
          <button style={S.btnBack} onClick={() => navigate('/projetos')}>← Projetos</button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.2px', color: '#173557' }}>{project.title}</h1>
              <div style={{ fontSize: 13, color: '#0a6a96', fontWeight: 500, marginTop: 4 }}>{clientName}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {contextLabel && <Tag color="sky">{contextLabel}</Tag>}
                {onb && (
                  <Tag color={situacao.color}>
                    {situacao.dot && <span style={S.liveDot} />}
                    {situacao.label}
                  </Tag>
                )}
                {onb?.csm && <Tag color="gray">CSM: {onb.csm.name}</Tag>}
              </div>
            </div>
            <button style={S.btnSec} onClick={() => setEditModalOpen(true)}>Editar projeto</button>
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
                        isLastPhase={isLast}
                        onMilestoneClick={() => setOpenMsId(prev => prev === fase.id ? null : fase.id)}
                        onAdvance={() => phaseMut.mutate('advance')}
                        onRevert={() => phaseMut.mutate('revert')}
                      />
                      {!isLast && (
                        <Connector
                          leftDone={isDone}
                          rightActive={!!(next?.id === faseAtualId || next?.status === 'ativa')}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {openMs && (
                <MilestonePanel
                  ms={openMs}
                  onClose={() => setOpenMsId(null)}
                  onConfirm={handleConfirmMs}
                  onReopen={() => handleReopenMs(openMs)}
                  saving={msSaving}
                  user={user}
                  clientId={clientId}
                  qc={qc}
                />
              )}

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
              <button style={S.btnPrimarySm} onClick={() => document.getElementById('onb-cat-input')?.focus()}>
                + Adicionar Atividade
              </button>
            </div>

            {fases.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                <button style={selectedFaseTab === null ? S.segBtnOn : S.segBtn} onClick={() => setSelectedFaseTab(null)}>
                  Todas
                </button>
                {fases.map(f => (
                  <button
                    key={f.id}
                    style={{ ...(selectedFaseTab === f.id ? S.segBtnOn : S.segBtn), whiteSpace: 'nowrap' }}
                    onClick={() => setSelectedFaseTab(f.id)}
                  >
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

          {/* capabilities */}
          {caps.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(15,34,58,0.09)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#173557', marginBottom: 16 }}>Capacidades contratadas</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {caps.map((cap, i) => {
                  const item = cap.catalog_item
                  if (!item) return null
                  const palette = CAP_PALETTE[i % CAP_PALETTE.length]
                  return (
                    <span key={cap.id} style={{ ...S.capChipBase, ...palette }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block', flexShrink: 0 }} />
                      {item.name}
                    </span>
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
