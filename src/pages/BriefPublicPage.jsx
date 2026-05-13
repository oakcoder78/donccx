import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'

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

function GhostBtn({ children, ...props }) {
  return (
    <button
      style={{
        width: '100%', padding: '10px 16px',
        background: 'transparent', color: '#64748b',
        border: '1px solid #e2e8f0', borderRadius: 9,
        fontWeight: 600, fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit', marginTop: 8,
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
    <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        border: '2px solid #94a3b8', borderTopColor: 'transparent',
        display: 'inline-block', animation: 'spin 0.7s linear infinite',
      }} />
      Salvando...
    </span>
  )
  if (status === 'saved') return (
    <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 3 }}>
      <IcoCheck size={11} color="#22c55e" /> Salvo
    </span>
  )
  if (status === 'error') return (
    <span style={{ fontSize: 11, color: '#ef4444' }}>Erro ao salvar</span>
  )
  return null
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function BriefPublicPage() {
  const { token } = useParams()

  const sessionKey = `brief_session_${token}`

  // Restore session from storage
  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem(sessionKey)) } catch { return null }
  })()

  const [phase,    setPhase]    = useState(stored ? 'loading' : 'auth')
  const [emailVal, setEmailVal] = useState(stored?.email || '')
  const [session,  setSession]  = useState(stored)   // { email, contact_name, client_name, instance }
  const [instance, setInstance] = useState(null)
  const [responses, setResponses] = useState({})     // { questionId: text }
  const [readOnly,  setReadOnly]  = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [saveStatus, setSaveStatus] = useState({})   // { qId: 'saving'|'saved'|'error' }
  const [errorMsg,   setErrorMsg]   = useState('')
  const [completing, setCompleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const debounceRef = useRef({})

  // ── Load brief after auth ───────────────────────────────────────────────────
  const loadBrief = useCallback(async (email) => {
    setPhase('loading')
    try {
      const data = await callBrief({ action: 'get', token, email })
      const inst = data.instance
      setInstance(inst)

      // Map saved responses
      const resMap = {}
      for (const r of (data.responses || [])) {
        resMap[r.question_id] = r.response_text || ''
      }
      setResponses(resMap)

      setReadOnly(inst.status === 'completed')
      setPhase(inst.status === 'completed' ? 'form' : 'form')
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao carregar brief')
      setPhase('error')
    }
  }, [token])

  // ── Auto-load if session in storage ────────────────────────────────────────
  useEffect(() => {
    if (stored) {
      loadBrief(stored.email)
    }
  }, []) // eslint-disable-line

  // ── Handle email validation ─────────────────────────────────────────────────
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
      await loadBrief(email)
    } catch (err) {
      const msg =
        err.status === 404 ? 'Brief não encontrado ou link inválido.' :
        err.status === 403 ? (err.message?.includes('expirado') ? 'Este link expirou.' : 'E-mail não encontrado para este brief.') :
        err.message || 'Erro ao verificar acesso.'
      setErrorMsg(msg)
      setPhase('auth')
    }
  }

  // ── Auto-save with debounce ─────────────────────────────────────────────────
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

  // ── Complete brief ──────────────────────────────────────────────────────────
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

  // ── Tela de agradecimento ───────────────────────────────────────────────────
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

  // ── Layout de auth / loading / erro ────────────────────────────────────────
  if (phase !== 'form') {
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, ...base }}>

          {/* Auth form */}
          {(phase === 'auth') && (
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

          {/* Loading / Validating */}
          {(phase === 'validating' || phase === 'loading') && (
            <Card>
              <Logo subtitle="Brief de Discovery" />
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: '20px 0' }}>
                <Spinner />
                {phase === 'validating' ? 'Verificando acesso…' : 'Carregando brief…'}
              </div>
            </Card>
          )}

          {/* Error */}
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

  // ── Formulário dinâmico ─────────────────────────────────────────────────────
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
          {/* Logo */}
          <div style={{
            width: 32, height: 32, borderRadius: 7,
            background: NAVY,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
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

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 120, height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: progress === 100 ? LIME : SKY,
                width: `${progress}%`,
                transition: 'width 0.3s ease',
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

        {/* ── Body (sidebar + main) ───────────────────────────── */}
        <div style={{ display: 'flex', paddingTop: 57, minHeight: '100vh' }}>

          {/* Mobile header for section nav */}
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
              {activeSection?.title || 'Seções'}
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
              borderRight: '1px solid #e2e8f0',
              background: '#fff',
              position: 'fixed', top: 57, bottom: 0,
              overflowY: 'auto',
              zIndex: 30,
            }}
          >
            <div style={{ padding: '16px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, paddingLeft: 8 }}>
                Seções
              </div>
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
                      color: active ? NAVY : '#475569',
                      lineHeight: 1.3,
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

            {activeSection && (
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
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 10px' }}>
                    {activeSection.title}
                  </h1>
                  {activeSection.deliverable && (
                    <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                      {activeSection.deliverable}
                    </p>
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

        {/* ── Footer fixo — Concluir ──────────────────────────── */}
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
                fontFamily: 'inherit',
                transition: 'all .15s',
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

      </div>
    </>
  )
}

// ── Question field component ──────────────────────────────────────────────────
function QuestionField({ question, value, onChange, saveStatus, readOnly }) {
  const { text, type, required, note } = question

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', lineHeight: 1.5, flex: 1, paddingRight: 12 }}>
          {text}
          {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
        </label>
        <SaveIndicator status={saveStatus} />
      </div>

      {note && (
        <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 8, marginTop: 0, lineHeight: 1.5 }}>
          {note}
        </p>
      )}

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
    </div>
  )
}
