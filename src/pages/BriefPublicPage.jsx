import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { saveBriefAttachment, deleteBriefAttachment } from '../services/briefAttachments/saveBriefAttachment'

const NAVY = '#173557'
const LIME  = '#d3da47'
const SKY   = '#59c2ed'

const BASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://etfeqblaeuhaobefxilp.supabase.co'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const base = {
  fontFamily: "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
}

// ── Edge function helper ────────────────────────────────────────────────────────
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
function sectionStatus(section, responses) {
  const req = (section.questions || []).filter(q => q.required)
  if (req.length === 0) return 'done'
  const answered = req.filter(q => (responses[q.id] || '').trim())
  if (answered.length === 0) return 'empty'
  if (answered.length === req.length) return 'done'
  return 'partial'
}

function calcProgress(sections, responses) {
  const all = sections.flatMap(s => (s.questions || []).filter(q => q.required))
  if (all.length === 0) return 100
  const answered = all.filter(q => (responses[q.id] || '').trim())
  return Math.round((answered.length / all.length) * 100)
}

function canComplete(sections, responses) {
  const req = sections.flatMap(s => (s.questions || []).filter(q => q.required))
  return req.every(q => (responses[q.id] || '').trim())
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Mini UI components ──────────────────────────────────────────────────────────
function Logo({ subtitle }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 11,
        background: NAVY,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <span style={{ color: LIME, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>d</span>
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          doncCX · {subtitle}
        </div>
      )}
    </div>
  )
}

function Card({ children }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16, padding: '40px 36px',
      maxWidth: 420, width: '100%',
      boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
    }}>
      {children}
    </div>
  )
}

function PrimaryBtn({ children, disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      style={{
        width: '100%', padding: '11px 16px',
        background: disabled ? '#94a3b8' : NAVY, color: '#fff',
        border: 'none', borderRadius: 9,
        fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', letterSpacing: 0.2, transition: 'opacity .15s',
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.opacity = '0.88')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      {...props}
    >
      {children}
    </button>
  )
}

function GhostBtn({ children, style: extraStyle, ...props }) {
  return (
    <button
      style={{
        width: '100%', padding: '10px 16px',
        background: 'transparent', color: '#64748b',
        border: '1px solid #e2e8f0', borderRadius: 9,
        fontWeight: 600, fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit', marginTop: 8,
        ...extraStyle,
      }}
      {...props}
    >
      {children}
    </button>
  )
}

function Spinner({ size = 36, color = SKY }) {
  return (
    <>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        border: `3px solid ${color}`, borderTopColor: 'transparent',
        animation: 'spin 0.7s linear infinite',
        margin: '0 auto 16px',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}

// ── SVG icons ──────────────────────────────────────────────────────────────────
const IcoCheck = ({ size = 14, color = LIME }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IcoHalf = ({ size = 14, color = SKY }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
    <circle cx={12} cy={12} r={9} />
    <path d="M12 3 A9 9 0 0 1 12 21" fill={color} />
  </svg>
)
const IcoEmpty = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth={2}>
    <circle cx={12} cy={12} r={9} />
  </svg>
)
const IcoChevron = ({ down = false, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    {down ? <polyline points="6 9 12 15 18 9" /> : <polyline points="6 15 12 9 18 15" />}
  </svg>
)
const IcoHelpCircle = ({ size = 15, color = SKY }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={12} cy={12} r={10} />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1={12} y1={17} x2="12.01" y2={17} />
  </svg>
)
const IcoLayout = ({ size = 28, color = SKY }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
    <line x1={3} y1={9} x2={21} y2={9} />
    <line x1={9} y1={21} x2={9} y2={9} />
  </svg>
)
const IcoTarget = ({ size = 28, color = SKY }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={12} cy={12} r={10} />
    <circle cx={12} cy={12} r={6} />
    <circle cx={12} cy={12} r={2} />
  </svg>
)
const IcoSave = ({ size = 28, color = SKY }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
)

// ── Section status icon ────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === 'done')    return <IcoCheck size={14} color={LIME} />
  if (status === 'partial') return <IcoHalf  size={14} color={SKY}  />
  return <IcoEmpty size={14} />
}

// ── Save indicator ─────────────────────────────────────────────────────────────
function SaveIndicator({ status }) {
  if (!status) return null
  if (status === 'saving') return (
    <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        border: '2px solid #94a3b8', borderTopColor: 'transparent',
        display: 'inline-block', animation: 'spin 0.7s linear infinite',
      }} />
      Salvando...
    </span>
  )
  if (status === 'saved') return (
    <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <IcoCheck size={11} color="#22c55e" /> Salvo
    </span>
  )
  if (status === 'error') return (
    <span style={{ fontSize: 11, color: '#ef4444', flexShrink: 0 }}>Erro ao salvar</span>
  )
  return null
}

// ── Cover page ─────────────────────────────────────────────────────────────────
function CoverPage({ session, onStart }) {
  const [logoError, setLogoError] = useState(false)
  const clientName   = session?.client_name || ''
  const logoUrl      = session?.client_logo_url
  const capabilities = session?.operation_capabilities || []
  const sentAt       = session?.instance?.sent_at
  const csmName      = session?.csm_name

  const formattedDate = sentAt
    ? new Date(sentAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase())
    : ''

  const labelSt = {
    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)',
    whiteSpace: 'nowrap', paddingTop: 2,
  }
  const valueSt = { fontSize: 14, fontWeight: 500, color: '#fff' }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0e1f3a 0%, #173557 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 24px',
        fontFamily: "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Radial overlays */}
        <div style={{
          position: 'absolute', top: '-15%', right: '-8%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(89,194,237,0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-15%', left: '-5%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(211,218,71,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Top gradient bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, #59c2ed, #d3da47)',
        }} />

        <div style={{ maxWidth: 680, width: '100%', position: 'relative', zIndex: 1 }}>
          {/* DONC logo */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
              <span style={{ color: '#d3da47' }}>DONC</span>
              <span style={{ color: '#59c2ed' }}>.</span>
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase', letterSpacing: 2, marginTop: 6,
            }}>
              Plataforma de gestão de equipes externas
            </div>
          </div>

          {/* Divider lime */}
          <div style={{ width: 60, height: 3, background: '#d3da47', marginBottom: 28 }} />

          {/* Title */}
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 8px', lineHeight: 1.2 }}>
            Roteiro de Projeto Técnico
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', margin: '0 0 36px' }}>
            Levantamento de regras de negócio
          </p>

          {/* Metadata block */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, padding: '20px 24px',
            marginBottom: 40,
          }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {/* Client logo — fixed circle */}
              <div style={{ flexShrink: 0, width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {logoUrl && !logoError ? (
                  <img
                    src={logoUrl}
                    alt={clientName}
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div style={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: '#59c2ed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36, fontWeight: 800, color: '#173557',
                  }}>
                    {clientName.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </div>

              {/* Labels + values */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr',
                columnGap: 20, rowGap: 10,
                alignItems: 'center', flex: 1,
              }}>
                {clientName && (
                  <>
                    <span style={labelSt}>Cliente</span>
                    <span style={valueSt}>{clientName}</span>
                  </>
                )}
                {capabilities.length > 0 && (
                  <>
                    <span style={labelSt}>Operação</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {capabilities.map((cap, i) => {
                        const color = cap.color || '#59c2ed'
                        return (
                          <span key={i} style={{
                            background: `${color}15`,
                            border: `1px solid ${color}`,
                            color, borderRadius: 4,
                            padding: '2px 8px', fontSize: 12, fontWeight: 500,
                          }}>{cap.name}</span>
                        )
                      })}
                    </div>
                  </>
                )}
                {formattedDate && (
                  <>
                    <span style={labelSt}>Data</span>
                    <span style={valueSt}>{formattedDate}</span>
                  </>
                )}
                {csmName && (
                  <>
                    <span style={labelSt}>Preparado por</span>
                    <span style={valueSt}>{csmName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={onStart}
            style={{
              padding: '13px 32px',
              background: '#d3da47', color: '#173557',
              border: 'none', borderRadius: 9,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              fontFamily: "'Montserrat',-apple-system,sans-serif",
              display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'filter .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            Iniciar preenchimento
            <span style={{ fontSize: 18 }}>→</span>
          </button>

          {/* Footer */}
          <div style={{ marginTop: 32, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
            Documento confidencial — DONC + {clientName || 'Cliente'}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Tour modal ─────────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    Icon: IcoLayout,
    title: 'Navegue pelas seções',
    text: 'Use o menu lateral para navegar entre as seções do questionário. Você pode preencher em qualquer ordem.',
  },
  {
    Icon: IcoTarget,
    title: 'Entregável esperado',
    text: 'Cada seção tem um entregável destacado em verde. Ele indica o objetivo daquela parte do questionário.',
  },
  {
    Icon: IcoHelpCircle,
    title: 'Dicas de preenchimento',
    text: 'Perguntas com o ícone azul têm dicas de preenchimento. Passe o mouse sobre o ícone para ver a orientação.',
  },
  {
    Icon: IcoSave,
    title: 'Salvamento automático',
    text: 'Suas respostas são salvas automaticamente. Você pode fechar e retornar quando quiser — nada será perdido.',
  },
]

function TourModal({ onClose }) {
  const [step, setStep] = useState(0)
  const { Icon, title, text } = TOUR_STEPS[step]
  const isLast = step === TOUR_STEPS.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      fontFamily: "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 12,
        maxWidth: 420, width: '100%',
        padding: '32px 28px 24px',
        position: 'relative',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#94a3b8', lineHeight: 1, padding: 4,
          }}
        >✕</button>

        {/* Icon badge */}
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: 'rgba(89,194,237,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <Icon size={28} color={SKY} />
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: '0 0 10px' }}>
          {title}
        </h3>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: '0 0 28px' }}>
          {text}
        </p>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, justifyContent: 'center' }}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 99,
              background: i === step ? SKY : '#e2e8f0',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1, padding: '10px 16px',
                background: 'transparent', color: '#64748b',
                border: '1px solid #e2e8f0', borderRadius: 9,
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >Anterior</button>
          )}
          <button
            onClick={isLast ? onClose : () => setStep(s => s + 1)}
            style={{
              flex: 1, padding: '10px 16px',
              background: NAVY, color: '#fff',
              border: 'none', borderRadius: 9,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >{isLast ? 'Entendi' : 'Próximo'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Cover inline (shown in form sidebar view when Apresentação is active) ──────
function CoverInline({ session, onStart }) {
  const [logoError, setLogoError] = useState(false)
  const clientName   = session?.client_name || ''
  const logoUrl      = session?.client_logo_url
  const capabilities = session?.operation_capabilities || []
  const sentAt       = session?.instance?.sent_at
  const csmName      = session?.csm_name

  const formattedDate = sentAt
    ? new Date(sentAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase())
    : ''

  const labelSt = {
    fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap',
  }
  const valueSt = { fontSize: 13, fontWeight: 500, color: '#fff' }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{
        background: 'linear-gradient(135deg, #0e1f3a 0%, #173557 100%)',
        borderRadius: 12, padding: '36px 40px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #59c2ed, #d3da47)' }} />
        {/* Radial overlays */}
        <div style={{ position: 'absolute', top: '-20%', right: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(89,194,237,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-5%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(211,218,71,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* DONC logo */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>
              <span style={{ color: '#d3da47' }}>DONC</span>
              <span style={{ color: '#59c2ed' }}>.</span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
              Plataforma de gestão de equipes externas
            </div>
          </div>
          <div style={{ width: 40, height: 2, background: '#d3da47', marginBottom: 20 }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>
            Roteiro de Projeto Técnico
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: '0 0 28px' }}>
            Levantamento de regras de negócio
          </p>

          {/* Metadata */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '16px 20px', marginBottom: 28 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ flexShrink: 0, width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {logoUrl && !logoError ? (
                  <img src={logoUrl} alt={clientName}
                    style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    onError={() => setLogoError(true)} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#59c2ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#173557' }}>
                    {clientName.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 8, alignItems: 'center', flex: 1 }}>
                {clientName && (<><span style={labelSt}>Cliente</span><span style={valueSt}>{clientName}</span></>)}
                {capabilities.length > 0 && (
                  <><span style={labelSt}>Operação</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {capabilities.map((cap, i) => {
                      const color = cap.color || '#59c2ed'
                      return (
                        <span key={i} style={{ background: `${color}15`, border: `1px solid ${color}`, color, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 500 }}>{cap.name}</span>
                      )
                    })}
                  </div></>
                )}
                {formattedDate && (<><span style={labelSt}>Data</span><span style={valueSt}>{formattedDate}</span></>)}
                {csmName && (<><span style={labelSt}>Preparado por</span><span style={valueSt}>{csmName}</span></>)}
              </div>
            </div>
          </div>

          <button
            onClick={onStart}
            style={{
              padding: '11px 24px',
              background: '#d3da47', color: '#173557',
              border: 'none', borderRadius: 9,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              fontFamily: "'Montserrat',-apple-system,sans-serif",
              display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'filter .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            Iniciar preenchimento <span style={{ fontSize: 16 }}>→</span>
          </button>

          <div style={{ marginTop: 20, fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
            Documento confidencial — DONC + {clientName || 'Cliente'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function BriefPublicPage() {
  const { token } = useParams()

  const sessionKey = `brief_session_${token}`

  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem(sessionKey)) } catch { return null }
  })()

  const [phase,    setPhase]    = useState(stored ? 'loading' : 'auth')
  const [emailVal, setEmailVal] = useState(stored?.email || '')
  const [session,  setSession]  = useState(stored)
  const [instance, setInstance] = useState(null)
  const [responses, setResponses] = useState({})
  const [attachments, setAttachments] = useState({})
  const [attachmentUrls, setAttachmentUrls] = useState({})
  const [readOnly,  setReadOnly]  = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [saveStatus, setSaveStatus] = useState({})
  const [errorMsg,   setErrorMsg]   = useState('')
  const [completing, setCompleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [showTour, setShowTour] = useState(false)

  const debounceRef = useRef({})

  // ── Load brief (called from cover "Iniciar" or auto-restore) ───────────────
  const loadBrief = useCallback(async (email) => {
    setPhase('loading')
    try {
      const data = await callBrief({ action: 'get', token, email })
      const inst = data.instance
      setInstance(inst)

      const resMap = {}
      for (const r of (data.responses || [])) {
        resMap[r.question_id] = r.response_text || ''
      }
      setResponses(resMap)

      const attMap = {}
      const allAttachments = []
      for (const a of (data.attachments || [])) {
        const qid = a.question_id || '__general__'
        if (!attMap[qid]) attMap[qid] = []
        attMap[qid].push(a)
        allAttachments.push(a)
      }
      setAttachments(attMap)

      if (allAttachments.length > 0) {
        const paths = allAttachments.map(a => a.storage_path).filter(Boolean)
        try {
          const urlData = await callBrief({ action: 'get_attachment_urls', token, email, paths })
          const urlMap = {}
          for (const a of allAttachments) {
            if (urlData.urls[a.storage_path]) {
              urlMap[a.id] = urlData.urls[a.storage_path]
            }
          }
          setAttachmentUrls(urlMap)
        } catch {
          // non-critical
        }
      }

      setReadOnly(inst.status === 'completed')

      // Show tour on first visit
      const tourKey = `brief_tour_seen_${inst.id}`
      if (!sessionStorage.getItem(tourKey)) {
        setShowTour(true)
      }

      setPhase('form')
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao carregar brief')
      setPhase('error')
    }
  }, [token])

  // Auto-load from stored session (skip cover)
  useEffect(() => {
    if (stored) {
      loadBrief(stored.email)
    }
  }, []) // eslint-disable-line

  // ── Email validation → cover ───────────────────────────────────────────────
  async function handleValidate(e) {
    e.preventDefault()
    const email = emailVal.trim()
    if (!email) return
    setPhase('validating')
    setErrorMsg('')
    try {
      const data = await callBrief({ action: 'validate', token, email })
      const sess = { email, ...data }
      sessionStorage.setItem(sessionKey, JSON.stringify(sess))
      setSession(sess)
      setPhase('cover')
    } catch (err) {
      const msg =
        err.status === 404 ? 'Brief não encontrado ou link inválido.' :
        err.status === 403 ? (err.message?.includes('expirado') ? 'Este link expirou.' : 'E-mail não encontrado para este brief.') :
        err.message || 'Erro ao verificar acesso.'
      setErrorMsg(msg)
      setPhase('auth')
    }
  }

  // ── Auto-save ──────────────────────────────────────────────────────────────
  function handleResponseChange(qId, value) {
    if (readOnly) return
    setResponses(prev => ({ ...prev, [qId]: value }))

    if (debounceRef.current[qId]) clearTimeout(debounceRef.current[qId])
    setSaveStatus(prev => ({ ...prev, [qId]: 'saving' }))

    debounceRef.current[qId] = setTimeout(async () => {
      try {
        await callBrief({
          action: 'save_response',
          token,
          email: session.email,
          question_id: qId,
          response_text: value,
        })
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
      const result = await saveBriefAttachment({
        token,
        email: session.email,
        questionId: qId,
        file,
        instanceId: instance.id,
      })
      if (!result.success) {
        alert(result.error || 'Erro ao enviar anexo')
        return
      }
      setAttachments(prev => {
        const key = qId || '__general__'
        const existing = prev[key] || []
        return { ...prev, [key]: [...existing, result] }
      })
      if (result.storage_path) {
        try {
          const urlData = await callBrief({ action: 'get_attachment_urls', token, email: session.email, paths: [result.storage_path] })
          if (urlData.urls[result.storage_path]) {
            setAttachmentUrls(prev => ({ ...prev, [result.id || result.storage_path]: urlData.urls[result.storage_path] }))
          }
        } catch {
          // non-critical
        }
      }
    } catch (err) {
      alert(err.message || 'Erro ao enviar anexo')
    } finally {
      setUploadingFor(null)
    }
  }

  async function handleDeleteAttachment(qId, attachmentId) {
    if (readOnly) return
    try {
      await deleteBriefAttachment({ token, email: session.email, attachmentId })
      setAttachments(prev => {
        const key = qId || '__general__'
        const filtered = (prev[key] || []).filter(a => a.id !== attachmentId)
        return { ...prev, [key]: filtered }
      })
    } catch (err) {
      alert(err.message || 'Erro ao remover anexo')
    }
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  async function handleComplete() {
    setConfirmOpen(false)
    setCompleting(true)
    try {
      await callBrief({ action: 'complete', token, email: session.email })
      sessionStorage.removeItem(sessionKey)
      setPhase('thanks')
    } catch (err) {
      alert(err.message || 'Erro ao enviar. Tente novamente.')
    } finally {
      setCompleting(false)
    }
  }

  const sections = instance?.structure_snapshot?.sections || []

  // ── Thanks ─────────────────────────────────────────────────────────────────
  if (phase === 'thanks') {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, ...base }}>
          <Card>
            <Logo subtitle="Brief de Discovery" />
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#f0fdf4', border: `2px solid #22c55e`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <IcoCheck size={24} color="#22c55e" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
                Brief enviado com sucesso!
              </h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
                Em breve nossa equipe entrará em contato.
              </p>
            </div>
          </Card>
        </div>
      </>
    )
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  if (phase === 'cover') {
    return (
      <CoverPage
        session={session}
        onStart={() => loadBrief(session.email)}
      />
    )
  }

  // ── Auth / loading / error ─────────────────────────────────────────────────
  if (phase !== 'form') {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, ...base }}>

          {phase === 'auth' && (
            <Card>
              <Logo subtitle="Brief de Discovery" />
              <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>
                Verificar acesso
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
                Informe seu e-mail para acessar este brief.
              </p>
              {errorMsg && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>
                  {errorMsg}
                </div>
              )}
              <form onSubmit={handleValidate}>
                <input
                  type="email"
                  value={emailVal}
                  onChange={e => setEmailVal(e.target.value)}
                  placeholder="seu@email.com"
                  required autoFocus
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 14,
                    border: '1px solid #e2e8f0', borderRadius: 9,
                    marginBottom: 12, fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s',
                  }}
                  onFocus={e  => (e.target.style.borderColor = SKY)}
                  onBlur={e   => (e.target.style.borderColor = '#e2e8f0')}
                />
                <PrimaryBtn type="submit">Acessar Brief →</PrimaryBtn>
              </form>
            </Card>
          )}

          {(phase === 'validating' || phase === 'loading') && (
            <Card>
              <Logo subtitle="Brief de Discovery" />
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: '20px 0' }}>
                <Spinner />
                {phase === 'validating' ? 'Verificando acesso…' : 'Carregando brief…'}
              </div>
            </Card>
          )}

          {phase === 'error' && (
            <Card>
              <Logo subtitle="Brief de Discovery" />
              <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>
                Não foi possível carregar
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
                {errorMsg}
              </p>
              <GhostBtn onClick={() => { sessionStorage.removeItem(sessionKey); setPhase('auth'); setErrorMsg('') }}>
                Tentar novamente
              </GhostBtn>
            </Card>
          )}
        </div>
      </>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const progress = calcProgress(sections, responses)
  const ready    = canComplete(sections, responses)
  const activeSection = sections[activeIdx] || null

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        textarea { resize: vertical; }
        textarea:focus, input:focus { outline: none; }
        @media (max-width: 768px) {
          .brief-sidebar { display: none !important; }
          .brief-sidebar.open { display: block !important; }
          .brief-mobile-header { display: flex !important; }
        }
        @media (min-width: 769px) {
          .brief-sidebar { display: block !important; }
          .brief-mobile-header { display: none !important; }
        }
        .brief-help-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
        }
        .brief-help-wrap .brief-tooltip {
          display: none;
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: #173557;
          color: #fff;
          font-size: 0.82rem;
          line-height: 1.55;
          border-radius: 6px;
          padding: 8px 12px;
          max-width: 280px;
          width: max-content;
          white-space: normal;
          z-index: 100;
          pointer-events: none;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          font-family: 'Montserrat', sans-serif;
          font-weight: 400;
        }
        .brief-help-wrap:hover .brief-tooltip { display: block; }
        .brief-help-wrap svg { opacity: 0.7; cursor: help; transition: opacity .15s; }
        .brief-help-wrap:hover svg { opacity: 1; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#f8fafc', ...base }}>

        {/* ── Top header ─────────────────────────────────────── */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 7, background: NAVY,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: LIME, fontWeight: 800, fontSize: 15, lineHeight: 1 }}>d</span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {instance?.title || 'Brief'}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {session?.client_name || ''}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 120, height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: progress === 100 ? LIME : SKY,
                width: `${progress}%`, transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', minWidth: 32 }}>{progress}%</span>
          </div>

          {readOnly && (
            <div style={{ fontSize: 11, color: '#fff', background: '#22c55e', borderRadius: 6, padding: '3px 8px', fontWeight: 600, flexShrink: 0 }}>
              Concluído
            </div>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', paddingTop: 57, minHeight: '100vh' }}>

          {/* Mobile section nav */}
          <div
            className="brief-mobile-header"
            style={{
              display: 'none',
              position: 'fixed', top: 57, left: 0, right: 0, zIndex: 40,
              background: '#fff', borderBottom: '1px solid #e2e8f0',
              padding: '8px 16px',
              alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeIdx === -1 ? 'Apresentação' : (activeSection?.title || 'Seções')}
            </span>
            <button
              onClick={() => setMobileSidebarOpen(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 11, fontWeight: 600 }}>Seções</span>
              <IcoChevron down={!mobileSidebarOpen} size={14} />
            </button>
          </div>

          {/* ── Sidebar ──────────────────────────────────────── */}
          <div
            className={`brief-sidebar${mobileSidebarOpen ? ' open' : ''}`}
            style={{
              width: 260, flexShrink: 0,
              borderRight: '1px solid #e2e8f0', background: '#fff',
              position: 'fixed', top: 57, bottom: 0,
              overflowY: 'auto', zIndex: 30,
            }}
          >
            <div style={{ padding: '16px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, paddingLeft: 8 }}>
                Seções
              </div>

              {/* Apresentação item */}
              <button
                onClick={() => { setActiveIdx(-1); setMobileSidebarOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', textAlign: 'left',
                  padding: '9px 10px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: activeIdx === -1 ? '#eff6ff' : 'transparent',
                  marginBottom: 2, transition: 'background .1s',
                }}
                onMouseEnter={e => activeIdx !== -1 && (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => activeIdx !== -1 && (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <IcoLayout size={14} color={activeIdx === -1 ? NAVY : '#94a3b8'} />
                </span>
                <span style={{ fontSize: 13, fontWeight: activeIdx === -1 ? 700 : 500, color: activeIdx === -1 ? NAVY : '#475569', lineHeight: 1.3 }}>
                  Apresentação
                </span>
              </button>

              {sections.map((sec, idx) => {
                const st = sectionStatus(sec, responses)
                const active = idx === activeIdx
                return (
                  <button
                    key={sec.id || idx}
                    onClick={() => { setActiveIdx(idx); setMobileSidebarOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', textAlign: 'left',
                      padding: '9px 10px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: active ? '#eff6ff' : 'transparent',
                      marginBottom: 2, transition: 'background .1s',
                    }}
                    onMouseEnter={e => !active && (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <StatusIcon status={st} />
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? NAVY : '#475569', lineHeight: 1.3,
                    }}>
                      {sec.title}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Main content ─────────────────────────────────── */}
          <div style={{ flex: 1, marginLeft: 260, padding: '32px 40px 120px', minWidth: 0 }}>
            {activeIdx === -1 ? (
              <CoverInline session={session} onStart={() => setActiveIdx(0)} />
            ) : activeSection && (
              <div style={{ maxWidth: 700, margin: '0 auto' }}>

                {/* Completed banner */}
                {readOnly && (
                  <div style={{
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 10, padding: '12px 18px',
                    marginBottom: 24, fontSize: 13, color: '#15803d',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <IcoCheck size={14} color="#15803d" />
                    Este brief já foi enviado em {formatDate(instance?.completed_at)}. Obrigado!
                  </div>
                )}

                {/* Section header */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                    Seção {activeIdx + 1} de {sections.length}
                  </div>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 12px' }}>
                    {activeSection.title}
                  </h1>

                  {/* Deliverable — styled */}
                  {activeSection.deliverable && (
                    <div style={{
                      borderLeft: `3px solid ${LIME}`,
                      background: 'rgba(211,218,71,0.08)',
                      borderRadius: '0 8px 8px 0',
                      padding: '0.65rem 0.9rem',
                      fontSize: 14, lineHeight: 1.6, color: '#1e293b',
                    }}>
                      <span style={{ fontWeight: 600, color: NAVY }}>✓ Entregável: </span>
                      {activeSection.deliverable}
                    </div>
                  )}
                </div>

                {/* Callout */}
                {activeSection.callout && (
                  <div style={{
                    background: `rgba(89,194,237,0.08)`,
                    border: `1px solid ${SKY}`,
                    borderRadius: 10, padding: '12px 16px',
                    marginBottom: 24, fontSize: 13, color: '#0e7490', lineHeight: 1.6,
                  }}>
                    {activeSection.callout}
                  </div>
                )}

                {/* Audience tag */}
                {activeSection.audience && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: `rgba(23,53,87,0.07)`,
                    borderRadius: 20, padding: '5px 12px',
                    fontSize: 12, fontWeight: 600, color: NAVY,
                    marginBottom: 28,
                  }}>
                    Esta seção é indicada para {activeSection.audience}
                  </div>
                )}

                {/* Questions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {(activeSection.questions || [])
                    .slice()
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map(q => (
                      <QuestionField
                        key={q.id}
                        question={q}
                        value={responses[q.id] || ''}
                        onChange={v => handleResponseChange(q.id, v)}
                        saveStatus={saveStatus[q.id]}
                        readOnly={readOnly}
                        attachments={(attachments[q.id] || []).concat(attachments['__general__'] || [])}
                        attachmentUrls={attachmentUrls}
                        onUpload={file => handleUpload(q.id, file)}
                        onDelete={attachmentId => handleDeleteAttachment(q.id, attachmentId)}
                        isUploading={uploadingFor === q.id}
                      />
                    ))
                  }
                </div>

                {/* Section navigation */}
                <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
                  {activeIdx > 0 && (
                    <GhostBtn
                      style={{ width: 'auto', padding: '10px 20px', marginTop: 0 }}
                      onClick={() => setActiveIdx(i => i - 1)}
                    >
                      ← Anterior
                    </GhostBtn>
                  )}
                  {activeIdx < sections.length - 1 && (
                    <button
                      onClick={() => setActiveIdx(i => i + 1)}
                      style={{
                        flex: 1, padding: '10px 20px',
                        background: NAVY, color: '#fff',
                        border: 'none', borderRadius: 9,
                        fontWeight: 700, fontSize: 14,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Próxima seção →
                    </button>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ── Fixed footer — Concluir ─────────────────────────── */}
        {!readOnly && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
            borderTop: '1px solid #e2e8f0',
            padding: '14px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
          }}>
            {!ready && (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Preencha todas as questões obrigatórias para concluir
              </span>
            )}
            <button
              disabled={!ready || completing}
              onClick={() => setConfirmOpen(true)}
              style={{
                padding: '11px 28px',
                background: ready ? LIME : '#e2e8f0',
                color: ready ? NAVY : '#94a3b8',
                border: 'none', borderRadius: 9,
                fontWeight: 700, fontSize: 14,
                cursor: ready ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'all .15s',
              }}
            >
              {completing ? 'Enviando…' : 'Concluir e enviar'}
            </button>
          </div>
        )}

        {/* ── Confirm modal ──────────────────────────────────── */}
        {confirmOpen && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}>
            <div style={{
              background: '#fff', borderRadius: 16, padding: '32px 28px',
              maxWidth: 400, width: '100%', ...base,
            }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
                Confirmar envio
              </h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 24 }}>
                Tem certeza? Após enviar não será possível editar as respostas.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <GhostBtn style={{ marginTop: 0, width: 'auto', flex: 1 }} onClick={() => setConfirmOpen(false)}>
                  Cancelar
                </GhostBtn>
                <button
                  onClick={handleComplete}
                  style={{
                    flex: 1, padding: '10px 16px',
                    background: LIME, color: NAVY,
                    border: 'none', borderRadius: 9,
                    fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Confirmar envio
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tour modal ─────────────────────────────────────── */}
        {showTour && (
          <TourModal onClose={() => {
            if (instance?.id) sessionStorage.setItem(`brief_tour_seen_${instance.id}`, '1')
            setShowTour(false)
          }} />
        )}

      </div>
    </>
  )
}

// ── Question field ─────────────────────────────────────────────────────────────
function QuestionField({ question, value, onChange, saveStatus, readOnly, attachments, attachmentUrls, onUpload, onDelete, isUploading }) {
  const { text, type, required, note, allow_attachment } = question
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function handleFile(file) {
    if (!file) return
    onUpload(file)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <label style={{
          fontSize: 14, fontWeight: 600, color: '#1e293b',
          lineHeight: 1.5, flex: 1, paddingRight: 12,
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <span>
            {text}
            {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
          </span>
          {note && note.trim() && (
            <span className="brief-help-wrap" style={{ marginTop: 2 }}>
              <IcoHelpCircle size={15} color={SKY} />
              <span className="brief-tooltip">{note}</span>
            </span>
          )}
        </label>
        <SaveIndicator status={saveStatus} />
      </div>

      {type === 'textarea' || type === undefined ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={readOnly}
          rows={4}
          style={{
            width: '100%', padding: '10px 14px', fontSize: 14,
            border: '1px solid #e2e8f0', borderRadius: 9,
            fontFamily: 'inherit', lineHeight: 1.6,
            transition: 'border-color .15s',
            background: readOnly ? '#f8fafc' : '#fff',
            color: readOnly ? '#64748b' : '#1e293b',
            cursor: readOnly ? 'default' : 'text',
          }}
          onFocus={e  => !readOnly && (e.target.style.borderColor = SKY)}
          onBlur={e   => (e.target.style.borderColor = '#e2e8f0')}
        />
      ) : (
        <input
          type={type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={readOnly}
          style={{
            width: '100%', padding: '10px 14px', fontSize: 14,
            border: '1px solid #e2e8f0', borderRadius: 9,
            fontFamily: 'inherit', transition: 'border-color .15s',
            background: readOnly ? '#f8fafc' : '#fff',
            color: readOnly ? '#64748b' : '#1e293b',
            cursor: readOnly ? 'default' : 'text',
          }}
          onFocus={e  => !readOnly && (e.target.style.borderColor = SKY)}
          onBlur={e   => (e.target.style.borderColor = '#e2e8f0')}
        />
      )}

      {/* Attachment area */}
      {allow_attachment && (
        <div style={{ marginTop: 12 }}>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {attachments.map((att, idx) => {
                const fileType = att.mime_type || att.file_type || ''
                const signedUrl = attachmentUrls[att.id]
                const isImage = fileType.startsWith('image/')
                const isPdf = fileType === 'application/pdf'

                return (
                  <div
                    key={att.id || idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px',
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 8, fontSize: 13,
                    }}
                  >
                    {isImage && signedUrl ? (
                      <img
                        src={signedUrl}
                        alt={att.file_name}
                        style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                      />
                    ) : (
                      <span style={{ flexShrink: 0, fontSize: 20 }}>
                        {isPdf ? '📄' : fileType.includes('word') ? '📝' : fileType.includes('sheet') || fileType.includes('csv') || fileType.includes('excel') ? '📊' : '📎'}
                      </span>
                    )}
                    {signedUrl ? (
                      <a
                        href={signedUrl}
                        target={isImage || isPdf ? '_blank' : undefined}
                        download={!isImage && !isPdf ? att.file_name : undefined}
                        style={{ flex: 1, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
                        title={att.file_name}
                      >
                        {att.file_name}
                      </a>
                    ) : (
                      <span style={{ flex: 1, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.file_name}
                      </span>
                    )}
                    <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>
                      {formatBytes(att.file_size)}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={() => onDelete(att.id)}
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: '#fee2e2', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, fontSize: 14, color: '#ef4444', lineHeight: 1,
                        }}
                      >✕</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!readOnly && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
          )}
          {!readOnly && (
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                handleFile(e.dataTransfer.files[0])
              }}
              style={{
                border: `2px dashed ${dragOver ? SKY : '#cbd5e1'}`,
                borderRadius: 9, padding: '14px 16px', textAlign: 'center',
                background: dragOver ? 'rgba(89,194,237,0.06)' : '#fafafa',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                transition: 'all .15s',
              }}
            >
              {isUploading ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Enviando…</div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  <span style={{ fontWeight: 600, color: NAVY }}>Clique para anexar</span>
                  {' '}ou arraste o arquivo · máx. 10MB
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
