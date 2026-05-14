import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { saveBriefAttachment, deleteBriefAttachment } from '../services/briefAttachments/saveBriefAttachment'
import { Icons } from '../lib/icons'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

const NAVY    = '#173557'
const LIME    = '#d3da47'
const SKY     = '#59c2ed'
const SKY_D   = '#0a6a96'
const GREEN   = '#1aa56a'
const FONT    = "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

// Reuse the already-configured client to guarantee URL/key always match
const BASE_URL = supabase.supabaseUrl
const ANON_KEY = supabase.supabaseKey

const GLOBAL_CSS = `
  @keyframes spin { to { transform: rotate(360deg) } }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  textarea { resize: vertical; }
  textarea:focus, input:focus { outline: none; }

  @media print {
    .no-print { display: none !important; }
    .print-section { display: block !important; }
    .brief-main { margin: 0 !important; max-width: 100% !important; }
  }
  .print-section { display: none; }
`

// ── Edge fn helper ──────────────────────────────────────────────────────────────
async function callBrief(payload) {
  const res = await fetch(`${BASE_URL}/functions/v1/brief-public`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw { status: res.status, message: json.error || 'Erro desconhecido' }
  return json
}

// ── Progress helpers ────────────────────────────────────────────────────────────
function answeredOf(sec, responses) {
  return (sec.questions || []).filter(q => (responses[q.id] || '').trim()).length
}
function pctOf(sec, responses) {
  const t = (sec.questions || []).length
  return t ? Math.round(100 * answeredOf(sec, responses) / t) : 100
}
function calcProgress(sections, responses) {
  const all = sections.flatMap(s => (s.questions || []).filter(q => q.required))
  if (!all.length) return 100
  return Math.round(all.filter(q => (responses[q.id] || '').trim()).length / all.length * 100)
}
function canComplete(sections, responses) {
  return sections.flatMap(s => (s.questions || []).filter(q => q.required))
    .every(q => (responses[q.id] || '').trim())
}
function countMissing(sections, responses) {
  return sections.flatMap(s => (s.questions || []).filter(q => q.required))
    .filter(q => !(responses[q.id] || '').trim()).length
}
function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

// ── Section SVG ring ────────────────────────────────────────────────────────────
function SectionRing({ pct, done, index }) {
  const C = 32, R = 13, CIRC = 2 * Math.PI * R
  const dash = (pct / 100) * CIRC
  return (
    <span style={{ position: 'relative', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={32} height={32} viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}>
        <circle cx={16} cy={16} r={R} stroke="#e6e8ec" strokeWidth={2.6} fill="none" />
        <circle cx={16} cy={16} r={R} stroke={done ? GREEN : SKY} strokeWidth={2.6} fill="none"
          strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="round" />
      </svg>
      {done
        ? <Icons.Check size={11} color={GREEN} style={{ position: 'relative', zIndex: 1 }} />
        : <span style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 700, color: NAVY, lineHeight: 1 }}>{index + 1}</span>
      }
    </span>
  )
}

// ── Spinner ─────────────────────────────────────────────────────────────────────
function Spinner({ size = 36, color = SKY }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', border: `3px solid ${color}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
    </div>
  )
}

// ── Tour modal (5 steps) ────────────────────────────────────────────────────────
const TOUR = [
  { icon: 'LayoutList',     title: 'Navegue pelas seções',     text: 'Use o menu lateral para navegar entre as seções. Você pode preencher em qualquer ordem.' },
  { icon: 'Target',         title: 'Entregável esperado',       text: 'Cada seção tem um entregável destacado. Ele indica o objetivo daquela parte do questionário.' },
  { icon: 'Info',           title: 'Dicas de preenchimento',    text: 'Perguntas com o ícone azul têm orientações. Elas ajudam a entender o que responder.' },
  { icon: 'Save',           title: 'Salvamento automático',     text: 'Suas respostas são salvas automaticamente. Feche e retorne quando quiser.' },
  { icon: 'MessageCircle',  title: 'Ficou com dúvida?',         text: 'Use o ícone 💬 ao lado de qualquer pergunta para enviar uma dúvida à equipe Donc. Para dúvidas gerais, use "Fale com a Donc" no menu lateral.' },
]

function TourModal({ onClose }) {
  const [step, setStep] = useState(0)
  const { icon, title, text } = TOUR[step]
  const Icon = Icons[icon]
  const isLast = step === TOUR.length - 1
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 420, width: '100%', padding: '32px 28px 24px', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(23,53,87,0.5)', borderRadius: 6 }}>
          <Icons.X size={15} />
        </button>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(89,194,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          {Icon && <Icon size={26} color={SKY} />}
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 10px' }}>{title}</h3>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: '0 0 24px' }}>{text}</p>
        <div style={{ display: 'flex', gap: 5, marginBottom: 20, justifyContent: 'center' }}>
          {TOUR.map((_, i) => (
            <div key={i} style={{ width: i === step ? 18 : 7, height: 7, borderRadius: 99, background: i === step ? SKY : '#e2e8f0', transition: 'all 0.2s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: '10px 16px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Anterior</button>
          )}
          <button onClick={isLast ? onClose : () => setStep(s => s + 1)} style={{ flex: 1, padding: '10px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {isLast ? 'Entendi' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cover ───────────────────────────────────────────────────────────────────────
function Cover({ session, onStart, leaving = false, completed = false }) {
  const [logoError, setLogoError] = useState(false)
  const clientName   = session?.client_name || ''
  const logoUrl      = session?.client_logo_url
  const capabilities = session?.operation_capabilities || []
  const sentAt       = session?.instance?.sent_at
  const initials     = clientName.slice(0, 2).toUpperCase() || '??'
  const formattedDate = sentAt
    ? new Date(sentAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
    : ''

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      display: 'grid', placeItems: 'center',
      padding: '32px 24px',
      background: 'radial-gradient(ellipse at top right, rgba(89,194,237,0.18), transparent 55%), radial-gradient(ellipse at bottom left, rgba(211,218,71,0.10), transparent 50%), linear-gradient(160deg, #0f2240 0%, #14304d 40%, #0c1d35 100%)',
      color: '#fff', overflow: 'auto',
      opacity: leaving ? 0 : 1,
      transition: 'opacity 0.35s ease',
      fontFamily: FONT,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #d3da47 30%, #59c2ed 70%, transparent)', opacity: 0.55 }} />

      <div style={{
        width: 'min(720px, 100%)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 22, padding: '44px 48px 40px',
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)',
        position: 'relative',
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          <span style={{ color: LIME }}>DONC</span><span style={{ color: SKY }}>.</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
          Plataforma de gestão de equipes externas
        </div>
        <div style={{ width: 56, height: 2, background: LIME, margin: '22px 0 24px', borderRadius: 2 }} />

        <h1 style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.1, margin: '0 0 10px', color: '#fff' }}>
          {session?.instance?.title || 'Roteiro de Projeto'}
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.70)', lineHeight: 1.5, margin: 0 }}>
          Levantamento de regras de negócio
        </p>

        <div style={{ marginTop: 30, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', display: 'grid', gridTemplateColumns: '64px 1fr', gap: 18, alignItems: 'center' }}>
          {logoUrl && !logoError
            ? <img src={logoUrl} alt={clientName} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} onError={() => setLogoError(true)} />
            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#0c1626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: LIME, letterSpacing: '-0.04em', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>{initials}</div>
          }
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 28, rowGap: 9, alignItems: 'center' }}>
            {clientName && (
              <>
                <dt style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Cliente</dt>
                <dd style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{clientName}</dd>
              </>
            )}
            {capabilities.length > 0 && (
              <>
                <dt style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Operação</dt>
                <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {capabilities.map((cap, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', border: '1px solid rgba(89,194,237,0.55)', color: SKY, fontSize: 12, fontWeight: 500, borderRadius: 999, background: 'rgba(89,194,237,0.08)' }}>{cap.name}</span>
                  ))}
                </dd>
              </>
            )}
            {formattedDate && (
              <>
                <dt style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Data</dt>
                <dd style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{formattedDate}</dd>
              </>
            )}
          </dl>
        </div>

        {completed ? (
          <div style={{ marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(26,165,106,0.15)', border: '1px solid rgba(26,165,106,0.3)', borderRadius: 10, padding: '12px 18px', fontSize: 14, color: '#6ee7b7' }}>
            <Icons.CheckCircle size={16} color="#6ee7b7" />
            Brief enviado. Obrigado!
          </div>
        ) : (
          <button onClick={onStart} style={{
            marginTop: 28, background: LIME, color: '#1a1f00',
            border: 'none', padding: '14px 22px', borderRadius: 12,
            fontSize: 15, fontWeight: 600, letterSpacing: '-0.1px',
            display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 14px 28px -10px rgba(211,218,71,0.5)',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 18px 34px -10px rgba(211,218,71,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 14px 28px -10px rgba(211,218,71,0.5)' }}
          >
            Iniciar preenchimento
            <Icons.ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        <div style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.04em' }}>
          Documento confidencial — DONC + {clientName || 'Cliente'}
        </div>
      </div>
    </div>
  )
}

// ── Auth card wrapper ───────────────────────────────────────────────────────────
function AuthLayout({ children }) {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '40px 36px', maxWidth: 420, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 52, height: 52, borderRadius: 11, background: NAVY, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <span style={{ color: LIME, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>d</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase' }}>doncCX · Brief</div>
          </div>
          {children}
        </div>
      </div>
    </>
  )
}

// ── Question drawer (dúvida geral) ──────────────────────────────────────────────
function QuestionDrawer({ open, onClose, clientQuestions, drawerText, onChange, onSubmit, submitting, sent }) {
  if (!open) return null
  const generalQuestions = clientQuestions.filter(q => !q.question_id)
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: '#fff', borderRight: '1px solid rgba(15,34,58,0.08)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>Enviar dúvida para a Donc</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(23,53,87,0.5)' }}>
          <Icons.X size={15} />
        </button>
      </div>

      {sent ? (
        <div style={{ fontSize: 13, color: '#157a47', lineHeight: 1.6, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Check size={13} color="#157a47" />
          Dúvida enviada. Nossa equipe responderá em breve.
        </div>
      ) : (
        <>
          <textarea value={drawerText} onChange={e => onChange(e.target.value)} placeholder="Descreva sua dúvida…" rows={4}
            style={{ width: '100%', border: '1px solid rgba(15,34,58,0.14)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none' }}
            onFocus={e => e.target.style.borderColor = SKY}
            onBlur={e => e.target.style.borderColor = 'rgba(15,34,58,0.14)'}
          />
          <button onClick={onSubmit} disabled={submitting || !drawerText.trim()}
            style={{ padding: '9px 14px', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: submitting || !drawerText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !drawerText.trim() ? 0.5 : 1 }}>
            {submitting ? 'Enviando…' : 'Enviar'}
          </button>
        </>
      )}

      {generalQuestions.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(15,34,58,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(23,53,87,0.45)' }}>Dúvidas enviadas</div>
          {generalQuestions.map((q, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ color: 'rgba(23,53,87,0.7)', marginBottom: q.csm_reply ? 6 : 0 }}>{q.note_text}</div>
              {q.csm_reply && (
                <div style={{ background: 'rgba(23,53,87,0.04)', borderLeft: '3px solid rgba(23,53,87,0.2)', padding: '6px 10px', borderRadius: '0 6px 6px 0', color: NAVY }}>
                  <strong>Donc:</strong> {q.csm_reply}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Question card ───────────────────────────────────────────────────────────────
function QuestionCard({
  question, index, value, onChange, saveStatus, readOnly,
  attachments, attachmentUrls, onUpload, onDelete, isUploading,
  clientQuestions, csmNotes,
  doubtOpen, doubtText, doubtSent, doubtSubmitting,
  onDoubtToggle, onDoubtTextChange, onDoubtSubmit,
}) {
  const { id, text, type, required, note, allow_attachment } = question
  const fileInputRef = useRef(null)
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)

  const isAnswered = !!(value && value.trim())
  const isMissing  = required && !isAnswered && touched
  const isTextarea = type === 'textarea' || type === 'longo' || !type

  const cardBg     = isMissing ? '#fdf8f8' : isAnswered ? '#f8fcfa' : '#fff'
  const cardBorder = isMissing ? 'rgba(196,68,68,0.45)' : focused ? 'rgba(89,194,237,0.55)' : isAnswered ? 'rgba(34,160,98,0.32)' : 'rgba(15,34,58,0.09)'
  const numBg      = focused ? 'rgba(89,194,237,0.14)' : isAnswered ? 'rgba(34,160,98,0.12)' : 'rgba(23,53,87,0.06)'
  const numColor   = focused ? SKY_D : isAnswered ? '#157a47' : 'rgba(23,53,87,0.7)'

  const inputStyle = {
    width: '100%', border: '1px solid #d4d3ce', borderRadius: 8,
    padding: '10px 12px', fontSize: 13.5, color: NAVY,
    background: readOnly ? '#f8fafc' : '#fff',
    fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s',
    cursor: readOnly ? 'default' : 'text',
  }

  function onFocus(e) {
    setFocused(true)
    if (!readOnly) { e.target.style.borderColor = SKY; e.target.style.boxShadow = '0 0 0 3px rgba(89,194,237,0.18)' }
  }
  function onBlur(e) {
    setFocused(false); setTouched(true)
    e.target.style.borderColor = '#d4d3ce'; e.target.style.boxShadow = 'none'
  }

  const visibleCsmNotes = (csmNotes || []).filter(n => n.question_id === id)
  const myQuestions = (clientQuestions || []).filter(q => q.question_id === id)

  return (
    <article style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12, padding: '16px 18px 14px', transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s', boxShadow: focused ? '0 6px 18px -10px rgba(89,194,237,0.5)' : 'none' }}>

      {/* Head */}
      <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'start', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 26, height: 26, background: numBg, color: numColor, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, marginTop: 1, flexShrink: 0, transition: 'background 0.15s, color 0.15s' }}>
          {index + 1}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: NAVY, lineHeight: 1.45, paddingTop: 3 }}>
          {text}{required && <span style={{ color: '#c44', marginLeft: 3, fontWeight: 700 }}>*</span>}
        </div>
        {isAnswered && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 8px 3px 7px', borderRadius: 999, background: 'rgba(34,160,98,0.12)', color: '#157a47', lineHeight: 1.5, alignSelf: 'start', marginTop: 2, whiteSpace: 'nowrap' }}>
            <Icons.Check size={11} />Respondida
          </span>
        )}
      </div>

      {/* Helper box */}
      {note && note.trim() && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, margin: '0 0 10px 38px', padding: '7px 10px', background: 'rgba(89,194,237,0.06)', border: '1px solid rgba(89,194,237,0.16)', borderRadius: 7, color: 'rgba(23,53,87,0.7)', fontSize: 12, lineHeight: 1.5 }}>
          <Icons.Info size={12} color={SKY_D} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{note}</div>
        </div>
      )}

      {/* Input */}
      <div style={{ marginLeft: 38 }}>
        {isTextarea
          ? <textarea value={value} onChange={e => onChange(e.target.value)} disabled={readOnly} placeholder="Digite a resposta…" rows={4} style={{ ...inputStyle, minHeight: 90, lineHeight: 1.55 }} onFocus={onFocus} onBlur={onBlur} />
          : <input type={type === 'date' ? 'date' : 'text'} value={value} onChange={e => onChange(e.target.value)} disabled={readOnly} placeholder="Digite a resposta…" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        }
        {saveStatus && (
          <div style={{ fontSize: 11, marginTop: 4, color: saveStatus === 'saved' ? '#22c55e' : saveStatus === 'error' ? '#ef4444' : '#94a3b8' }}>
            {saveStatus === 'saving' && 'Salvando…'}
            {saveStatus === 'saved' && '✓ Salvo'}
            {saveStatus === 'error' && 'Erro ao salvar'}
          </div>
        )}
      </div>

      {/* Footer row: attach + doubt */}
      <div style={{ marginLeft: 38, marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {allow_attachment && !readOnly && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onUpload(e.target.files[0]); e.target.value = '' }} />
            <button onClick={() => !isUploading && fileInputRef.current?.click()} style={{
              background: attachments.length > 0 ? 'rgba(89,194,237,0.14)' : 'transparent',
              border: `1px ${attachments.length > 0 ? 'solid rgba(89,194,237,0.45)' : 'dashed rgba(15,34,58,0.14)'}`,
              borderRadius: 999, padding: '5px 12px 5px 10px',
              fontSize: 11.5, fontWeight: 500, color: attachments.length > 0 ? SKY_D : 'rgba(23,53,87,0.7)',
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: isUploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              <Icons.Paperclip size={12} />
              {isUploading ? 'Enviando…' : attachments.length > 0 ? `${attachments.length} arquivo${attachments.length === 1 ? '' : 's'} anexado${attachments.length === 1 ? '' : 's'}` : 'Anexar arquivo'}
            </button>
            <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.35)' }}>opcional · até 10MB</span>
          </>
        )}

        {!readOnly && (
          <button onClick={onDoubtToggle} className="brief-doubt-btn" style={{ background: 'transparent', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: doubtOpen ? SKY_D : 'rgba(23,53,87,0.45)', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px', borderRadius: 6, transition: 'color 0.1s' }}>
            <Icons.MessageCircle size={12} />Dúvida?
          </button>
        )}
      </div>

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div style={{ marginLeft: 38, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {attachments.map((att, idx) => {
            const ft = att.mime_type || att.file_type || ''
            const url = attachmentUrls[att.id]
            const isImg = ft.startsWith('image/')
            return (
              <div key={att.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#f8fafc', border: '1px solid rgba(15,34,58,0.08)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ flexShrink: 0 }}>
                  {isImg && url ? <img src={url} alt={att.file_name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5, display: 'block' }} /> : ft === 'application/pdf' ? '📄' : ft.includes('word') ? '📝' : '📎'}
                </span>
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{att.file_name}</a>
                  : <span style={{ flex: 1, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.file_name}</span>
                }
                <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>{fmtBytes(att.file_size)}</span>
                {!readOnly && (
                  <button onClick={() => onDelete(att.id)} style={{ width: 20, height: 20, borderRadius: '50%', background: '#fee2e2', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icons.X size={10} color="#ef4444" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CSM visible notes */}
      {visibleCsmNotes.map((n, i) => (
        <div key={i} style={{ marginLeft: 38, marginTop: 10, background: 'rgba(23,53,87,0.04)', borderLeft: `3px solid ${NAVY}`, padding: '8px 12px', borderRadius: '0 8px 8px 0', fontSize: 12.5, lineHeight: 1.5 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(23,53,87,0.5)', marginBottom: 4 }}>Nota da equipe Donc</div>
          <div style={{ color: NAVY }}>{n.note_text}</div>
        </div>
      ))}

      {/* Doubt expansion */}
      {doubtOpen && (
        <div style={{ marginLeft: 38, marginTop: 10, padding: '10px 12px', background: 'rgba(89,194,237,0.04)', border: '1px solid rgba(89,194,237,0.16)', borderRadius: 8 }}>
          {doubtSent ? (
            <div style={{ fontSize: 12, color: '#157a47', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.Check size={12} color="#157a47" />Dúvida enviada ✓
            </div>
          ) : (
            <>
              <textarea value={doubtText} onChange={e => onDoubtTextChange(e.target.value)} placeholder="Descreva sua dúvida sobre esta pergunta…" rows={3}
                style={{ width: '100%', border: '1px solid rgba(15,34,58,0.14)', borderRadius: 7, padding: '7px 9px', fontFamily: 'inherit', fontSize: 12.5, resize: 'none', outline: 'none', marginBottom: 8 }}
                onFocus={e => e.target.style.borderColor = SKY}
                onBlur={e => e.target.style.borderColor = 'rgba(15,34,58,0.14)'}
              />
              <button onClick={onDoubtSubmit} disabled={doubtSubmitting || !doubtText.trim()} style={{ padding: '6px 12px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: !doubtText.trim() ? 0.5 : 1 }}>
                {doubtSubmitting ? 'Enviando…' : 'Enviar dúvida'}
              </button>
            </>
          )}

          {myQuestions.map((q, i) => (
            <div key={i} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(15,34,58,0.08)' }}>
              <div style={{ fontSize: 12, color: 'rgba(23,53,87,0.7)', lineHeight: 1.5, marginBottom: q.csm_reply ? 6 : 0 }}>{q.note_text}</div>
              {q.csm_reply && (
                <div style={{ background: 'rgba(23,53,87,0.04)', borderLeft: '3px solid rgba(23,53,87,0.2)', padding: '6px 10px', fontSize: 12, color: NAVY, lineHeight: 1.5, borderRadius: '0 6px 6px 0' }}>
                  <strong>Donc:</strong> {q.csm_reply}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

// ── Main export ─────────────────────────────────────────────────────────────────
export default function BriefPublicPage() {
  const { token } = useParams()
  const sessionKey = `brief_session_${token}`

  const stored = (() => { try { return JSON.parse(sessionStorage.getItem(sessionKey)) } catch { return null } })()

  const [phase,          setPhase]          = useState(stored ? 'loading' : 'auth')
  const [emailVal,       setEmailVal]       = useState(stored?.email || '')
  const [session,        setSession]        = useState(stored)
  const [instance,       setInstance]       = useState(null)
  const [responses,      setResponses]      = useState({})
  const [attachments,    setAttachments]    = useState({})
  const [attachmentUrls, setAttachmentUrls] = useState({})
  const [clientQs,       setClientQs]       = useState([])
  const [csmNotes,       setCsmNotes]       = useState([])
  const [readOnly,       setReadOnly]       = useState(false)
  const [activeIdx,      setActiveIdx]      = useState(0)
  const [saveStatus,     setSaveStatus]     = useState({})
  const [errorMsg,       setErrorMsg]       = useState('')
  const [completing,     setCompleting]     = useState(false)
  const [confirmOpen,    setConfirmOpen]    = useState(false)
  const [uploadingFor,   setUploadingFor]   = useState(null)
  const [showTour,       setShowTour]       = useState(false)
  const [coverOverlay,   setCoverOverlay]   = useState(false)
  const [coverLeaving,   setCoverLeaving]   = useState(false)
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [drawerText,     setDrawerText]     = useState('')
  const [drawerSending,  setDrawerSending]  = useState(false)
  const [drawerSent,     setDrawerSent]     = useState(false)
  const [doubtOpen,      setDoubtOpen]      = useState({})
  const [doubtText,      setDoubtText]      = useState({})
  const [doubtSending,   setDoubtSending]   = useState({})
  const [doubtSent,      setDoubtSent]      = useState({})

  const debounceRef = useRef({})

  const loadBrief = useCallback(async (email) => {
    setPhase('loading')
    try {
      const data = await callBrief({ action: 'get', token, email })
      const inst = data.instance
      setInstance(inst)

      const resMap = {}
      for (const r of (data.responses || [])) resMap[r.question_id] = r.response_text || ''
      setResponses(resMap)

      const attMap = {}
      const allAtts = []
      for (const a of (data.attachments || [])) {
        const qid = a.question_id || '__general__'
        if (!attMap[qid]) attMap[qid] = []
        attMap[qid].push(a)
        allAtts.push(a)
      }
      setAttachments(attMap)

      if (allAtts.length > 0) {
        const paths = allAtts.map(a => a.storage_path).filter(Boolean)
        try {
          const urlData = await callBrief({ action: 'get_attachment_urls', token, email, paths })
          const urlMap = {}
          for (const a of allAtts) if (urlData.urls[a.storage_path]) urlMap[a.id] = urlData.urls[a.storage_path]
          setAttachmentUrls(urlMap)
        } catch {}
      }

      setClientQs(data.client_questions || [])
      setCsmNotes(data.csm_notes || [])
      setReadOnly(inst.status === 'completed')

      const tourKey = `brief_tour_seen_${inst.id}`
      if (!sessionStorage.getItem(tourKey)) setShowTour(true)

      setPhase('form')
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao carregar brief')
      setPhase('error')
    }
  }, [token])

  useEffect(() => {
    if (stored) loadBrief(stored.email)
  }, []) // eslint-disable-line

  async function handleValidate(e) {
    e.preventDefault()
    const email = emailVal.trim()
    if (!email) return
    setPhase('validating'); setErrorMsg('')
    try {
      const data = await callBrief({ action: 'validate', token, email })
      const sess = { email, ...data }
      sessionStorage.setItem(sessionKey, JSON.stringify(sess))
      setSession(sess); setPhase('cover')
    } catch (err) {
      const msg = err.status === 404 ? 'Brief não encontrado ou link inválido.'
        : err.status === 403 ? (err.message?.includes('expirado') ? 'Este link expirou.' : 'E-mail não encontrado para este brief.')
        : err.message || 'Erro ao verificar acesso.'
      setErrorMsg(msg); setPhase('auth')
    }
  }

  function handleResponseChange(qId, value) {
    if (readOnly) return
    setResponses(prev => ({ ...prev, [qId]: value }))
    if (debounceRef.current[qId]) clearTimeout(debounceRef.current[qId])
    setSaveStatus(prev => ({ ...prev, [qId]: 'saving' }))
    debounceRef.current[qId] = setTimeout(async () => {
      try {
        await callBrief({ action: 'save_response', token, email: session.email, question_id: qId, response_text: value })
        setSaveStatus(prev => ({ ...prev, [qId]: 'saved' }))
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [qId]: null })), 3000)
      } catch {
        setSaveStatus(prev => ({ ...prev, [qId]: 'error' }))
      }
    }, 1500)
  }

  async function handleUpload(qId, file) {
    if (readOnly) return
    setUploadingFor(qId)
    try {
      const result = await saveBriefAttachment({ token, email: session.email, questionId: qId, file, instanceId: instance.id })
      if (!result.success) { alert(result.error || 'Erro ao enviar anexo'); return }
      setAttachments(prev => { const k = qId || '__general__'; return { ...prev, [k]: [...(prev[k] || []), result] } })
      if (result.storage_path) {
        try {
          const urlData = await callBrief({ action: 'get_attachment_urls', token, email: session.email, paths: [result.storage_path] })
          if (urlData.urls[result.storage_path]) setAttachmentUrls(prev => ({ ...prev, [result.id || result.storage_path]: urlData.urls[result.storage_path] }))
        } catch {}
      }
    } catch (err) { alert(err.message || 'Erro ao enviar anexo') }
    finally { setUploadingFor(null) }
  }

  async function handleDeleteAttachment(qId, attachmentId) {
    if (readOnly) return
    try {
      await deleteBriefAttachment({ token, email: session.email, attachmentId })
      setAttachments(prev => { const k = qId || '__general__'; return { ...prev, [k]: (prev[k] || []).filter(a => a.id !== attachmentId) } })
    } catch (err) { alert(err.message || 'Erro ao remover anexo') }
  }

  async function handleComplete() {
    setConfirmOpen(false); setCompleting(true)
    try {
      await callBrief({ action: 'complete', token, email: session.email })
      sessionStorage.removeItem(sessionKey); setPhase('thanks')
    } catch (err) { alert(err.message || 'Erro ao enviar. Tente novamente.') }
    finally { setCompleting(false) }
  }

  async function handleSubmitQuestion(qId) {
    const text = qId ? (doubtText[qId] || '') : drawerText
    if (!text.trim()) return
    if (qId) {
      setDoubtSending(prev => ({ ...prev, [qId]: true }))
      try {
        await callBrief({ action: 'submit_question', token, email: session.email, question_id: qId, note: text })
        setDoubtSent(prev => ({ ...prev, [qId]: true }))
        setClientQs(prev => [...prev, { question_id: qId, note_text: text, client_email: session.email, csm_reply: null }])
        setTimeout(() => {
          setDoubtOpen(prev => ({ ...prev, [qId]: false }))
          setDoubtSent(prev => ({ ...prev, [qId]: false }))
          setDoubtText(prev => ({ ...prev, [qId]: '' }))
        }, 2000)
      } catch (err) { alert(err.message) }
      finally { setDoubtSending(prev => ({ ...prev, [qId]: false })) }
    } else {
      setDrawerSending(true)
      try {
        await callBrief({ action: 'submit_question', token, email: session.email, question_id: null, note: text })
        setDrawerSent(true)
        setClientQs(prev => [...prev, { question_id: null, note_text: text, client_email: session.email, csm_reply: null }])
      } catch (err) { alert(err.message) }
      finally { setDrawerSending(false) }
    }
  }

  function hideCoverOverlay() {
    setCoverLeaving(true)
    setTimeout(() => { setCoverOverlay(false); setCoverLeaving(false) }, 350)
  }

  // ── Derived ──
  const sections       = instance?.structure_snapshot?.sections || []
  const progress       = calcProgress(sections, responses)
  const ready          = canComplete(sections, responses)
  const missing        = countMissing(sections, responses)
  const activeSection  = sections[activeIdx] || null
  const totalAnswered  = sections.reduce((acc, s) => acc + answeredOf(s, responses), 0)
  const totalQuestions = sections.reduce((acc, s) => acc + (s.questions || []).length, 0)

  // ── Thanks ──
  if (phase === 'thanks') {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Icons.CheckCircle size={24} color="#22c55e" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Brief enviado com sucesso!</h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>Em breve nossa equipe entrará em contato.</p>
        </div>
      </AuthLayout>
    )
  }

  // ── Cover (before form loads) ──
  if (phase === 'cover') {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <Cover session={session} onStart={() => loadBrief(session.email)} />
      </>
    )
  }

  // ── Auth / validating / loading / error ──
  if (phase !== 'form') {
    return (
      <AuthLayout>
        {phase === 'auth' && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>Verificar acesso</h2>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>Informe seu e-mail para acessar este brief.</p>
            {errorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>{errorMsg}</div>
            )}
            <form onSubmit={handleValidate}>
              <input type="email" value={emailVal} onChange={e => setEmailVal(e.target.value)} placeholder="seu@email.com" required autoFocus
                style={{ width: '100%', padding: '10px 14px', fontSize: 14, border: '1px solid #e2e8f0', borderRadius: 9, marginBottom: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = SKY}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
              <button type="submit" style={{ width: '100%', padding: '11px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Acessar Brief →
              </button>
            </form>
          </>
        )}
        {(phase === 'validating' || phase === 'loading') && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: '20px 0' }}>
            <Spinner />
            {phase === 'validating' ? 'Verificando acesso…' : 'Carregando brief…'}
          </div>
        )}
        {phase === 'error' && (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>Não foi possível carregar</h2>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>{errorMsg}</p>
            <button onClick={() => { sessionStorage.removeItem(sessionKey); setPhase('auth'); setErrorMsg('') }}
              style={{ width: '100%', padding: '10px 16px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Tentar novamente
            </button>
          </>
        )}
      </AuthLayout>
    )
  }

  // ── FORM ────────────────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{GLOBAL_CSS}</style>

      {/* Cover overlay (re-triggered from appbar) */}
      {coverOverlay && (
        <Cover session={session} onStart={hideCoverOverlay} leaving={coverLeaving} completed={readOnly} />
      )}

      {/* App shell */}
      <div style={{
        height: '100vh', overflow: 'hidden',
        display: 'grid', gridTemplateRows: 'auto 1fr auto',
        fontFamily: FONT,
        visibility: coverOverlay && !coverLeaving ? 'hidden' : 'visible',
      }}>

        {/* ── Appbar ── */}
        <header className="no-print" style={{
          background: '#fff', borderBottom: '1px solid rgba(15,34,58,0.08)',
          padding: '12px 28px',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center', gap: 24,
        }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button onClick={() => { setCoverOverlay(true); setCoverLeaving(false) }} style={{ background: 'transparent', border: '1px solid rgba(15,34,58,0.08)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 500, color: 'rgba(23,53,87,0.7)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
              <Icons.FileQuestion size={11} />Capa
            </button>
            <div style={{ width: 40, height: 40, background: LIME, borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20, color: NAVY, letterSpacing: '-0.04em', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)', flexShrink: 0 }}>d</div>
            <div style={{ minWidth: 0, lineHeight: 1.2 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgba(23,53,87,0.55)', fontWeight: 600, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>doncCX</span><span style={{ color: 'rgba(23,53,87,0.35)' }}>·</span><span>{instance?.title || 'Brief'}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, letterSpacing: '-0.1px', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session?.client_name || ''}
                {readOnly && <span style={{ fontSize: 10.5, background: 'rgba(26,165,106,0.15)', color: '#157a47', fontWeight: 600, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>Concluído</span>}
              </div>
            </div>
          </div>

          {/* Center — segmented progress */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 320, maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'rgba(23,53,87,0.55)' }}>
              <strong style={{ color: NAVY, fontWeight: 600 }}>Progresso do roteiro</strong>
              <span style={{ fontWeight: 600, color: NAVY }}>
                {progress}%
                <span style={{ color: 'rgba(23,53,87,0.35)', fontWeight: 500, marginLeft: 4 }}>· {totalAnswered}/{totalQuestions} respostas</span>
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: '#f0f1f4', display: 'flex', gap: 2, overflow: 'hidden' }}>
              {sections.map((s, i) => {
                const p = pctOf(s, responses)
                return (
                  <div key={i} style={{ flex: 1, background: '#f0f1f4', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: p === 100 ? GREEN : 'linear-gradient(90deg, #59c2ed, #0a6a96)', transform: `scaleX(${p / 100})`, transformOrigin: 'left', transition: 'transform 0.35s ease' }} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { alert('Gerando PDF…'); window.print() }} style={{ background: 'transparent', border: '1px solid rgba(15,34,58,0.08)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 500, color: 'rgba(23,53,87,0.7)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Icons.Download size={13} />Baixar PDF
            </button>
            <button title="Ajuda" onClick={() => setShowTour(true)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(15,34,58,0.08)', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'rgba(23,53,87,0.7)' }}>
              <Icons.HelpCircle size={14} />
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: 0, overflow: 'hidden' }}>

          {/* Rail */}
          <aside className="no-print" style={{ borderRight: '1px solid rgba(15,34,58,0.08)', background: '#fafbfc', padding: '22px 14px 18px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', position: 'relative' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgba(23,53,87,0.55)', fontWeight: 600, padding: '0 8px 10px' }}>Seções</div>

            {sections.map((sec, idx) => {
              const p      = pctOf(sec, responses)
              const done   = p === 100
              const active = idx === activeIdx
              const ans    = answeredOf(sec, responses)
              const total  = (sec.questions || []).length
              return (
                <button key={sec.id || idx} onClick={() => setActiveIdx(idx)} style={{
                  width: '100%', display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: 10, padding: '10px 10px 10px 8px',
                  borderRadius: 9, background: active ? '#fff' : 'transparent',
                  border: active ? '1px solid rgba(89,194,237,0.40)' : '1px solid transparent',
                  boxShadow: active ? '0 2px 8px -4px rgba(89,194,237,0.4)' : 'none',
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                }}>
                  <SectionRing pct={p} done={done} index={idx} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: active ? 600 : 500, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>{sec.title}</span>
                    {sec.audience && <span style={{ display: 'block', fontSize: 11, color: 'rgba(23,53,87,0.55)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.audience}</span>}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, lineHeight: 1.4, whiteSpace: 'nowrap', background: done ? 'rgba(34,160,98,0.12)' : active ? 'rgba(89,194,237,0.14)' : 'rgba(23,53,87,0.06)', color: done ? '#157a47' : active ? SKY_D : 'rgba(23,53,87,0.55)' }}>
                    {ans}/{total}
                  </span>
                </button>
              )
            })}

            <div style={{ height: 1, background: 'rgba(15,34,58,0.08)', margin: '14px 8px 10px' }} />
            <div style={{ padding: '8px 10px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(34,160,98,0.12)', color: '#157a47', borderRadius: 999, padding: '4px 10px 4px 8px', fontSize: 11, fontWeight: 600, alignSelf: 'flex-start' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, boxShadow: '0 0 0 3px rgba(26,165,106,0.18)' }} />
                Salvo automaticamente
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(23,53,87,0.55)' }}>Você pode pausar e continuar quando quiser.</div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(23,53,87,0.55)' }}>
                Dúvidas?{' '}
                <button onClick={() => { setDrawerOpen(true); setDrawerSent(false) }} style={{ background: 'none', border: 'none', padding: 0, color: SKY_D, fontWeight: 500, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                  Fale com a Donc
                </button>
              </div>
            </div>

            <QuestionDrawer
              open={drawerOpen} onClose={() => setDrawerOpen(false)}
              clientQuestions={clientQs}
              drawerText={drawerText} onChange={setDrawerText}
              onSubmit={() => handleSubmitQuestion(null)}
              submitting={drawerSending} sent={drawerSent}
            />
          </aside>

          {/* Main */}
          <main className="brief-main" style={{ background: '#eef1f5', padding: '28px 36px 40px', overflowY: 'auto' }}>
            {activeSection && (
              <div style={{ maxWidth: 760, margin: '0 auto' }}>

                {/* Completed banner */}
                {readOnly && (
                  <div style={{ background: '#f0fdf4', border: '1px solid rgba(34,160,98,0.25)', borderRadius: 10, padding: '12px 18px', marginBottom: 24, fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icons.Check size={14} color="#15803d" />
                    Este brief já foi enviado em {formatDate(instance?.completed_at)}. Obrigado!
                  </div>
                )}

                {/* Section header */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(23,53,87,0.55)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Seção {activeIdx + 1} de {sections.length}</span>
                    <span style={{ display: 'inline-flex', gap: 3 }}>
                      {sections.map((s, i) => {
                        const p = pctOf(s, responses)
                        return <span key={i} style={{ width: 14, height: 3, borderRadius: 999, background: p === 100 ? GREEN : i === activeIdx ? SKY_D : 'rgba(23,53,87,0.14)' }} />
                      })}
                    </span>
                  </div>

                  <h1 style={{ fontSize: 26, fontWeight: 700, color: NAVY, margin: '0 0 14px', letterSpacing: '-0.5px' }}>{activeSection.title}</h1>

                  {activeSection.deliverable && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(89,194,237,0.06)', border: '1px solid rgba(89,194,237,0.20)', borderLeft: `3px solid ${SKY}`, borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: 'rgba(23,53,87,0.7)', lineHeight: 1.55 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(89,194,237,0.14)', color: SKY_D, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                        <Icons.Check size={11} />
                      </span>
                      <div><strong style={{ color: NAVY, fontWeight: 600, marginRight: 4 }}>Entregável:</strong>{activeSection.deliverable}</div>
                    </div>
                  )}

                  {activeSection.audience && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '6px 12px 6px 8px', background: '#fff', border: '1px dashed rgba(15,34,58,0.14)', borderRadius: 999, fontSize: 11.5, color: 'rgba(23,53,87,0.7)' }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(23,53,87,0.06)', display: 'grid', placeItems: 'center' }}>
                        <Icons.User size={11} color="rgba(23,53,87,0.7)" />
                      </span>
                      Indicada para <strong style={{ color: NAVY, fontWeight: 600 }}>{activeSection.audience}</strong>
                    </div>
                  )}
                </div>

                {/* Questions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(activeSection.questions || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((q, qi) => (
                    <QuestionCard
                      key={q.id}
                      question={q} index={qi}
                      value={responses[q.id] || ''}
                      onChange={v => handleResponseChange(q.id, v)}
                      saveStatus={saveStatus[q.id]}
                      readOnly={readOnly}
                      attachments={attachments[q.id] || []}
                      attachmentUrls={attachmentUrls}
                      onUpload={file => handleUpload(q.id, file)}
                      onDelete={attId => handleDeleteAttachment(q.id, attId)}
                      isUploading={uploadingFor === q.id}
                      clientQuestions={clientQs}
                      csmNotes={csmNotes}
                      doubtOpen={!!doubtOpen[q.id]}
                      doubtText={doubtText[q.id] || ''}
                      doubtSent={!!doubtSent[q.id]}
                      doubtSubmitting={!!doubtSending[q.id]}
                      onDoubtToggle={() => setDoubtOpen(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                      onDoubtTextChange={t => setDoubtText(prev => ({ ...prev, [q.id]: t }))}
                      onDoubtSubmit={() => handleSubmitQuestion(q.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Print-only: all sections */}
            <div className="print-section">
              {sections.map((sec, si) => (
                <div key={sec.id || si} style={{ pageBreakBefore: si > 0 ? 'always' : undefined, paddingBottom: 32 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{sec.title}</h2>
                  {sec.deliverable && <p style={{ borderLeft: `3px solid ${SKY}`, paddingLeft: 12, color: 'rgba(23,53,87,0.8)', marginBottom: 16 }}><strong>Entregável:</strong> {sec.deliverable}</p>}
                  {(sec.questions || []).map((q, qi) => (
                    <div key={q.id} style={{ marginBottom: 20 }}>
                      <div style={{ fontWeight: 600, color: NAVY, marginBottom: 4 }}>{qi + 1}. {q.text}{q.required && ' *'}</div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', minHeight: 48, background: '#fafafa', fontSize: 13, color: responses[q.id] ? NAVY : '#94a3b8' }}>
                        {responses[q.id] || '(sem resposta)'}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </main>
        </div>

        {/* ── Footer ── */}
        <footer className="no-print" style={{ background: '#fff', borderTop: '1px solid rgba(15,34,58,0.08)', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'rgba(23,53,87,0.55)' }}>
            <span>
              {totalAnswered} respondidas
              {missing > 0 && <span style={{ color: '#d98c1e', fontWeight: 500, marginLeft: 4 }}>· {missing} obrigatórias pendentes</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setActiveIdx(i => Math.max(0, i - 1))} disabled={activeIdx === 0}
              style={{ background: 'none', color: activeIdx === 0 ? 'rgba(23,53,87,0.25)' : 'rgba(23,53,87,0.7)', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: activeIdx === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              ← Anterior
            </button>
            <button onClick={() => { toast.success('Progresso salvo'); setCoverOverlay(true) }} style={{ background: '#fff', color: NAVY, border: '1px solid rgba(15,34,58,0.14)', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              Salvar e sair
            </button>
            {activeIdx < sections.length - 1 ? (
              <button onClick={() => setActiveIdx(i => i + 1)} style={{ background: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                Próxima seção →
              </button>
            ) : (
              <button disabled={!ready || completing || readOnly} onClick={() => setConfirmOpen(true)}
                style={{ background: ready && !readOnly ? LIME : 'rgba(23,53,87,0.10)', color: ready && !readOnly ? NAVY : 'rgba(23,53,87,0.30)', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: ready && !readOnly ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {completing ? 'Enviando…' : 'Concluir e enviar'}
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* ── Confirm modal ── */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 400, width: '100%' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Confirmar envio</h3>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 24 }}>Tem certeza? Após enviar não será possível editar as respostas.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmOpen(false)} style={{ flex: 1, padding: '10px 16px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleComplete} style={{ flex: 1, padding: '10px 16px', background: LIME, color: NAVY, border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar envio</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tour ── */}
      {showTour && (
        <TourModal onClose={() => {
          if (instance?.id) sessionStorage.setItem(`brief_tour_seen_${instance.id}`, '1')
          setShowTour(false)
        }} />
      )}
    </>
  )
}
