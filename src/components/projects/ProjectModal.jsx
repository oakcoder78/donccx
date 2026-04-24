import { useState, useEffect } from 'react'
import { useProfiles } from '../../hooks/useProfiles'
import { useClients } from '../../hooks/useClients'
import { useCapabilityTypes, useCreateOnboardingFlow, useCreateInternalProject, useOnboardingConfig } from '../../hooks/useOnboardings'

// ── CSS injetado: pseudo-classes que não podem ser inline ──────────────────
const MODAL_CSS = `
  .pm-input { box-sizing: border-box; }
  .pm-input:focus {
    border-color: #59c2ed !important;
    box-shadow: 0 0 0 3px rgba(89,194,237,0.18) !important;
    outline: none !important;
  }
  .pm-close:hover  { background: #f4f5f7 !important; color: #173557 !important; }
  .pm-btn-sec:hover { background: #f4f5f7 !important; }
  .pm-sug:hover    { background: #f4f5f7 !important; }
  .pm-chip:hover:not(.pm-chip-on) { border-color: rgba(15,34,58,0.3) !important; }
`

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return (name || '')
    .replace(/[^A-Za-zÀ-ÿ\s]/g, '')
    .split(/\s+/).filter(Boolean)
    .slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
}

function addDays(dateStr, days) {
  const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Shared inline styles ───────────────────────────────────────────────────
const label$ = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: '#173557', marginBottom: '6px',
}
const input$ = {
  width: '100%', border: '1px solid #d4d3ce', borderRadius: '7px',
  padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit',
  color: '#173557', background: '#fff', outline: 'none',
}
const inputRO$ = { ...input$, background: '#f4f5f7', color: 'rgba(23,53,87,0.75)', cursor: 'default' }

const EMPTY_FORM = {
  title: '', description: '', responsible_id: '',
  start_date: '', end_date: '', status: 'em_andamento',
}

// ── Component ──────────────────────────────────────────────────────────────
export function ProjectModal({ isOpen, onClose, clientId }) {
  const isGlobal = !clientId

  // type: Interno is the prototype default (left-most segment)
  const [type,   setType]   = useState('interno')
  const [form,   setForm]   = useState(EMPTY_FORM)
  const [caps,   setCaps]   = useState([])          // array of capability_type_id numbers

  // Combobox (global mode)
  const [comboSearch, setComboSearch]     = useState('')
  const [comboOpen,   setComboOpen]       = useState(false)
  const [selClient,   setSelClient]       = useState(null)

  const { data: profiles  = [] } = useProfiles()
  const { data: clients   = [] } = useClients()
  const { data: capTypes  = [] } = useCapabilityTypes()
  const { data: onbCfg    = {} } = useOnboardingConfig()
  const createOnboardingFlow     = useCreateOnboardingFlow()
  const createInternalProject    = useCreateInternalProject()

  const isPending = createOnboardingFlow.isPending || createInternalProject.isPending

  // Client for contextual pill
  const ctxClient = !isGlobal ? clients.find(c => c.id === clientId) : null

  // Derived state
  const isOnbType = type === 'onboarding' || type === 'expansao'
  const kickoffSla = onbCfg.kickoff_sla_days ?? 5
  const kickoffDisplay = addDays(form.start_date, kickoffSla)

  // Grouped capability types
  const grpOp  = capTypes.filter(c => c.category === 'operacao')
  const grpMod = capTypes.filter(c => c.category === 'modulo')

  // Filtered suggestions for combobox
  const suggestions = comboSearch.trim()
    ? clients.filter(c => {
        const q = comboSearch.toLowerCase()
        return (c.name || '').toLowerCase().includes(q)
            || (c.fantasy_name || '').toLowerCase().includes(q)
      }).slice(0, 10)
    : clients.slice(0, 8)

  // Validation (mirrors prototype JS)
  const resolvedClientId = clientId || selClient?.id || null
  const titleOk   = form.title.trim().length > 0
  const empresaOk = !isGlobal || !!selClient
  const capsOk    = !isOnbType || caps.length > 0
  const canSubmit = titleOk && empresaOk && capsOk

  // Reset all state
  function reset() {
    setType('interno'); setForm(EMPTY_FORM); setCaps([])
    setComboSearch(''); setComboOpen(false); setSelClient(null)
  }
  function handleClose() { reset(); onClose() }

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    const fn = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [isOpen])

  // Combobox
  function handleComboSelect(c) {
    setSelClient(c)
    setComboSearch(c.fantasy_name || c.name)
    setComboOpen(false)
  }

  // Chip toggle
  function toggleCap(id) {
    setCaps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Submit
  async function handleSubmit() {
    if (!canSubmit || isPending) return
    if (type === 'interno') {
      await createInternalProject.mutateAsync({
        clientId:       resolvedClientId,
        title:          form.title.trim(),
        description:    form.description || undefined,
        responsible_id: form.responsible_id || undefined,
        start_date:     form.start_date || undefined,
        end_date:       form.end_date   || undefined,
        status:         form.status,
      })
    } else {
      await createOnboardingFlow.mutateAsync({
        clientId:     resolvedClientId,
        type,
        title:        form.title.trim(),
        csm_id:       form.responsible_id || undefined,
        start_date:   form.start_date || undefined,
        notes:        form.description || undefined,
        capabilities: caps,
      })
    }
    handleClose()
  }

  if (!isOpen) return null

  return (
    <>
      <style>{MODAL_CSS}</style>

      {/* Overlay */}
      <div
        onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'grid', placeItems: 'center',
          zIndex: 100, backdropFilter: 'blur(2px)',
          padding: '20px',
        }}
      >
        {/* Modal */}
        <div style={{
          width: '100%',
          maxWidth: isOnbType ? '880px' : '520px',
          background: '#fff', borderRadius: '16px', padding: '24px',
          boxShadow: '0 24px 60px rgba(10,22,40,0.28)',
          maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
          transition: 'max-width 0.35s ease',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#173557',
        }}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>Novo projeto</h2>
              <div style={{ fontSize: '12px', color: 'rgba(23,53,87,0.6)', marginTop: '3px' }}>
                Preencha os dados para criar um projeto no workspace.
              </div>
            </div>
            <button
              className="pm-close"
              onClick={handleClose}
              aria-label="Fechar"
              style={{
                border: 'none', background: 'transparent',
                width: '28px', height: '28px', borderRadius: '7px',
                cursor: 'pointer', color: 'rgba(23,53,87,0.55)',
                fontSize: '20px', lineHeight: 1,
                display: 'grid', placeItems: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              ×
            </button>
          </div>

          {/* ── Body grid ────────────────────────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isOnbType ? '1fr 1fr' : '1fr',
            gap: '0 28px',
            position: 'relative',
          }}>
            {/* Column divider (wide mode) */}
            {isOnbType && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: '50%',
                width: '1px', background: 'rgba(15,34,58,0.07)',
                pointerEvents: 'none',
              }} />
            )}

            {/* ── Left column: Dados gerais ─────────────────────────────── */}
            <div>
              {isOnbType && (
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(23,53,87,0.5)', fontWeight: 600, margin: '2px 0 12px' }}>
                  Dados gerais
                </div>
              )}

              {/* Empresa */}
              {isGlobal ? (
                /* Combobox */
                <div style={{ marginBottom: '14px' }}>
                  <label style={label$}>
                    Empresa <span style={{ color: '#c44', marginLeft: '2px' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="pm-input"
                      type="text"
                      value={comboSearch}
                      onChange={e => {
                        setComboSearch(e.target.value)
                        if (selClient && e.target.value !== (selClient.fantasy_name || selClient.name))
                          setSelClient(null)
                        setComboOpen(true)
                      }}
                      onFocus={() => setComboOpen(true)}
                      onBlur={() => setTimeout(() => setComboOpen(false), 150)}
                      placeholder="Buscar empresa..."
                      autoComplete="off"
                      style={input$}
                    />
                    {comboOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                        background: '#fff', border: '1px solid rgba(15,34,58,0.12)',
                        borderRadius: '9px', boxShadow: '0 8px 24px rgba(10,22,40,0.12)',
                        maxHeight: '220px', overflowY: 'auto', zIndex: 20, padding: '4px',
                      }}>
                        {suggestions.length === 0 ? (
                          <div style={{ padding: '14px 10px', textAlign: 'center', fontSize: '12px', color: 'rgba(23,53,87,0.5)' }}>
                            Nenhuma empresa encontrada.
                          </div>
                        ) : suggestions.map(c => {
                          const name = c.fantasy_name || c.name
                          return (
                            <div
                              key={c.id}
                              className="pm-sug"
                              onMouseDown={e => { e.preventDefault(); handleComboSelect(c) }}
                              style={{
                                padding: '8px 10px', fontSize: '13px', color: '#173557',
                                borderRadius: '6px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '10px',
                                transition: 'background 0.1s',
                              }}
                            >
                              <div style={{
                                width: '22px', height: '22px', borderRadius: '5px',
                                background: 'rgba(89,194,237,0.18)', color: '#0a4a6b',
                                display: 'grid', placeItems: 'center',
                                fontSize: '11px', fontWeight: 600, flexShrink: 0,
                              }}>
                                {initials(name)}
                              </div>
                              <span style={{ fontWeight: 500 }}>{name}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Context pill */
                <div style={{ marginBottom: '14px' }}>
                  <label style={label$}>Empresa</label>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(23,53,87,0.05)', border: '1px solid rgba(15,34,58,0.09)',
                    borderRadius: '999px', padding: '4px 12px 4px 4px',
                    fontSize: '12px', color: '#173557', marginTop: '2px',
                  }}>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: '#173557', color: '#fff',
                      display: 'grid', placeItems: 'center',
                      fontSize: '10px', fontWeight: 600,
                    }}>
                      {initials(ctxClient?.fantasy_name || ctxClient?.name)}
                    </div>
                    <span>{ctxClient?.fantasy_name || ctxClient?.name || '—'}</span>
                    <span style={{ color: 'rgba(23,53,87,0.5)', fontSize: '11px' }}>· contexto atual</span>
                  </div>
                </div>
              )}

              {/* Tipo — segmented */}
              <div style={{ marginBottom: '14px' }}>
                <label style={label$}>
                  Tipo <span style={{ color: '#c44', marginLeft: '2px' }}>*</span>
                </label>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
                  background: '#f4f5f7', borderRadius: '9px', padding: '3px', gap: '3px',
                }}>
                  {[
                    { key: 'interno',    label: 'Interno'    },
                    { key: 'onboarding', label: 'Onboarding' },
                    { key: 'expansao',   label: 'Expansão'   },
                  ].map(t => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => { setType(t.key); setCaps([]) }}
                      style={{
                        border: 'none',
                        background: type === t.key ? '#fff' : 'transparent',
                        padding: '8px 10px', borderRadius: '7px',
                        fontSize: '13px', fontFamily: 'inherit', fontWeight: 500,
                        color: type === t.key ? '#173557' : 'rgba(23,53,87,0.7)',
                        cursor: 'pointer',
                        transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                        boxShadow: type === t.key
                          ? '0 1px 2px rgba(10,22,40,0.08), 0 0 0 1px rgba(15,34,58,0.06)'
                          : 'none',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título */}
              <div style={{ marginBottom: '14px' }}>
                <label style={label$}>
                  Título <span style={{ color: '#c44', marginLeft: '2px' }}>*</span>
                </label>
                <input
                  className="pm-input"
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: Onboarding Rede Atacadão"
                  style={input$}
                />
              </div>

              {/* Descrição */}
              <div style={{ marginBottom: '14px' }}>
                <label style={label$}>
                  Descrição{' '}
                  <span style={{ color: 'rgba(23,53,87,0.45)', fontWeight: 400 }}>(opcional)</span>
                </label>
                <textarea
                  className="pm-input"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Contexto, objetivos ou observações sobre o projeto."
                  style={{ ...input$, resize: 'vertical', minHeight: '64px' }}
                />
              </div>

              {/* Responsável */}
              <div style={{ marginBottom: '14px' }}>
                <label style={label$}>Responsável</label>
                <select
                  className="pm-input"
                  value={form.responsible_id}
                  onChange={e => setForm(p => ({ ...p, responsible_id: e.target.value }))}
                  style={input$}
                >
                  <option value="">— Selecionar —</option>
                  {profiles.map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name}</option>
                  ))}
                </select>
              </div>

              {/* Datas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={label$}>Data início</label>
                  <input
                    className="pm-input"
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    style={input$}
                  />
                </div>
                <div>
                  <label style={label$}>Data fim</label>
                  <input
                    className="pm-input"
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                    style={input$}
                  />
                </div>
              </div>

              {/* Status */}
              <div style={{ marginBottom: '14px' }}>
                <label style={label$}>Status</label>
                <select
                  className="pm-input"
                  value={form.status}
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  style={input$}
                >
                  <option value="planejado">Planejado</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="suspenso">Suspenso</option>
                </select>
              </div>
            </div>

            {/* ── Right column: Escopo (only for onboarding / expansao) ────── */}
            {isOnbType && (
              <div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(23,53,87,0.5)', fontWeight: 600, margin: '2px 0 12px' }}>
                  Escopo do onboarding
                </div>

                {/* Capacidades */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={label$}>
                    Capacidades <span style={{ color: '#c44', marginLeft: '2px' }}>*</span>
                  </label>
                  <div style={{
                    background: '#fafbfc', border: '1px solid rgba(15,34,58,0.07)',
                    borderRadius: '10px', padding: '14px',
                  }}>
                    {/* Operação */}
                    {grpOp.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(23,53,87,0.55)', marginBottom: '6px', fontWeight: 600 }}>
                          Operação
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {grpOp.map(ct => {
                            const on = caps.includes(ct.id)
                            return (
                              <button
                                key={ct.id}
                                type="button"
                                className={on ? 'pm-chip pm-chip-on' : 'pm-chip'}
                                onClick={() => toggleCap(ct.id)}
                                style={{
                                  border: on ? '1px solid #173557' : '1px solid rgba(15,34,58,0.14)',
                                  background: on ? '#173557' : '#fff',
                                  color: on ? '#fff' : '#173557',
                                  padding: '6px 11px', borderRadius: '999px',
                                  fontSize: '12px', cursor: 'pointer',
                                  fontFamily: 'inherit', fontWeight: 500,
                                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                }}
                              >
                                {ct.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Módulo */}
                    {grpMod.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(23,53,87,0.55)', marginBottom: '6px', fontWeight: 600 }}>
                          Módulo
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {grpMod.map(ct => {
                            const on = caps.includes(ct.id)
                            return (
                              <button
                                key={ct.id}
                                type="button"
                                className={on ? 'pm-chip pm-chip-on' : 'pm-chip'}
                                onClick={() => toggleCap(ct.id)}
                                style={{
                                  border: on ? '1px solid #173557' : '1px solid rgba(15,34,58,0.14)',
                                  background: on ? '#173557' : '#fff',
                                  color: on ? '#fff' : '#173557',
                                  padding: '6px 11px', borderRadius: '999px',
                                  fontSize: '12px', cursor: 'pointer',
                                  fontFamily: 'inherit', fontWeight: 500,
                                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                }}
                              >
                                {ct.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chips hint */}
                  <div style={{ fontSize: '11px', marginTop: '4px', color: caps.length === 0 ? '#b04545' : 'rgba(23,53,87,0.55)' }}>
                    {caps.length === 0
                      ? 'Selecione ao menos uma capacidade.'
                      : `${caps.length} capacidade${caps.length > 1 ? 's' : ''} selecionada${caps.length > 1 ? 's' : ''}.`
                    }
                  </div>
                </div>

                {/* Kickoff + Fase inicial */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={label$}>Kickoff previsto</label>
                    <input type="date" value={kickoffDisplay} readOnly style={inputRO$} />
                    <div style={{ fontSize: '11px', color: 'rgba(23,53,87,0.5)', marginTop: '4px' }}>
                      Prazo padrão: {kickoffSla} dias corridos.
                    </div>
                  </div>
                  <div>
                    <label style={label$}>Fase inicial</label>
                    <input type="text" value="Definição do Escopo" readOnly style={inputRO$} />
                  </div>
                </div>

                {/* Info banner */}
                <div style={{
                  background: 'rgba(89,194,237,0.12)', border: '1px solid rgba(89,194,237,0.3)',
                  borderRadius: '9px', padding: '10px 12px',
                  fontSize: '12px', color: '#0a4a6b',
                  display: 'flex', gap: '9px', alignItems: 'flex-start',
                  lineHeight: 1.45,
                }}>
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#59c2ed', color: '#fff',
                    display: 'grid', placeItems: 'center',
                    fontSize: '10px', fontWeight: 700, flexShrink: 0, marginTop: '1px',
                  }}>
                    i
                  </div>
                  <div>Um onboarding será criado e vinculado a este projeto automaticamente.</div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: '8px',
            borderTop: '1px solid rgba(15,34,58,0.07)',
            marginTop: '6px', paddingTop: '14px',
          }}>
            <button
              className="pm-btn-sec"
              onClick={handleClose}
              style={{
                background: '#fff', color: '#173557',
                border: '1px solid rgba(15,34,58,0.14)',
                borderRadius: '8px', padding: '9px 16px',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              style={{
                background: !canSubmit || isPending ? 'rgba(23,53,87,0.25)' : '#173557',
                color: '#fff', border: 'none',
                borderRadius: '8px', padding: '9px 16px',
                fontSize: '13px', fontWeight: 500,
                cursor: !canSubmit || isPending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              {isPending ? 'Criando...' : 'Salvar projeto'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
