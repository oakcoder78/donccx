import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Icons } from '../../lib/icons'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

// ─── Merge tags ───────────────────────────────────────────────────────────────
function mergeTags(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

// ─── Attachment constants ──────────────────────────────────────────────────────
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 5

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ step }) {
  const steps = ['Destinatário', 'Mensagem', 'Preview e envio']
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => {
        const idx   = i + 1
        const done  = idx < step
        const active = idx === step
        return (
          <div key={label} className="flex items-center gap-0">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${done  ? 'bg-donc-navy text-white' : ''}
                ${active ? 'bg-donc-sky text-white' : ''}
                ${!done && !active ? 'bg-bg-tertiary text-text-tertiary' : ''}`}>
                {done ? '✓' : idx}
              </div>
              <span className={`text-xs mt-1 ${active ? 'text-donc-navy font-semibold' : 'text-text-tertiary'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-12 mx-1 mb-5 ${done ? 'bg-donc-navy' : 'bg-border-tertiary'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmailComposerModal({ isOpen, onClose, mode = 'individual', preselectedClientId, preselectedContactId }) {
  const { user } = useAuth()
  const [step, setStep]           = useState(1)
  const [profile, setProfile]     = useState(null)

  // step 1
  const [clientSearch,   setClientSearch]   = useState('')
  const [clientResults,  setClientResults]  = useState([])
  const [client,         setClient]         = useState(null)
  const [contactLinks,   setContactLinks]   = useState([])
  const [selectedIds,    setSelectedIds]    = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)

  // step 2
  const [templates,      setTemplates]      = useState([])
  const [templateId,     setTemplateId]     = useState('')
  const [subject,        setSubject]        = useState('')
  const [body,           setBody]           = useState('')
  const [fromMode,       setFromMode]       = useState('csm')

  // step 3 / send
  const [sending,        setSending]        = useState(false)
  const [result,         setResult]         = useState(null)

  // attachments
  const [attachments,    setAttachments]    = useState([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef(null)

  const debounceRef = useRef(null)

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isOpen) return
    supabase
      .from('profiles')
      .select('id, name, email, phone, cargo')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [user, isOpen])

  // ── Load templates ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    supabase
      .from('email_templates')
      .select('id, name, subject, html_body, variables')
      .eq('active', true)
      .then(({ data }) => setTemplates(data || []))
  }, [isOpen])

  // ── Preselect client ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !preselectedClientId) return
    supabase
      .from('clients')
      .select('id, name, fantasy_name')
      .eq('id', preselectedClientId)
      .single()
      .then(({ data }) => { if (data) setClient(data) })
  }, [isOpen, preselectedClientId])

  // ── Load contacts when client set ───────────────────────────────────────────
  useEffect(() => {
    if (!client) { setContactLinks([]); setSelectedIds([]); return }
    setLoadingContacts(true)
    supabase
      .from('contact_links')
      .select('contact_id, papel, contacts(id, name, email, contact_emails(email, is_primary))')
      .eq('client_id', client.id)
      .then(({ data }) => {
        setContactLinks(data || [])
        if (preselectedContactId) {
          setSelectedIds([preselectedContactId])
        }
        setLoadingContacts(false)
      })
  }, [client, preselectedContactId])

  // ── Client search debounce ──────────────────────────────────────────────────
  useEffect(() => {
    if (!clientSearch.trim() || client) { setClientResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, fantasy_name')
        .or(`name.ilike.%${clientSearch.trim()}%,fantasy_name.ilike.%${clientSearch.trim()}%`)
        .eq('contract_active', true)
        .order('name')
        .limit(8)
      setClientResults(data || [])
    }, 280)
    return () => clearTimeout(debounceRef.current)
  }, [clientSearch, client])

  // ── Reset on close ──────────────────────────────────────────────────────────
  async function reset() {
    const sendSucceeded = result && !result.error
    if (!sendSucceeded) {
      for (const att of attachments) {
        if (att.storagePath) {
          try {
            await supabase.storage.from('activity-attachments').remove([att.storagePath])
          } catch (_) { /* non-fatal */ }
        }
      }
    }
    setStep(1)
    setClient(null)
    setClientSearch('')
    setClientResults([])
    setContactLinks([])
    setSelectedIds([])
    setTemplateId('')
    setSubject('')
    setBody('')
    setFromMode('csm')
    setResult(null)
    setSending(false)
    setAttachments([])
  }

  async function handleClose() {
    await reset()
    onClose()
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getContactEmail(link) {
    const emails = link.contacts?.contact_emails || []
    const primary = emails.find(e => e.is_primary)
    return primary?.email || link.contacts?.email || ''
  }

  function toggleContact(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function canAdvanceStep1() {
    return selectedIds.length > 0 &&
      selectedIds.every(id => {
        const link = contactLinks.find(l => l.contact_id === id)
        return !!getContactEmail(link)
      })
  }

  // ── Attachment handlers ──────────────────────────────────────────────────────
  function handleFileSelect(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''

    for (const file of files) {
      if (attachments.length >= MAX_FILES) {
        toast.error(`Máximo de ${MAX_FILES} arquivos.`)
        break
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`Tipo não permitido: ${file.name}`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} excede 5 MB.`)
        continue
      }
      setAttachments(prev => [...prev, {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        storagePath: null,
      }])
    }
  }

  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // ── Selected template ────────────────────────────────────────────────────────
  const selectedTemplate = templates.find(t => t.id === templateId)

  // ── Merge vars for preview ───────────────────────────────────────────────────
  function buildVars() {
    return {
      assunto:        subject,
      corpo_mensagem: body.replace(/\n/g, '<br>'),
      csm_nome:       profile?.name    || '',
      csm_cargo:      profile?.cargo   || '',
      csm_telefone:   profile?.phone   || '',
      csm_email:      profile?.email   || '',
    }
  }

  // ── Send ─────────────────────────────────────────────────────────────────────
  async function handleSend() {
    setSending(true)
    try {
      // Upload attachments first
      let attachmentMeta = []
      if (attachments.length > 0) {
        setUploadingFiles(true)
        for (const att of attachments) {
          const safeName = sanitizeFileName(att.name)
          const storagePath = `${client.id}/email_temp/${Date.now()}_${safeName}`
          const { error } = await supabase.storage
            .from('activity-attachments')
            .upload(storagePath, att.file)
          if (error) throw new Error(`Falha ao enviar ${att.name}: ${error.message}`)
          att.storagePath = storagePath
          attachmentMeta.push({
            storage_path: storagePath,
            file_name:    att.name,
            file_size:    att.size,
            file_type:    att.type,
          })
        }
        setUploadingFiles(false)
      }

      const vars = buildVars()
      const recipients = selectedIds.map(id => {
        const link = contactLinks.find(l => l.contact_id === id)
        return {
          contact_id: id,
          client_id:  client.id,
          email:      getContactEmail(link),
          variables:  vars,
        }
      })

      const { data: { session } } = await supabase.auth.getSession()
      const sbUrl = import.meta.env.VITE_SUPABASE_URL

      const res = await fetch(`${sbUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          template_id: templateId,
          recipients,
          sent_by:    user.id,
          from_mode:  fromMode,
          attachments: attachmentMeta,
        }),
      })

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: String(err), sent: 0, failed: selectedIds.length, logs: [] })
    } finally {
      setSending(false)
      setUploadingFiles(false)
    }
  }

  if (!isOpen) return null

  // ── Render steps ─────────────────────────────────────────────────────────────
  const clientDisplayName = client ? (client.fantasy_name || client.name) : ''

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Enviar e-mail" maxWidth="max-w-2xl">
      <Stepper step={step} />

      {/* ── Step 1: Destinatário ───────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Client */}
          <div>
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
              Empresa
            </label>
            {client ? (
              <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary rounded-md">
                <span className="text-sm font-medium text-text-primary">{clientDisplayName}</span>
                {!preselectedClientId && (
                  <button onClick={() => { setClient(null); setContactLinks([]); setSelectedIds([]) }}
                    className="text-xs text-text-tertiary hover:text-text-primary">Alterar</button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar empresa..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
                />
                {clientResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-bg-primary border border-border-tertiary rounded-md shadow-lg">
                    {clientResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setClient(c); setClientSearch(''); setClientResults([]) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-bg-tertiary text-text-primary"
                      >
                        {c.fantasy_name || c.name}
                        {c.fantasy_name && <span className="text-text-tertiary ml-1 text-xs">{c.name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contacts */}
          {client && (
            <div>
              <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
                Destinatários
              </label>
              {loadingContacts ? (
                <p className="text-sm text-text-tertiary">Carregando contatos...</p>
              ) : contactLinks.length === 0 ? (
                <p className="text-sm text-text-tertiary">Nenhum contato vinculado.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {contactLinks.map(link => {
                    const c     = link.contacts || {}
                    const email = getContactEmail(link)
                    const sel   = selectedIds.includes(link.contact_id)
                    return (
                      <label key={link.contact_id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer border transition-colors
                          ${sel ? 'border-donc-sky bg-donc-sky/5' : 'border-border-tertiary hover:bg-bg-tertiary'}`}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleContact(link.contact_id)}
                          className="accent-donc-sky"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">{c.name}</div>
                          <div className="text-xs text-text-tertiary truncate">
                            {email || <span className="text-amber-500">Sem e-mail cadastrado</span>}
                          </div>
                        </div>
                        {link.papel && (
                          <span className="text-xs text-text-tertiary">{link.papel}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="primary" size="sm" disabled={!canAdvanceStep1()} onClick={() => setStep(2)}>
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Mensagem ───────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Template */}
          <div>
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
              Template
            </label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
            >
              <option value="">Selecionar template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Assunto do e-mail"
              className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
              Mensagem
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={7}
              placeholder="Escreva aqui o conteúdo do e-mail..."
              className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky resize-y"
            />
          </div>

          {/* Remetente — só para admin/manager */}
          {(profile?.role === 'admin' || profile?.role === 'manager') && (
            <div>
              <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
                Remetente
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fromMode"
                    value="csm"
                    checked={fromMode === 'csm'}
                    onChange={() => setFromMode('csm')}
                    className="accent-donc-sky"
                  />
                  <span className="text-sm text-text-primary">
                    Meu e-mail ({profile?.email})
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="fromMode"
                    value="noreply"
                    checked={fromMode === 'noreply'}
                    onChange={() => setFromMode('noreply')}
                    className="accent-donc-sky"
                  />
                  <span className="text-sm text-text-primary">noreply@donc.com.br</span>
                </label>
              </div>
            </div>
          )}

          {/* CSM info preview */}
          {profile && (
            <div className="bg-bg-tertiary rounded-md px-3 py-2 text-xs text-text-tertiary">
              Assinatura: <span className="text-text-primary font-medium">{profile.name}</span>
              {profile.cargo && ` · ${profile.cargo}`}
              {profile.phone && ` · ${profile.phone}`}
              {` · ${profile.email}`}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="secondary" size="sm" onClick={() => setStep(1)}>← Voltar</Button>
            <Button
              variant="primary" size="sm"
              disabled={!templateId || !subject.trim() || !body.trim()}
              onClick={() => setStep(3)}
            >
              Visualizar →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview + envio ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {result ? (
            /* Post-send result */
            <div className="text-center py-4">
              {result.error ? (
                <p className="text-sm text-red-600">Erro: {result.error}</p>
              ) : (
                <>
                  <p className="text-base font-semibold text-donc-navy mb-1">
                    {result.sent} e-mail{result.sent !== 1 ? 's' : ''} enviado{result.sent !== 1 ? 's' : ''}!
                  </p>
                  {result.failed > 0 && (
                    <div className="text-sm text-red-600 mt-2">
                      {result.failed} falha{result.failed !== 1 ? 's' : ''}:
                      {result.logs?.filter(l => l.status === 'failed').map((l, i) => (
                        <div key={i} className="text-xs mt-1">{l.email}: {l.error}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <Button variant="primary" size="sm" className="mt-4" onClick={handleClose}>Fechar</Button>
            </div>
          ) : (
            <>
              {/* Recipients list */}
              <div>
                <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Destinatários</p>
                <div className="flex flex-wrap gap-2">
                  {selectedIds.map(id => {
                    const link  = contactLinks.find(l => l.contact_id === id)
                    const name  = link?.contacts?.name || ''
                    const email = getContactEmail(link)
                    return (
                      <span key={id} className="px-2 py-0.5 bg-bg-tertiary rounded text-xs text-text-primary">
                        {name} &lt;{email}&gt;
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
                    Anexos {attachments.length > 0 && `(${attachments.length})`}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={attachments.length >= MAX_FILES || sending || uploadingFiles}
                    className="text-xs text-donc-sky hover:text-donc-sky/80 font-medium disabled:opacity-40"
                  >
                    <Icons.Paperclip className="w-3.5 h-3.5 inline mr-1" />
                    Anexar arquivos
                  </button>
                </div>
                {attachments.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {attachments.map(att => (
                      <div key={att.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary rounded-md text-sm"
                      >
                        <Icons.Paperclip className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        <span className="flex-1 truncate text-text-primary min-w-0">{att.name}</span>
                        <span className="text-xs text-text-tertiary whitespace-nowrap">{formatFileSize(att.size)}</span>
                        {!sending && !uploadingFiles && (
                          <button onClick={() => removeAttachment(att.id)}
                            className="text-text-tertiary hover:text-red-500 p-0.5"
                          >
                            <Icons.X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* HTML preview */}
              {selectedTemplate && (
                <div>
                  <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Preview</p>
                  <div className="border border-border-tertiary rounded-md overflow-hidden" style={{ height: 320 }}>
                    <iframe
                      title="preview"
                      sandbox=""
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      srcDoc={mergeTags(selectedTemplate.html_body, buildVars())}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="secondary" size="sm" onClick={() => setStep(2)}>← Voltar</Button>
                <Button
                  variant="primary" size="sm"
                  disabled={sending || uploadingFiles}
                  onClick={handleSend}
                >
                  {uploadingFiles ? 'Enviando arquivos...' : sending ? 'Enviando...' : `Enviar para ${selectedIds.length} contato${selectedIds.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
