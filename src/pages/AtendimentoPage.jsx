import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { analyzeWhatsApp } from '../lib/openrouterService'
import { getFreshdeskConfig } from '../lib/freshdeskConfig'
import toast from 'react-hot-toast'

// ── Tipos de ticket (valores obrigatórios configurados no Freshdesk) ─────────
const TICKET_TYPES = [
  'Tenho uma dúvida',
  'Preciso de um ajuste',
  'Encontrei um erro / Bug',
  'Tenho uma sugestão',
  'Questão financeira',
  'Preciso falar com o comercial',
  'Outro assunto',
]

// ── Prioridades ───────────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: 'low',    label: 'Baixa',   fd: 1 },
  { value: 'medium', label: 'Média',   fd: 2 },
  { value: 'high',   label: 'Alta',    fd: 3 },
  { value: 'urgent', label: 'Urgente', fd: 4 },
]

// ── Estilos base reutilizados ─────────────────────────────────────────────────
const S = {
  label:    { display: 'block', fontSize: 11, fontWeight: 600, color: '#888780', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  input:    { width: '100%', padding: '8px 12px', border: '1px solid #d4d3ce', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a18', backgroundColor: '#fff' },
  fieldBox: { marginBottom: 14 },
  card:     { backgroundColor: '#fff', border: '0.5px solid #e8e7e3', borderRadius: 12, padding: 28, marginTop: 16 },
  btnPrimary: (disabled) => ({
    padding: '10px 24px', borderRadius: 7, fontSize: 14, fontWeight: 600, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
    backgroundColor: disabled ? '#e8e7e3' : '#173557',
    color: disabled ? '#888780' : '#fff',
  }),
  btnSecondary: { padding: '10px 20px', borderRadius: 7, fontSize: 14, border: '1px solid #d4d3ce', backgroundColor: '#fff', color: '#888780', cursor: 'pointer' },
  btnSky: (disabled) => ({
    padding: '10px 24px', borderRadius: 7, fontSize: 14, fontWeight: 600, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: disabled ? '#e8e7e3' : '#59c2ed',
    color: disabled ? '#888780' : '#fff',
  }),
}

// ── Indicador de progresso ────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ['Cliente e Contato', 'Conteúdo', 'Revisão']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28, flexWrap: 'wrap', rowGap: 8 }}>
      {steps.map((label, i) => {
        const n      = i + 1
        const active = step === n
        const done   = step > n
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                backgroundColor: done ? '#1D9E75' : active ? '#173557' : '#e8e7e3',
                color: (done || active) ? '#fff' : '#888780',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#173557' : done ? '#1D9E75' : '#888780', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 32, height: 1, backgroundColor: done ? '#1D9E75' : '#e8e7e3', margin: '0 12px', flexShrink: 0 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── STEP 1: Cliente e Contato ─────────────────────────────────────────────────
function Step1({ data, onChange, onNext }) {
  const [clientSearch,    setClientSearch]    = useState(data.clientSearch || '')
  const [clientResults,   setClientResults]   = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contacts,        setContacts]        = useState([])
  const [uncatContact,    setUncatContact]    = useState(data.uncatContact || { name: '', email: '', phone: '' })
  const [emailOverride,   setEmailOverride]   = useState(data.emailOverride || '')
  const debounceRef = useRef(null)

  // Busca clientes ao digitar
  useEffect(() => {
    if (!clientSearch.trim() || data.client) { setClientResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data: rows } = await supabase
        .from('clients')
        .select('id, name, fantasy_name')
        .ilike('name', `%${clientSearch.trim()}%`)
        .eq('contract_active', true)
        .order('name')
        .limit(8)
      setClientResults(rows || [])
    }, 280)
    return () => clearTimeout(debounceRef.current)
  }, [clientSearch, data.client])

  // Carrega contatos do cliente selecionado
  useEffect(() => {
    if (!data.client) { setContacts([]); return }
    setLoadingContacts(true)
    supabase
      .from('contact_links')
      .select('contact_id, papel, contacts(id, name, email, contact_phones(number, type))')
      .eq('client_id', data.client.id)
      .then(({ data: links, error }) => {
        if (error) console.error('[AtendimentoPage] contacts query:', error)
        setContacts((links || []).map(l => ({ ...l.contacts, papel: l.papel })))
        setLoadingContacts(false)
      })
  }, [data.client])

  function selectClient(c) {
    setClientSearch(c.fantasy_name || c.name)
    setClientResults([])
    onChange({ client: c, contact: null, useUncatContact: false })
  }

  function clearClient() {
    setClientSearch('')
    setClientResults([])
    onChange({ client: null, contact: null, useUncatContact: false })
  }

  function handleUncatChange(field, value) {
    const next = { ...uncatContact, [field]: value }
    setUncatContact(next)
    onChange({ uncatContact: next })
  }

  const canProceed = data.client && (
    data.contact ||
    (data.useUncatContact && uncatContact.name.trim() && (uncatContact.email.trim() || uncatContact.phone.trim()))
  )

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a18', marginBottom: 20 }}>1. Cliente e Contato</h2>

      {/* Busca de empresa */}
      <div style={S.fieldBox}>
        <label style={S.label}>Empresa *</label>
        <div style={{ position: 'relative' }}>
          <input
            value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); if (!e.target.value) clearClient() }}
            placeholder="Digite para buscar..."
            style={S.input}
            disabled={!!data.client}
          />
          {clientResults.length > 0 && !data.client && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #d4d3ce', borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,0.10)', zIndex: 20, marginTop: 2, overflow: 'hidden' }}>
              {clientResults.map(c => (
                <div
                  key={c.id}
                  onClick={() => selectClient(c)}
                  style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#1a1a18' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f7f7f5'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                >
                  {c.fantasy_name || c.name}
                </div>
              ))}
            </div>
          )}
        </div>
        {data.client && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 500 }}>✓ {data.client.fantasy_name || data.client.name}</span>
            <button onClick={clearClient} style={{ fontSize: 11, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>trocar</button>
          </div>
        )}
      </div>

      {/* Contatos do cliente */}
      {data.client && (
        <div style={S.fieldBox}>
          <label style={S.label}>Contato *</label>
          {loadingContacts ? (
            <p style={{ fontSize: 13, color: '#888780' }}>Carregando contatos...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contacts.map(c => {
                const selected = data.contact?.id === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => onChange({ contact: c, useUncatContact: false })}
                    style={{
                      padding: '9px 12px', borderRadius: 7, cursor: 'pointer', transition: 'all 0.12s',
                      border: `1px solid ${selected ? '#173557' : '#d4d3ce'}`,
                      backgroundColor: selected ? '#173557' : '#fff',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.backgroundColor = '#f7f7f5' }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.backgroundColor = '#fff' }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: selected ? '#fff' : '#1a1a18', margin: 0 }}>{c.name}</p>
                      {c.email && <p style={{ fontSize: 11, color: selected ? '#d3da47' : '#888780', margin: 0 }}>{c.email}</p>}
                    </div>
                    {c.papel && <span style={{ fontSize: 11, color: selected ? 'rgba(255,255,255,0.6)' : '#888780' }}>{c.papel}</span>}
                  </div>
                )
              })}

              {/* Contato não cadastrado */}
              <div
                onClick={() => onChange({ useUncatContact: !data.useUncatContact, contact: null })}
                style={{
                  padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${data.useUncatContact ? '#173557' : '#d4d3ce'}`,
                  backgroundColor: data.useUncatContact ? '#f0f4f8' : '#fff',
                  fontSize: 13, color: data.useUncatContact ? '#173557' : '#888780', fontStyle: 'italic',
                }}
                onMouseEnter={e => { if (!data.useUncatContact) e.currentTarget.style.backgroundColor = '#f7f7f5' }}
                onMouseLeave={e => { if (!data.useUncatContact) e.currentTarget.style.backgroundColor = '#fff' }}
              >
                + Contato não cadastrado
              </div>

              {data.useUncatContact && (
                <div style={{ padding: 12, backgroundColor: '#f7f7f5', borderRadius: 7, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={uncatContact.name}
                    onChange={e => handleUncatChange('name', e.target.value)}
                    placeholder="Nome *"
                    style={S.input}
                  />
                  <input
                    value={uncatContact.email}
                    onChange={e => handleUncatChange('email', e.target.value)}
                    placeholder="E-mail (obrigatório se não informar telefone)"
                    style={S.input}
                  />
                  <input
                    value={uncatContact.phone}
                    onChange={e => handleUncatChange('phone', e.target.value)}
                    placeholder="Telefone (obrigatório se não informar e-mail)"
                    style={S.input}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Aviso: contato sem email — necessário para criar ticket no Freshdesk */}
      {data.contact && !data.contact.email && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 7, marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#92400e', margin: '0 0 8px', fontWeight: 500 }}>
            ⚠️ O contato selecionado não tem e-mail cadastrado. O Freshdesk requer e-mail para criar o ticket.
          </p>
          <input
            value={emailOverride}
            onChange={e => { setEmailOverride(e.target.value); onChange({ emailOverride: e.target.value }) }}
            placeholder="Informe o e-mail para o ticket (opcional)"
            type="email"
            style={{ ...S.input, backgroundColor: '#fff' }}
          />
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button onClick={onNext} disabled={!canProceed} style={S.btnPrimary(!canProceed)}>
          Próximo →
        </button>
      </div>
    </div>
  )
}

// ── STEP 2: Conteúdo do atendimento ──────────────────────────────────────────
function Step2({ data, onChange, onNext, onBack }) {
  const [analyzing, setAnalyzing] = useState(false)
  const fileInputRef = useRef(null)

  const canAnalyze = (data.text || '').trim().length > 0 || (data.images || []).length > 0

  async function handleAddImages(e) {
    const files = Array.from(e.target.files || [])
    const newImgs = await Promise.all(files.map(file => new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve({ name: file.name, base64: ev.target.result, preview: ev.target.result })
      reader.readAsDataURL(file)
    })))
    onChange({ images: [...(data.images || []), ...newImgs] })
    e.target.value = ''
  }

  function removeImage(i) {
    onChange({ images: (data.images || []).filter((_, idx) => idx !== i) })
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const result = await analyzeWhatsApp({ text: data.text, images: data.images || [] })
      onChange({ aiResult: result })
      onNext()
    } catch (e) {
      toast.error(e.message || 'Erro ao analisar com IA')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a18', marginBottom: 20 }}>2. Conteúdo do Atendimento</h2>

      {/* Textarea conversa */}
      <div style={S.fieldBox}>
        <label style={S.label}>Conversa do WhatsApp</label>
        <textarea
          value={data.text || ''}
          onChange={e => onChange({ text: e.target.value })}
          placeholder="Cole aqui o texto da conversa do WhatsApp..."
          rows={9}
          style={{ ...S.input, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* Upload de imagens */}
      <div style={S.fieldBox}>
        <label style={S.label}>Imagens / Prints de Tela</label>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleAddImages} style={{ display: 'none' }} />
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ border: '2px dashed #d4d3ce', borderRadius: 8, padding: '18px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa', transition: 'border-color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#59c2ed'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#d4d3ce'}
        >
          <p style={{ fontSize: 13, color: '#888780', margin: 0 }}>📎 Clique para adicionar imagens</p>
          <p style={{ fontSize: 11, color: '#b0afab', margin: '4px 0 0' }}>PNG, JPG, WebP — múltiplos arquivos aceitos</p>
        </div>
        {(data.images || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {(data.images || []).map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                <img src={img.preview} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #e8e7e3' }} />
                <button
                  onClick={() => removeImage(i)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#E24B4A', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: '#888780', marginBottom: 16 }}>
        Forneça o texto da conversa, imagens, ou ambos. Pelo menos um é obrigatório.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={S.btnSecondary}>← Voltar</button>
        <button onClick={handleAnalyze} disabled={!canAnalyze || analyzing} style={S.btnSky(!canAnalyze || analyzing)}>
          {analyzing ? '⏳ Analisando atendimento...' : '🤖 Analisar com IA'}
        </button>
      </div>
    </div>
  )
}

// ── STEP 3: Revisão e criação do ticket ──────────────────────────────────────
function Step3({ data, onBack, onSuccess }) {
  const [groups,       setGroups]       = useState([])
  const [agents,       setAgents]       = useState([])
  const [typeChoices,  setTypeChoices]  = useState([])
  const [creating,     setCreating]     = useState(false)
  const [createdTicket, setCreatedTicket] = useState(null)
  const [ticketError,  setTicketError]  = useState(null)

  const ai = data.aiResult || {}

  // Email do requester: contato cadastrado > override informado no Step 1 > contato não cadastrado
  const contactEmail = data.contact?.email
    || data.emailOverride
    || data.uncatContact?.email
    || ''

  const [form, setForm] = useState({
    subject:     ai.subject     || '',
    description: ai.description || '',
    first_reply: ai.first_reply || '',
    type:        TICKET_TYPES.find(t => t.toLowerCase().includes((ai.suggested_type || '').toLowerCase())) || TICKET_TYPES[0],
    priority:    ai.suggested_priority || 'medium',
    status:      2,
    group_id:    '',
    agent_id:    '',
    email:       contactEmail,
  })

  function set(field, value) { setForm(p => ({ ...p, [field]: value })) }

  useEffect(() => {
    Promise.all([
      getFreshdeskConfig('groups'),
      getFreshdeskConfig('agents'),
      getFreshdeskConfig('ticket_fields'),
    ]).then(([g, a, tf]) => {
      const grps   = Array.isArray(g)  ? g  : []
      const agts   = Array.isArray(a)  ? a  : []
      const fields = Array.isArray(tf) ? tf : []

      setGroups(grps)
      setAgents(agts)

      // type é fixo — não vem do freshdesk_config

      // Sugerir grupo pelo hint da IA
      if (ai.suggested_group_hint && grps.length) {
        const hint  = ai.suggested_group_hint.toLowerCase()
        const found = grps.find(grp => grp.name?.toLowerCase().includes(hint))
        if (found) setForm(p => ({ ...p, group_id: String(found.id) }))
      }
    }).catch(() => {})
  }, [])

  async function handleCreate() {
    if (!form.subject.trim()) { toast.error('Assunto é obrigatório'); return }
    setCreating(true)
    setTicketError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada. Faça login novamente.')
      const token  = session.access_token
      const fnUrl  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/freshdesk-proxy`
      const fdPrio = PRIORITIES.find(p => p.value === form.priority)?.fd || 2

      // Nome do contato para fallback sem email
      const contactName = data.contact?.name || data.uncatContact?.name || ''

      // Payload do ticket — campos opcionais só incluídos se tiverem valor válido
      const ticketPayload = {
        subject:     form.subject.trim(),
        description: form.description.trim() || form.subject.trim(),
        priority:    fdPrio,
        status:      Number(form.status),
        source:      7,       // 7 = Chat (mais próximo de WhatsApp na API Freshdesk v2)
        tags:        ['whatsapp'],
      }
      // Requester: email preferido; name só se não houver email
      const emailVal = form.email?.trim()
      if (emailVal)                       ticketPayload.email        = emailVal
      else if (contactName)               ticketPayload.name         = contactName
      // type é obrigatório — sempre incluído com o valor selecionado
      ticketPayload.type = form.type
      if (form.group_id)                  ticketPayload.group_id     = Number(form.group_id)
      if (form.agent_id)                  ticketPayload.responder_id = Number(form.agent_id)

      // ── LOG DIAGNÓSTICO ──────────────────────────────────────────────────
      console.log('[AtendimentoPage] POST /tickets payload:', JSON.stringify(ticketPayload, null, 2))

      // POST: criar ticket
      const createRes = await fetch(fnUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tickets', method: 'POST', body: ticketPayload }),
      })
      const created = await createRes.json()

      // ── LOG DIAGNÓSTICO ──────────────────────────────────────────────────
      console.log('[AtendimentoPage] Freshdesk response status:', createRes.status)
      console.log('[AtendimentoPage] Freshdesk response body:', JSON.stringify(created, null, 2))

      if (!createRes.ok) {
        const errMsg = created?.message || created?.description
          || (created?.errors ? JSON.stringify(created.errors) : null)
          || `Erro ${createRes.status}`
        throw new Error(errMsg)
      }

      // POST: adicionar reply com a primeira resposta
      if (form.first_reply.trim() && created.id) {
        const replyRes = await fetch(fnUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path:   `/tickets/${created.id}/reply`,
            method: 'POST',
            body:   { body: form.first_reply.trim() },
          }),
        })
        const replyData = await replyRes.json()
        console.log('[AtendimentoPage] reply response:', replyRes.status, JSON.stringify(replyData, null, 2))
      }

      setCreatedTicket(created)
    } catch (e) {
      setTicketError(e.message || 'Erro ao criar ticket')
    } finally {
      setCreating(false)
    }
  }

  // ── Tela de sucesso ─────────────────────────────────────────────────────
  if (createdTicket) {
    return (
      <div style={{ maxWidth: 480, textAlign: 'center', padding: '48px 0', margin: '0 auto' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1D9E75', marginBottom: 8 }}>Ticket criado!</h2>
        <p style={{ fontSize: 14, color: '#888780', marginBottom: 6 }}>
          Ticket <strong style={{ color: '#173557' }}>#{createdTicket.id}</strong> registrado no Freshdesk.
        </p>
        {createdTicket.subject && (
          <p style={{ fontSize: 13, color: '#888780', marginBottom: 28, fontStyle: 'italic' }}>"{createdTicket.subject}"</p>
        )}
        <button onClick={onSuccess} style={{ ...S.btnPrimary(false), fontSize: 14 }}>
          Registrar novo atendimento
        </button>
      </div>
    )
  }

  // ── Labels e inputs reutilizados ────────────────────────────────────────
  const Field = ({ label, children }) => (
    <div style={S.fieldBox}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )

  const summary = {
    client:  data.client?.fantasy_name || data.client?.name || '',
    contact: data.contact?.name || data.uncatContact?.name  || '',
    email:   data.contact?.email || data.uncatContact?.email || '',
  }

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a18', marginBottom: 4 }}>3. Revisão e Confirmação</h2>
      <p style={{ fontSize: 12, color: '#888780', marginBottom: 20 }}>Revise e edite os campos antes de criar o ticket no Freshdesk.</p>

      {ticketError && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, marginBottom: 20, fontSize: 13, color: '#b91c1c' }}>
          ❌ {ticketError}
        </div>
      )}

      {/* Layout em 2 colunas no desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: '0 28px' }}>

        {/* Coluna esquerda — campos textuais */}
        <div>
          <Field label="Assunto *">
            <input value={form.subject} onChange={e => set('subject', e.target.value)} style={S.input} />
          </Field>

          <Field label="Descrição do Problema">
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={5} style={{ ...S.input, resize: 'vertical' }} />
          </Field>

          <Field label="Resposta Registrada no Ticket">
            <textarea value={form.first_reply} onChange={e => set('first_reply', e.target.value)} rows={5} style={{ ...S.input, resize: 'vertical' }} />
          </Field>
        </div>

        {/* Coluna direita — metadados + resumo */}
        <div>
          <Field label="E-mail do Requester">
            <input
              value={form.email}
              onChange={e => set('email', e.target.value)}
              type="email"
              placeholder="email@empresa.com"
              style={{ ...S.input, borderColor: !form.email.trim() ? '#fbbf24' : '#d4d3ce' }}
            />
            {!form.email.trim() && (
              <p style={{ fontSize: 11, color: '#92400e', margin: '4px 0 0' }}>
                ⚠️ O e-mail é obrigatório para criar o ticket no Freshdesk.
              </p>
            )}
          </Field>

          <Field label="Tipo *">
            <select value={form.type} onChange={e => set('type', e.target.value)} style={S.input}>
              {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Prioridade">
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={S.input}>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>

          <Field label="Status">
            <select value={form.status} onChange={e => set('status', e.target.value)} style={S.input}>
              <option value={2}>Aberto</option>
              <option value={3}>Pendente</option>
              <option value={4}>Resolvido</option>
              <option value={5}>Fechado</option>
            </select>
          </Field>

          {groups.length > 0 && (
            <Field label="Grupo">
              <select value={form.group_id} onChange={e => set('group_id', e.target.value)} style={S.input}>
                <option value="">— selecione —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          )}

          {agents.length > 0 && (
            <Field label="Agente">
              <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)} style={S.input}>
                <option value="">— selecione —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.contact?.name || a.name || `Agente ${a.id}`}</option>)}
              </select>
            </Field>
          )}

          <Field label="Origem">
            <div style={{ padding: '8px 12px', backgroundColor: '#f7f7f5', borderRadius: 7, fontSize: 13, color: '#888780', border: '1px solid #e8e7e3' }}>
              📱 WhatsApp
            </div>
          </Field>

          {/* Resumo empresa + contato */}
          <div style={{ padding: '12px 14px', backgroundColor: '#f0f4f8', borderRadius: 8, fontSize: 12, borderLeft: '3px solid #173557', marginTop: 8 }}>
            <p style={{ fontWeight: 600, color: '#173557', margin: '0 0 4px' }}>🏢 {summary.client}</p>
            <p style={{ color: '#4a5568', margin: 0 }}>👤 {summary.contact}</p>
            {summary.email && <p style={{ color: '#888780', margin: '2px 0 0', fontSize: 11 }}>{summary.email}</p>}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 12, marginTop: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack} disabled={creating} style={S.btnSecondary}>← Voltar</button>
        <button
          onClick={handleCreate}
          disabled={creating || !form.subject.trim()}
          style={{
            flex: 1, minWidth: 200, padding: '13px 24px', borderRadius: 8, fontSize: 15, fontWeight: 700, border: 'none',
            cursor: creating || !form.subject.trim() ? 'not-allowed' : 'pointer',
            backgroundColor: creating || !form.subject.trim() ? '#e8e7e3' : '#173557',
            color: creating || !form.subject.trim() ? '#888780' : '#fff',
            transition: 'all 0.15s',
          }}
        >
          {creating ? '⏳ Criando ticket...' : '🎫 Criar Ticket no Freshdesk'}
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
const INITIAL_DATA = {
  client:          null,
  contact:         null,
  useUncatContact: false,
  uncatContact:    { name: '', email: '', phone: '' },
  clientSearch:    '',
  text:            '',
  images:          [],
  aiResult:        null,
}

export default function AtendimentoPage() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState(INITIAL_DATA)

  function update(patch) { setData(p => ({ ...p, ...patch })) }

  function reset() { setData(INITIAL_DATA); setStep(1) }

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a18', margin: 0 }}>📱 Atendimento WhatsApp</h1>
        <p style={{ fontSize: 13, color: '#888780', margin: '4px 0 0' }}>
          Crie tickets no Freshdesk a partir de conversas WhatsApp com análise automática por IA.
        </p>
      </div>

      <div style={S.card}>
        <StepIndicator step={step} />

        {step === 1 && <Step1 data={data} onChange={update} onNext={() => setStep(2)} />}
        {step === 2 && <Step2 data={data} onChange={update} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <Step3 data={data} onBack={() => setStep(2)} onSuccess={reset} />}
      </div>
    </div>
  )
}
