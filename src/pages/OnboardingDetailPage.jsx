import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ── mock data ──────────────────────────────────────────────────────────────

const PROJECT = {
  title:   'Onboarding Lojas Simonetti - Fase 1',
  company: 'Lojas Simonetti',
  type:    'Onboarding',
  status:  'Em Andamento',
  situacao: 'fluindo',
}

const FASES_INIT = [
  { key: 'definicao_escopo',      label: 'Definição do Escopo',      start: '2026-04-15', end: '2026-05-10' },
  { key: 'preparacao_plataforma', label: 'Preparação da Plataforma', start: '2026-05-11', end: '2026-05-30' },
  { key: 'treinamento',           label: 'Treinamento',              start: '2026-06-01', end: '2026-06-26' },
]

const MILESTONES_INIT = [
  { key: 'kickoff',           label: 'Kickoff',                   planned: '2026-05-05', icon: '🚀', done: false, done_date: null },
  { key: 'projeto_tecnico',   label: 'Projeto Técnico Aprovado',  planned: '2026-05-20', icon: '📋', done: false, done_date: null },
  { key: 'go_live',           label: 'Go-Live',                   planned: '2026-06-26', icon: '🟢', done: false, done_date: null },
]

const CAPABILITIES = [
  { label: 'Entrega',     color: '#0c447c', bg: 'rgba(89,194,237,0.16)'   },
  { label: 'Montagem',   color: '#3b2fa0', bg: 'rgba(83,74,183,0.13)'   },
  { label: 'Assistência', color: '#0f6b4f', bg: 'rgba(29,158,117,0.13)' },
]

const PEND_INIT = [
  { id: 1, title: 'Envio da base de usuários',             prioridade: 'alta',        status: 'em_andamento',       responsavel: 'João Silva',    tipo: 'cliente', data_limite: null        },
  { id: 2, title: 'Definição de regras de roteirização',   prioridade: 'normal',      status: 'criada',             responsavel: 'Maria Ops',     tipo: 'cliente', data_limite: '2026-05-15' },
  { id: 3, title: 'Validação do projeto técnico',          prioridade: 'bloqueadora', status: 'aguardando_validacao', responsavel: 'Thomás Pessoa', tipo: 'interno', data_limite: '2026-05-08' },
]

const PEND_STATUS_OPTIONS = [
  { key: 'criada',               label: 'Criada'                },
  { key: 'em_andamento',         label: 'Em Andamento'          },
  { key: 'aguardando_validacao', label: 'Aguardando Validação'  },
  { key: 'encerrada',            label: 'Encerrada'             },
]

// ── sub-components ─────────────────────────────────────────────────────────

function SituacaoDot({ situacao }) {
  const colors = { fluindo: '#1D9E75', atencao: '#BA7517', travado: '#E24B4A' }
  const labels = { fluindo: 'Fluindo',  atencao: 'Atenção',  travado: 'Travado'  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: colors[situacao], background: colors[situacao] + '18', borderRadius: 6, padding: '2px 8px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors[situacao], flexShrink: 0 }} />
      {labels[situacao]}
    </span>
  )
}

function PrioridadeBadge({ p }) {
  const map = {
    bloqueadora: { label: 'Bloqueadora', variant: 'red'   },
    alta:        { label: 'Alta',        variant: 'amber' },
    normal:      { label: 'Normal',      variant: 'slate' },
  }
  const m = map[p] ?? map.normal
  return <Badge variant={m.variant}>{m.label}</Badge>
}

function StatusBadge({ s }) {
  const map = {
    criada:               { label: 'Criada',               variant: 'slate' },
    em_andamento:         { label: 'Em Andamento',         variant: 'sky'   },
    aguardando_validacao: { label: 'Aguardando Validação', variant: 'amber' },
    encerrada:            { label: 'Encerrada',            variant: 'green' },
  }
  const m = map[s] ?? map.criada
  return <Badge variant={m.variant}>{m.label}</Badge>
}

// ── main page ──────────────────────────────────────────────────────────────

export default function OnboardingDetailPage() {
  const navigate = useNavigate()

  // phase state
  const [activePhase, setActivePhase] = useState(0)

  // milestone state
  const [milestones, setMilestones]  = useState(MILESTONES_INIT)
  const [openPanel,  setOpenPanel]   = useState(null)   // milestone key
  const [msForm,     setMsForm]      = useState({})     // { [key]: { date, notes } }

  // pendências state
  const [pendencias,  setPendencias]  = useState(PEND_INIT)
  const [showNewPend, setShowNewPend] = useState(false)
  const [newPend,     setNewPend]     = useState({ title: '', prioridade: 'normal', responsavel: '' })

  // ── handlers ──────────────────────────────────────────────────────────────

  function advancePhase() {
    setActivePhase(p => Math.min(p + 1, FASES_INIT.length - 1))
  }

  function togglePanel(key) {
    setOpenPanel(prev => prev === key ? null : key)
    setMsForm(prev => ({ ...prev, [key]: prev[key] ?? { date: '', notes: '' } }))
  }

  function confirmMilestone(key) {
    const form = msForm[key] ?? {}
    if (!form.date) return
    setMilestones(prev => prev.map(m =>
      m.key === key ? { ...m, done: true, done_date: form.date } : m
    ))
    setOpenPanel(null)
  }

  function updatePendStatus(id, status) {
    setPendencias(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  function addPendencia() {
    if (!newPend.title.trim()) return
    setPendencias(prev => [...prev, {
      id:          Date.now(),
      title:       newPend.title.trim(),
      prioridade:  newPend.prioridade,
      status:      'criada',
      responsavel: newPend.responsavel.trim() || '—',
      tipo:        'interno',
      data_limite: null,
    }])
    setNewPend({ title: '', prioridade: 'normal', responsavel: '' })
    setShowNewPend(false)
  }

  // ── styles ────────────────────────────────────────────────────────────────

  const card$ = {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid rgba(15,34,58,0.09)',
    padding: '20px 22px',
  }

  const input$ = {
    width: '100%',
    border: '1px solid #d4d3ce',
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    color: '#173557',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const label$ = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#888780',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 5,
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#f4f5f7', minHeight: '100vh', paddingBottom: 60 }}>

      {/* Breadcrumb */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(15,34,58,0.07)', padding: '10px 32px' }}>
        <span style={{ fontSize: 12, color: '#888780' }}>
          <span
            onClick={() => navigate('/projetos')}
            style={{ cursor: 'pointer', color: '#59c2ed' }}
          >Projetos</span>
          {' / '}
          <span style={{ color: '#173557', fontWeight: 500 }}>Onboarding Lojas Simonetti - Fase 1</span>
        </span>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 0' }}>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
          <div>
            <button
              onClick={() => navigate('/projetos')}
              style={{ fontSize: 13, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              ← Voltar
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#173557', margin: 0, lineHeight: 1.3 }}>
              {PROJECT.title}
            </h1>
            <p style={{ fontSize: 14, color: '#59c2ed', fontWeight: 500, marginTop: 4, marginBottom: 10 }}>
              {PROJECT.company}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant="sky">{PROJECT.type}</Badge>
              <Badge variant="sky">{PROJECT.status}</Badge>
              <SituacaoDot situacao={PROJECT.situacao} />
            </div>
          </div>
          <div style={{ flexShrink: 0, paddingTop: 28 }}>
            <Button variant="secondary" size="sm">Editar projeto</Button>
          </div>
        </div>

        {/* ── LINHA DO TEMPO DAS FASES ─────────────────────────────────── */}
        <div style={{ ...card$, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#173557', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Fases
          </h2>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            {FASES_INIT.map((fase, idx) => {
              const isActive  = idx === activePhase
              const isDone    = idx < activePhase
              const isPending = idx > activePhase
              const isLast    = idx === FASES_INIT.length - 1

              return (
                <div key={fase.key} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {/* Fase card */}
                  <div style={{
                    flex: 1,
                    border: isActive
                      ? '2px solid #59c2ed'
                      : isDone
                        ? '1px solid #1D9E75'
                        : '1px solid rgba(15,34,58,0.09)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    background: isActive ? 'rgba(89,194,237,0.06)' : isDone ? 'rgba(29,158,117,0.05)' : '#fafaf9',
                    opacity: isPending ? 0.65 : 1,
                    transition: 'all 0.25s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isActive ? '#173557' : isDone ? '#0f6b4f' : '#888780',
                        lineHeight: 1.35,
                      }}>
                        {fase.label}
                      </span>
                      {isActive && <Badge variant="sky">Ativa</Badge>}
                      {isDone   && <Badge variant="green">Concluída</Badge>}
                      {isPending && <Badge variant="slate">Pendente</Badge>}
                    </div>
                    <p style={{ fontSize: 11, color: '#888780', margin: '6px 0 0' }}>
                      {fmt(fase.start)} → {fmt(fase.end)}
                    </p>
                    {isActive && idx < FASES_INIT.length - 1 && (
                      <button
                        onClick={advancePhase}
                        style={{
                          marginTop: 10,
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#59c2ed',
                          background: 'rgba(89,194,237,0.10)',
                          border: '1px solid rgba(89,194,237,0.3)',
                          borderRadius: 6,
                          padding: '3px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        Avançar fase →
                      </button>
                    )}
                  </div>
                  {/* Arrow between phases */}
                  {!isLast && (
                    <div style={{ padding: '0 6px', color: '#d4d3ce', fontSize: 18, flexShrink: 0 }}>›</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── MILESTONES ───────────────────────────────────────────────── */}
        <div style={{ ...card$, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#173557', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Milestones
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {milestones.map(ms => (
              <div key={ms.key}>
                <div style={{
                  border: ms.done ? '1px solid rgba(29,158,117,0.3)' : '1px solid rgba(15,34,58,0.09)',
                  borderRadius: 12,
                  padding: '16px',
                  background: ms.done ? 'rgba(29,158,117,0.04)' : '#fafaf9',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 22 }}>{ms.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#173557', margin: 0, lineHeight: 1.3 }}>
                        {ms.label}
                      </p>
                      <p style={{ fontSize: 11, color: '#888780', margin: '2px 0 0' }}>
                        Previsto: {fmt(ms.planned)}
                      </p>
                    </div>
                  </div>
                  {ms.done ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>✅</span>
                      <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500 }}>
                        Realizado em {fmt(ms.done_date)}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant="slate">Pendente</Badge>
                      <button
                        onClick={() => togglePanel(ms.key)}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: openPanel === ms.key ? '#173557' : '#59c2ed',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        {openPanel === ms.key ? 'Cancelar' : 'Registrar conclusão'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline panel */}
                {openPanel === ms.key && !ms.done && (
                  <div style={{
                    border: '1px solid rgba(89,194,237,0.35)',
                    borderTop: 'none',
                    borderRadius: '0 0 12px 12px',
                    padding: '14px 16px',
                    background: 'rgba(89,194,237,0.04)',
                  }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={label$}>Data de realização *</label>
                      <input
                        type="date"
                        style={input$}
                        value={msForm[ms.key]?.date ?? ''}
                        onChange={e => setMsForm(prev => ({
                          ...prev,
                          [ms.key]: { ...(prev[ms.key] ?? {}), date: e.target.value }
                        }))}
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={label$}>Justificativa / Evidência</label>
                      <textarea
                        style={{ ...input$, resize: 'vertical', minHeight: 60 }}
                        placeholder="Link de evidência ou observação..."
                        value={msForm[ms.key]?.notes ?? ''}
                        onChange={e => setMsForm(prev => ({
                          ...prev,
                          [ms.key]: { ...(prev[ms.key] ?? {}), notes: e.target.value }
                        }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => confirmMilestone(ms.key)}
                      disabled={!msForm[ms.key]?.date}
                    >
                      Confirmar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── CAPACIDADES CONTRATADAS ───────────────────────────────────── */}
        <div style={{ ...card$, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#173557', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Capacidades Contratadas
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CAPABILITIES.map(cap => (
              <span
                key={cap.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  color: cap.color,
                  background: cap.bg,
                  border: `1px solid ${cap.color}28`,
                }}
              >
                {cap.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── PENDÊNCIAS ────────────────────────────────────────────────── */}
        <div style={{ ...card$ }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#173557', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pendências
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setShowNewPend(v => !v)}>
              {showNewPend ? '✕ Cancelar' : '+ Nova Pendência'}
            </Button>
          </div>

          {/* New pendência form */}
          {showNewPend && (
            <div style={{
              border: '1px solid rgba(89,194,237,0.3)',
              borderRadius: 10,
              padding: '14px 16px',
              background: 'rgba(89,194,237,0.04)',
              marginBottom: 14,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 1fr', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={label$}>Título *</label>
                  <input
                    style={input$}
                    placeholder="Descreva a pendência..."
                    value={newPend.title}
                    onChange={e => setNewPend(p => ({ ...p, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={label$}>Prioridade</label>
                  <select
                    style={input$}
                    value={newPend.prioridade}
                    onChange={e => setNewPend(p => ({ ...p, prioridade: e.target.value }))}
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="bloqueadora">Bloqueadora</option>
                  </select>
                </div>
                <div>
                  <label style={label$}>Responsável</label>
                  <input
                    style={input$}
                    placeholder="Nome do responsável"
                    value={newPend.responsavel}
                    onChange={e => setNewPend(p => ({ ...p, responsavel: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Button size="sm" onClick={addPendencia} disabled={!newPend.title.trim()}>
                  Adicionar pendência
                </Button>
              </div>
            </div>
          )}

          {/* Pendências list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendencias.map(p => (
              <div
                key={p.id}
                style={{
                  border: p.prioridade === 'bloqueadora'
                    ? '1px solid rgba(226,75,74,0.35)'
                    : '1px solid rgba(15,34,58,0.09)',
                  borderLeft: p.prioridade === 'bloqueadora'
                    ? '3px solid #E24B4A'
                    : '1px solid rgba(15,34,58,0.09)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  background: p.prioridade === 'bloqueadora' ? 'rgba(226,75,74,0.025)' : '#fafaf9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                {/* Title + responsavel */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18', margin: 0 }}>
                    {p.title}
                  </p>
                  <p style={{ fontSize: 11, color: '#888780', margin: '3px 0 0' }}>
                    {p.responsavel}
                    {' · '}
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      color: p.tipo === 'interno' ? '#534AB7' : '#185FA5',
                      background: p.tipo === 'interno' ? 'rgba(83,74,183,0.10)' : 'rgba(24,95,165,0.10)',
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}>
                      {p.tipo === 'interno' ? 'Interno' : 'Cliente'}
                    </span>
                    {p.data_limite && (
                      <span style={{ marginLeft: 6 }}>· limite {fmt(p.data_limite)}</span>
                    )}
                  </p>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <PrioridadeBadge p={p.prioridade} />
                  <StatusBadge s={p.status} />
                </div>

                {/* Status selector */}
                <select
                  value={p.status}
                  onChange={e => updatePendStatus(p.id, e.target.value)}
                  style={{
                    fontSize: 11,
                    border: '1px solid #d4d3ce',
                    borderRadius: 6,
                    padding: '4px 8px',
                    background: '#fff',
                    color: '#173557',
                    cursor: 'pointer',
                    flexShrink: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  {PEND_STATUS_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}

            {pendencias.length === 0 && (
              <p style={{ fontSize: 13, color: '#888780', textAlign: 'center', padding: '24px 0' }}>
                Nenhuma pendência cadastrada.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
