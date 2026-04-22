import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const NAVY = '#173557'
const LIME = '#d3da47'
const SKY  = '#59c2ed'

const base = {
  fontFamily: "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
}

function Card({ children }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: '40px 36px',
      maxWidth: 400,
      width: '100%',
      boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
    }}>
      {/* Logo doncCX */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 11,
          background: NAVY,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 10,
        }}>
          <span style={{ color: LIME, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>d</span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          doncCX · Relatório do Cliente
        </div>
      </div>
      {children}
    </div>
  )
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      style={{
        width: '100%', padding: '11px 16px',
        background: NAVY, color: '#fff',
        border: 'none', borderRadius: 9,
        fontWeight: 700, fontSize: 14, cursor: 'pointer',
        fontFamily: 'inherit', letterSpacing: 0.2,
        transition: 'opacity .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      {...props}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, ...props }) {
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

// ────────────────────────────────────────────────────────────
export default function ReportPublicPage() {
  const { token } = useParams()

  const [email,       setEmail]       = useState('')
  const [state,       setState]       = useState('form')   // form | loading | authorized | denied | not_found
  const [reportData,  setReportData]  = useState(null)
  const [csmInfo,     setCsmInfo]     = useState(null)
  const [contactRole, setContactRole] = useState(null)
  const [viewRegistered, setViewRegistered] = useState(false)

  async function handleVerify(e) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return

    setState('loading')

    try {
      const { data, error } = await supabase.rpc('check_report_access', {
        p_token: token,
        p_email: trimmed,
      })

      if (error) throw error

      if (!data) {
        setState('not_found')
        return
      }

      if (data.authorized) {
        setReportData(data.report)
        setContactRole(data.contact_role)
        setState('authorized')
      } else {
        setCsmInfo({ name: data.csm_name, email: data.csm_email })
        setState('denied')
      }
    } catch (err) {
      console.error('[ReportPublicPage] verify error:', err)
      setState('form')
      alert('Erro ao verificar acesso. Tente novamente.')
    }
  }

  // Registra view assim que o relatório é exibido (uma vez)
  async function registerView() {
    if (viewRegistered || !reportData?.id) return
    setViewRegistered(true)
    try {
      // Skip if internal Hub user has active session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) return

      await supabase.rpc('register_report_view', {
        p_report_id:    reportData.id,
        p_email:        email.trim(),
        p_contact_role: contactRole,
      })
    } catch (err) {
      console.error('[ReportPublicPage] register_view error:', err)
    }
  }

  // ── Estado: relatório autorizado ────────────────────────
  if (state === 'authorized' && reportData) {
    if (!viewRegistered) registerView()

    return (
      <>
        {/* Barra superior */}
        <div
          className="no-print report-topbar"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
            background: 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #e2e8f0',
            padding: '10px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
            ...base,
          }}
        >
          <div style={{ fontSize: 13, color: '#475569' }}>
            <span style={{ fontWeight: 700, color: NAVY }}>{reportData.client_name}</span>
            {reportData.period ? ` · ${reportData.period}` : ''}
          </div>
          <button
            onClick={() => window.print()}
            className="report-topbar-btn"
            style={{
              padding: '7px 16px',
              background: NAVY, color: '#fff',
              border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            🖨️ Salvar como PDF
          </button>
        </div>

        {/* Botão PDF sticky — mobile only */}
        <button
          className="no-print report-pdf-sticky"
          onClick={() => window.print()}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99,
            background: NAVY, color: '#fff',
            border: 'none',
            fontWeight: 700, fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit',
            padding: '16px 24px',
            letterSpacing: 0.2,
            display: 'none',
          }}
        >
          🖨️ Salvar como PDF
        </button>

        {/* Conteúdo do relatório */}
        <div className="report-content" style={{ paddingTop: 52 }}>
          <div dangerouslySetInnerHTML={{ __html: reportData.html_content }} />
        </div>

        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 0; }
          }

          html, body { overflow-x: hidden; }

          .wrap { box-sizing: border-box; }
          .wrap * { box-sizing: border-box; }
          svg { max-width: 100%; }

          @media (max-width: 639px) {
            /* Top bar: hide PDF button (sticky shown instead) */
            .report-topbar { padding: 10px 14px !important; }
            .report-topbar-btn { display: none !important; }

            /* Sticky PDF button */
            .report-pdf-sticky { display: block !important; }

            /* Content: less top padding (smaller bar), bottom clearance for sticky */
            .report-content { padding-top: 44px !important; }

            /* Wrap responsive */
            .wrap { padding: 10px 10px 80px !important; }

            /* KPI / metric grids → single column */
            .wrap [style*="grid-template-columns"] {
              grid-template-columns: 1fr !important;
            }

            /* Large numeric values — readable, no overflow */
            .wrap [style*="font-size:2.2rem"] {
              font-size: 1.6rem !important;
              word-break: break-all;
            }

            /* Slide padding reduction */
            .slide > div {
              padding-left: 14px !important;
              padding-right: 14px !important;
            }

            /* Side-by-side flex sections (health score etc.) → stack */
            .slide [style*="gap:32px"],
            .slide [style*="gap: 32px"] {
              flex-direction: column !important;
              gap: 14px !important;
            }

            /* Cover: stack client info row */
            .cover-slide [style*="gap:20px"],
            .cover-slide [style*="gap: 20px"] {
              flex-direction: column !important;
              gap: 10px !important;
            }

            /* Cover: CSM card align */
            .cover-slide [style*="align-items:flex-end"],
            .cover-slide [style*="align-items: flex-end"] {
              align-items: stretch !important;
            }

            /* Cover title font reduction */
            .cover-slide [style*="font-size:3rem"],
            .cover-slide [style*="font-size: 3rem"],
            .cover-slide [style*="font-size:2.4rem"],
            .cover-slide [style*="font-size: 2.4rem"] {
              font-size: 1.5rem !important;
            }

            /* No overflow in any slide */
            .slide, .wrap > * { overflow-x: hidden; max-width: 100%; }
          }
        `}</style>
      </>
    )
  }

  // ── Layout base (form / loading / denied / not_found) ───
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div style={{
        minHeight: '100vh',
        background: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        ...base,
      }}>

        {/* ── Formulário de verificação ── */}
        {state === 'form' && (
          <Card>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>
              Verificar acesso
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
              Informe seu e-mail para acessar este relatório.
            </p>
            <form onSubmit={handleVerify}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14,
                  border: '1px solid #e2e8f0', borderRadius: 9,
                  marginBottom: 12, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e  => (e.target.style.borderColor = SKY)}
                onBlur={e   => (e.target.style.borderColor = '#e2e8f0')}
              />
              <PrimaryButton type="submit">Acessar Relatório →</PrimaryButton>
            </form>
          </Card>
        )}

        {/* ── Carregando ── */}
        {state === 'loading' && (
          <Card>
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: '20px 0' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                border: `3px solid ${SKY}`, borderTopColor: 'transparent',
                animation: 'spin 0.7s linear infinite',
                margin: '0 auto 16px',
              }} />
              Verificando acesso…
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </Card>
        )}

        {/* ── Acesso negado ── */}
        {state === 'denied' && (
          <Card>
            <div style={{ textAlign: 'center', fontSize: 40, marginBottom: 12 }}>🔒</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>
              Acesso não autorizado
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              O e-mail{' '}
              <strong style={{ color: '#334155' }}>{email}</strong>{' '}
              não tem permissão para acessar este relatório.
              Solicite acesso ao seu CSM.
            </p>
            {csmInfo?.name && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '14px 18px',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                  CSM Responsável
                </div>
                <div style={{ fontWeight: 700, color: NAVY, marginBottom: 3 }}>{csmInfo.name}</div>
                {csmInfo.email && (
                  <a
                    href={`mailto:${csmInfo.email}`}
                    style={{ fontSize: 13, color: SKY, textDecoration: 'none' }}
                  >
                    {csmInfo.email}
                  </a>
                )}
              </div>
            )}
            <GhostButton onClick={() => setState('form')}>
              Tentar com outro e-mail
            </GhostButton>
          </Card>
        )}

        {/* ── Relatório não encontrado ── */}
        {state === 'not_found' && (
          <Card>
            <div style={{ textAlign: 'center', fontSize: 40, marginBottom: 12 }}>📄</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>
              Relatório não encontrado
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
              Este link pode ter expirado ou o relatório ainda não foi publicado.
            </p>
          </Card>
        )}
      </div>
    </>
  )
}
