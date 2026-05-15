import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Icons } from '../../lib/icons'
import { Drawer } from '../ui/Drawer'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

function mergeTags(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

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

export function EmailComposerModal({ isOpen, onClose, mode = 'individual', preselectedClientId, preselectedContactId }) {
  const { user } = useAuth()
  const [profile, setProfile]           = useState(null)

  const [clientSearch,   setClientSearch]   = useState('')
  const [clientResults,  setClientResults]  = useState([])
  const [client,         setClient]         = useState(null)
  const [contactLinks,   setContactLinks]   = useState([])
  const [selectedIds,    setSelectedIds]    = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactSearch,  setContactSearch]  = useState('')

  const [templates,      setTemplates]      = useState([])
  const [templateId,     setTemplateId]     = useState('')
  const [subject,        setSubject]        = useState('')
  const [body,           setBody]           = useState('')
  const [fromMode,       setFromMode]       = useState('csm')

  const [sending,        setSending]        = useState(false)
  const [result,         setResult]         = useState(null)

  const [attachments,    setAttachments]    = useState([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef(null)

  const [showPreview, setShowPreview] = useState(false)

  const debounceRef = useRef(null)
  const contactSearchRef = useRef(null)

  useEffect(() => {
    if (!user || !isOpen) return
    supabase
      .from('profiles')
      .select('id, name, email, phone, cargo')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [user, isOpen])

  useEffect(() => {
    if (profile && !profile.email?.endsWith('@donc.com.br')) {
      setFromMode('noreply')
    }
  }, [profile])

  useEffect(() => {
    if (!isOpen) return
    supabase
      .from('email_templates')
      .select('id, name, subject, html_body, variables')
      .eq('active', true)
      .then(({ data }) => setTemplates(data || []))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !preselectedContactId) return
    supabase
      .from('contacts')
      .select('id, name, email, contact_emails(email, is_primary)')
      .eq('id', preselectedContactId)
      .single()
      .then(({ data }) => {
        if (data && !selectedIds.includes(data.id)) {
          setSelectedIds([data.id])
        }
      })
  }, [isOpen, preselectedContactId])

  useEffect(() => {
    if (!isOpen || !preselectedClientId) return
    supabase
      .from('clients')
      .select('id, name, fantasy_name')
      .eq('id', preselectedClientId)
      .single()
      .then(({ data }) => { if (data) setClient(data) })
  }, [isOpen, preselectedClientId])

  useEffect(() => {
    if (!client) { setContactLinks([]); return }
    setLoadingContacts(true)
    supabase
      .from('contact_links')
      .select('contact_id, papel, contacts(id, name, email, contact_emails(email, is_primary))')
      .eq('client_id', client.id)
      .then(({ data }) => {
        setContactLinks(data || [])
        setLoadingContacts(false)
      })
  }, [client])

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

  async function reset() {
    const sendSucceeded = result && !result.error
    if (!sendSucceeded) {
      for (const att of attachments) {
        if (att.storagePath) {
          try {
            await supabase.storage.from('activity-attachments').remove([att.storagePath])
          } catch (_) { }
        }
      }
    }
    setClient(null)
    setClientSearch('')
    setClientResults([])
    setContactLinks([])
    setSelectedIds([])
    setContactSearch('')
    setTemplateId('')
    setSubject('')
    setBody('')
    setFromMode('csm')
    setResult(null)
    setSending(false)
    setAttachments([])
    setShowPreview(false)
  }

  async function handleClose() {
    await reset()
    onClose()
  }

  function getContactEmail(link) {
    if (!link) return ''
    const emails = link.contacts?.contact_emails || []
    const primary = emails.find(e => e.is_primary)
    return primary?.email || link.contacts?.email || ''
  }

  function toggleContact(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function selectContact(id) {
    if (!selectedIds.includes(id)) {
      setSelectedIds(prev => [...prev, id])
    }
    setContactSearch('')
    contactSearchRef.current?.focus()
  }

  const filteredContacts = contactSearch.trim()
    ? contactLinks.filter(link => {
        const c = link.contacts || {}
        const name = (c.name || '').toLowerCase()
        const email = getContactEmail(link).toLowerCase()
        const q = contactSearch.toLowerCase()
        return name.includes(q) || email.includes(q)
      })
    : contactLinks.filter(link => !selectedIds.includes(link.contact_id))

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

  const selectedTemplate = templates.find(t => t.id === templateId)

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

  async function handleSend() {
    setSending(true)
    try {
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

  const canSend = selectedIds.length > 0 && templateId && subject.trim() && body.trim() && client
  const allRecipientsHaveEmail = selectedIds.every(id => {
    const link = contactLinks.find(l => l.contact_id === id)
    return !!getContactEmail(link)
  })

  if (!isOpen) return null

  const clientDisplayName = client ? (client.fantasy_name || client.name) : ''

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Compor e-mail" maxWidth="max-w-2xl">

      {result ? (
        <div className="space-y-4">
          {result.error ? (
            <div className="text-center py-8">
              <Icons.XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-sm text-red-600 mb-4">{result.error}</p>
              <div className="flex justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleClose}>Fechar</Button>
                <Button variant="primary" size="sm" onClick={() => setResult(null)}>Tentar novamente</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Icons.Check className="w-5 h-5 text-green-600" />
              </div>
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
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="secondary" size="sm" onClick={handleClose}>Fechar</Button>
                <Button variant="primary" size="sm" onClick={() => { reset(); setShowPreview(false) }}>Enviar outro</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Empresa */}
          <div>
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
              Empresa
            </label>
            {client ? (
              <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary rounded-md">
                <span className="text-sm font-medium text-text-primary">{clientDisplayName}</span>
                <button onClick={() => { setClient(null); setContactLinks([]); setSelectedIds([]); setContactSearch('') }}
                  className="p-1 text-text-tertiary hover:text-donc-sky rounded transition-colors" title="Trocar empresa">
                  <Icons.RefreshCw size={14} />
                </button>
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
                  <div className="absolute z-10 w-full mt-1 bg-bg-primary border border-border-tertiary rounded-md shadow-lg max-h-48 overflow-y-auto">
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

          {/* Para */}
          {client && (
            <div>
              <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
                Para
              </label>
              {loadingContacts ? (
                <p className="text-sm text-text-tertiary">Carregando contatos...</p>
              ) : (
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border border-border-tertiary rounded-md bg-bg-primary min-h-[38px] focus-within:border-donc-sky">
                    {selectedIds.map(id => {
                      const link = contactLinks.find(l => l.contact_id === id)
                      const c = link?.contacts || {}
                      const email = getContactEmail(link)
                      return (
                        <span key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-donc-sky/10 text-donc-navy text-xs rounded-full border border-donc-sky/20"
                        >
                          <span className="truncate max-w-[140px]">{c.name || email}</span>
                          <button onClick={() => toggleContact(id)}
                            className="hover:text-red-500 shrink-0"
                          >
                            <Icons.X className="w-3 h-3" />
                          </button>
                        </span>
                      )
                    })}
                    <input
                      ref={contactSearchRef}
                      type="text"
                      value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                      placeholder={selectedIds.length === 0 ? 'Digite para buscar contatos...' : 'Adicionar mais...'}
                      className="flex-1 min-w-[120px] text-sm bg-transparent text-text-primary outline-none border-none p-0.5"
                    />
                  </div>
                  {contactSearch.trim() && filteredContacts.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-bg-primary border border-border-tertiary rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredContacts.map(link => {
                        const c = link.contacts || {}
                        const email = getContactEmail(link)
                        return (
                          <button
                            key={link.contact_id}
                            onClick={() => selectContact(link.contact_id)}
                            disabled={!email}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between"
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">{c.name || 'Sem nome'}</div>
                              <div className="text-xs text-text-tertiary truncate">
                                {email || <span className="text-amber-500">Sem e-mail</span>}
                              </div>
                            </div>
                            {link.papel && <span className="text-xs text-text-tertiary ml-2 shrink-0">{link.papel}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {contactLinks.length === 0 && (
                    <p className="text-xs text-text-tertiary mt-1">Nenhum contato vinculado a esta empresa.</p>
                  )}
                </div>
              )}
            </div>
          )}

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

          {/* Assunto */}
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

          {/* Mensagem */}
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

          {/* Anexos */}
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
                disabled={attachments.length >= MAX_FILES}
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
                    <button onClick={() => removeAttachment(att.id)}
                      className="text-text-tertiary hover:text-red-500 p-0.5"
                    >
                      <Icons.X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Domain warning */}
          {profile && !profile.email?.endsWith('@donc.com.br') && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
              <Icons.HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Seu e-mail de perfil (<strong>{profile.email}</strong>) não é @donc.com.br.
                Para enviar e-mails como remetente individual, atualize seu e-mail em{' '}
                <strong>Configurações &gt; Perfil</strong>.
              </span>
            </div>
          )}

          {/* Remetente */}
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
                    disabled={!profile?.email?.endsWith('@donc.com.br')}
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

          {/* Assinatura */}
          {profile && (
            <div className="bg-bg-tertiary rounded-md px-3 py-2 text-xs text-text-tertiary">
              Assinatura: <span className="text-text-primary font-medium">{profile.name}</span>
              {profile.cargo && ` · ${profile.cargo}`}
              {profile.phone && ` · ${profile.phone}`}
              {` · ${profile.email}`}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border-tertiary">
            <Button variant="secondary" size="sm" onClick={handleClose}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {selectedTemplate && (subject.trim() || body.trim()) && (
                <Button variant="secondary" size="sm" onClick={() => setShowPreview(true)}>
                  <Icons.Eye className="w-3.5 h-3.5 mr-1" />
                  Preview
                </Button>
              )}
              <Button
                variant="primary" size="sm"
                disabled={!canSend || !allRecipientsHaveEmail || sending || uploadingFiles}
                onClick={handleSend}
              >
                {uploadingFiles ? 'Enviando arquivos...' : sending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>

        </div>
      )}

      {/* Preview drawer */}
      {selectedTemplate && (subject.trim() || body.trim()) && (
        <Drawer isOpen={showPreview} onClose={() => setShowPreview(false)} title="Preview">
          <div className="space-y-4">
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
            <div>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Assunto</p>
              <p className="text-sm text-text-primary">{subject}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Mensagem</p>
              <div className="border border-border-tertiary rounded-md overflow-hidden" style={{ height: 400 }}>
                <iframe
                  title="preview"
                  sandbox=""
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  srcDoc={mergeTags(selectedTemplate.html_body, buildVars())}
                />
              </div>
            </div>
          </div>
        </Drawer>
      )}

    </Modal>
  )
}
