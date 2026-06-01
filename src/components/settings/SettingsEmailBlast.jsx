import { useState, useEffect, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { Icons } from '@/lib/icons'
import { useEmailBlastRecipients } from '@/hooks/useEmailBlastRecipients'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import EmailEditor from '../email/EmailEditor'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

function mergeTags(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

function getContactEmail(contact) {
  if (!contact) return ''
  const emails = contact.contact_emails || []
  const primary = emails.find(e => e.is_primary)
  return primary?.email || contact.email || ''
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/html',
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

function getReasonTags(contact) {
  const tags = []
  if (contact.champion) tags.push({ label: 'champion', icon: Icons.Star, className: 'text-amber-500' })
  if (contact.papel === 'Técnico') tags.push({ label: 'técnico', icon: Icons.Settings, className: 'text-blue-500' })
  if (contact.hasActivity) tags.push({ label: 'atividade', icon: Icons.Activity, className: 'text-green-500' })
  return tags
}

const DEFAULT_EMAIL_PROMPT =
  `Você é um assistente de redação profissional da DONC, plataforma de gestão de equipes externas.
Reescreva e-mails corporativos em português mantendo o tom profissional e todo o conteúdo original.
Melhore a clareza, coesão e persuasão da mensagem.
Preserve qualquer formatação HTML existente.
Não adicione informações que não estavam no texto original.
Responda APENAS com o texto reescrito, sem introduções, explicações ou meta-comentários.`

export function SettingsEmailBlast() {
  const { user } = useAuth()
  const { clientRows, loading, error } = useEmailBlastRecipients()
  const [search, setSearch] = useState('')
  const [selectedByClient, setSelectedByClient] = useState(() => new Map())
  const [expandedClient, setExpandedClient] = useState(null)
  const [addDropdown, setAddDropdown] = useState(null)

  const [profile, setProfile] = useState(null)
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fromMode, setFromMode] = useState('csm')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const fileInputRef = useRef(null)

  const prevRowsRef = useRef(null)

  useEffect(() => {
    if (!clientRows.length) return
    if (prevRowsRef.current === clientRows) return
    prevRowsRef.current = clientRows

    setSelectedByClient(() => {
      const map = new Map()
      for (const client of clientRows) {
        const preselected = new Set(
          client.contacts
            .filter(c => c.champion || c.papel === 'Técnico' || c.hasActivity)
            .map(c => c.contactId)
        )
        if (preselected.size > 0) {
          map.set(client.clientId, preselected)
        }
      }
      return map
    })
  }, [clientRows])

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('id, name, email, phone, cargo, role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [user])

  useEffect(() => {
    if (profile && !profile.email?.endsWith('@donc.com.br')) {
      setFromMode('noreply')
    }
  }, [profile])

  useEffect(() => {
    supabase
      .from('email_templates')
      .select('id, name, subject, html_body, variables')
      .eq('active', true)
      .then(({ data }) => setTemplates(data || []))
  }, [])

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clientRows
    const q = search.toLowerCase()
    return clientRows.filter(c => c.clientName.toLowerCase().includes(q))
  }, [clientRows, search])

  const summary = useMemo(() => {
    let totalRecipients = 0
    for (const ids of selectedByClient.values()) {
      totalRecipients += ids.size
    }
    return { totalRecipients, totalCompanies: selectedByClient.size }
  }, [selectedByClient])

  const contactsMap = useMemo(() => {
    const map = new Map()
    for (const client of clientRows) {
      for (const c of client.contacts) {
        map.set(c.contactId, c)
      }
    }
    return map
  }, [clientRows])

  const clientsMap = useMemo(() => {
    const map = new Map()
    for (const client of clientRows) {
      map.set(client.clientId, client)
    }
    return map
  }, [clientRows])

  function toggleContact(clientId, contactId) {
    setSelectedByClient(prev => {
      const next = new Map(prev)
      const set = new Set(next.get(clientId) || [])
      if (set.has(contactId)) {
        set.delete(contactId)
        if (set.size === 0) {
          next.delete(clientId)
        } else {
          next.set(clientId, set)
        }
      } else {
        set.add(contactId)
        next.set(clientId, set)
      }
      return next
    })
  }

  const selectedContactIds = useMemo(() => {
    const set = new Set()
    for (const ids of selectedByClient.values()) {
      for (const id of ids) set.add(id)
    }
    return set
  }, [selectedByClient])

  function removeContact(clientId, contactId) {
    toggleContact(clientId, contactId)
  }

  function toggleSelectAll() {
    const allSelected = filteredClients.every(client =>
      client.contacts.every(c => selectedContactIds.has(c.contactId))
    )
    setSelectedByClient(prev => {
      const next = new Map()
      if (!allSelected) {
        for (const client of filteredClients) {
          const ids = new Set(client.contacts.map(c => c.contactId))
          next.set(client.clientId, ids)
        }
      }
      return next
    })
  }

  const allContactsSelected = useMemo(() =>
    filteredClients.length > 0 && filteredClients.every(client =>
      client.contacts.every(c => selectedContactIds.has(c.contactId))
    ),
    [filteredClients, selectedContactIds]
  )

  const selectedTemplate = templates.find(t => t.id === templateId)

  function buildVars() {
    return {
      assunto: subject,
      corpo_mensagem: body,
      csm_nome: profile?.name || '',
      csm_cargo: profile?.cargo || '',
      csm_telefone: profile?.phone || '',
      csm_email: profile?.email || '',
    }
  }

  function buildVarsForContact(contactId) {
    const contact = contactsMap.get(contactId)
    let clientName = ''
    for (const [clientId, contactIds] of selectedByClient) {
      if (contactIds.has(contactId)) {
        const client = clientsMap.get(clientId)
        if (client) clientName = client.clientName
        break
      }
    }
    return {
      ...buildVars(),
      nome_contato: contact?.name || '',
      nome_empresa: clientName,
    }
  }

  async function handleRewrite() {
    setRewriting(true)
    try {
      const { data: cfg } = await supabase
        .from('freshdesk_config')
        .select('data')
        .eq('key', 'email_rewrite_prompt')
        .maybeSingle()

      const systemPrompt = cfg?.data?.prompt?.trim() || DEFAULT_EMAIL_PROMPT
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Reescreva o texto abaixo mantendo o tom profissional e o mesmo conteúdo:\n\n${body}` },
          ],
          max_tokens: 2000,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao reescrever')

      const rewritten = json.choices?.[0]?.message?.content
      if (rewritten) {
        setBody(rewritten)
        toast.success('E-mail reescrito!')
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao reescrever e-mail')
    } finally {
      setRewriting(false)
    }
  }

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

  async function resetComposer() {
    if (!sending && result && !result.error) {
      // clear uploaded files
    } else if (!sending) {
      for (const att of attachments) {
        if (att.storagePath) {
          try {
            await supabase.storage.from('activity-attachments').remove([att.storagePath])
          } catch (_) { }
        }
      }
    }
    setTemplateId('')
    setSubject('')
    setBody('')
    setFromMode(profile?.email?.endsWith('@donc.com.br') ? 'csm' : 'noreply')
    setResult(null)
    setSending(false)
    setAttachments([])
    setShowPreview(false)
  }

  async function handleSend() {
    const totalRecipients = summary.totalRecipients
    if (totalRecipients > 100) {
      toast.error('Limite de 100 destinatários por envio. Remova alguns contatos ou divida em lotes.')
      return
    }

    setSending(true)
    try {
      let attachmentMeta = []
      if (attachments.length > 0) {
        setUploadingFiles(true)
        for (const att of attachments) {
          const safeName = sanitizeFileName(att.name)
          const storagePath = `blast_temp/${Date.now()}_${safeName}`
          const { error } = await supabase.storage
            .from('activity-attachments')
            .upload(storagePath, att.file)
          if (error) throw new Error(`Falha ao enviar ${att.name}: ${error.message}`)
          att.storagePath = storagePath
          attachmentMeta.push({
            storage_path: storagePath,
            file_name: att.name,
            file_size: att.size,
            file_type: att.type,
          })
        }
        setUploadingFiles(false)
      }

      const recipients = []
      for (const [clientId, contactIds] of selectedByClient) {
        const client = clientsMap.get(clientId)
        if (!client) continue
        for (const contactId of contactIds) {
          const contact = contactsMap.get(contactId)
          if (!contact) continue
          recipients.push({
            contact_id: contactId,
            client_id: clientId,
            email: contact.email,
            variables: {
              nome_contato: contact.name,
              nome_empresa: client.clientName,
              assunto: subject,
              corpo_mensagem: body,
              csm_nome: profile?.name || '',
              csm_cargo: profile?.cargo || '',
              csm_telefone: profile?.phone || '',
              csm_email: profile?.email || '',
            },
          })
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      const sbUrl = import.meta.env.VITE_SUPABASE_URL

      const res = await fetch(`${sbUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          template_id: templateId,
          recipients,
          sent_by: user.id,
          from_mode: fromMode,
          attachments: attachmentMeta,
        }),
      })

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: String(err), sent: 0, failed: summary.totalRecipients, logs: [] })
    } finally {
      setSending(false)
      setUploadingFiles(false)
    }
  }

  const canSend = summary.totalRecipients > 0 && templateId && subject.trim() && body.trim()

  const firstSelectedContactId = useMemo(() => {
    for (const ids of selectedByClient.values()) {
      if (ids.size > 0) return ids.values().next().value
    }
    return null
  }, [selectedByClient])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icons.Loader2 className="w-6 h-6 text-text-tertiary animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Icons.AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SettingsSectionHeader
        icon={Icons.Send}
        title="Envio de E-mail em Massa"
        subtitle="Selecione os destinatários e componha a mensagem para envio em lote."
      />

      {/* SummaryPill + SelectAll */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Icons.Users className="w-4 h-4" />
          <span>
            <strong className="text-text-primary">{summary.totalRecipients}</strong> destinatário{summary.totalRecipients !== 1 ? 's' : ''}
            {summary.totalCompanies > 0 && (
              <> em <strong className="text-text-primary">{summary.totalCompanies}</strong> empresa{summary.totalCompanies !== 1 ? 's' : ''}</>
            )}
          </span>
          {summary.totalRecipients > 100 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Icons.HelpCircle className="w-3 h-3" />
              Limite de 100 por envio
            </span>
          )}
        </div>
        {filteredClients.length > 0 && (
          <button onClick={toggleSelectAll} className="flex items-center gap-1 text-xs text-donc-sky hover:text-donc-sky/80 font-medium">
            <Icons.CheckSquare className="w-3.5 h-3.5" />
            {allContactsSelected ? 'Desselecionar todos' : 'Selecionar todos'}
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* LEFT: RecipientSelector */}
        <div className="w-96 flex-shrink-0 space-y-3">
          <div className="relative">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="w-full pl-9 pr-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-18rem)] overflow-y-auto">
            {filteredClients.length === 0 ? (
              <p className="text-sm text-text-tertiary text-center py-8">Nenhuma empresa encontrada.</p>
            ) : (
              filteredClients.map(client => {
                const selected = selectedByClient.get(client.clientId)
                const selectedCount = selected?.size || 0
                const isExpanded = expandedClient === client.clientId

                return (
                  <div
                    key={client.clientId}
                    className="border border-border-tertiary rounded-md bg-bg-primary overflow-visible"
                  >
                    <button
                      onClick={() => setExpandedClient(isExpanded ? null : client.clientId)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-bg-secondary transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded
                          ? <Icons.ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" />
                          : <Icons.ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
                        }
                        <span className="text-sm font-medium text-text-primary truncate">{client.clientName}</span>
                        {selectedCount > 0 && (
                          <span className="text-[10px] font-semibold text-donc-sky bg-donc-sky/10 px-1.5 py-0.5 rounded-full">
                            {selectedCount}
                          </span>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2 border-t border-border-tertiary pt-2">
                        {selected && selected.size > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {[...selected].map(contactId => {
                              const contact = contactsMap.get(contactId)
                              if (!contact) return null
                              const tags = getReasonTags(contact)
                              return (
                                <span
                                  key={contactId}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-donc-sky/10 text-donc-navy text-xs rounded-md border border-donc-sky/20 max-w-full"
                                >
                                  <span className="truncate">{contact.name || contact.email}</span>
                                  {tags.map((tag, i) => {
                                    const TagIcon = tag.icon
                                    return (
                                      <span key={i} className={tag.className} title={tag.label}>
                                        <TagIcon className="w-3 h-3" />
                                      </span>
                                    )
                                  })}
                                  <button
                                    onClick={e => { e.stopPropagation(); removeContact(client.clientId, contactId) }}
                                    className="hover:text-red-500 shrink-0 ml-0.5"
                                  >
                                    <Icons.X className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        )}

                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setAddDropdown(addDropdown === client.clientId ? null : client.clientId) }}
                            className="flex items-center gap-1 text-xs text-donc-sky hover:text-donc-sky/80 font-medium"
                          >
                            <Icons.Plus className="w-3.5 h-3.5" />
                            Adicionar contato
                          </button>

                          {addDropdown === client.clientId && (
                            <div className="absolute z-10 left-0 mt-1 w-full bg-bg-primary border border-border-tertiary rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {client.contacts.filter(c => !selectedContactIds.has(c.contactId)).length === 0 ? (
                                <p className="px-3 py-2 text-xs text-text-tertiary">Nenhum contato disponível.</p>
                              ) : (
                                client.contacts
                                  .filter(c => !selectedContactIds.has(c.contactId))
                                  .map(c => (
                                    <button
                                      key={c.contactId}
                                      onClick={e => { e.stopPropagation(); toggleContact(client.clientId, c.contactId); setAddDropdown(null) }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-bg-tertiary text-text-primary flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate font-medium">{c.name || 'Sem nome'}</div>
                                        <div className="text-xs text-text-tertiary truncate">{c.email}</div>
                                      </div>
                                      {c.papel && (
                                        <span className="text-xs text-text-tertiary shrink-0">{c.papel}</span>
                                      )}
                                    </button>
                                  ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: EmailComposer */}
        <div className="flex-1 space-y-4">
          {result ? (
            <div className="space-y-4">
              {result.error ? (
                <div className="text-center py-8">
                  <Icons.XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                  <p className="text-sm text-red-600 mb-4">{result.error}</p>
                  <div className="flex justify-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setResult(null)}>Tentar novamente</Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Icons.CheckCircle2 className="w-5 h-5 text-green-600" />
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
                    <Button variant="primary" size="sm" onClick={() => { resetComposer(); setShowPreview(false) }}>
                      <Icons.Send className="w-3.5 h-3.5" />
                      Enviar nova campanha
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Template */}
              <div>
                <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Template</label>
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
                <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Assunto</label>
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
                <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Mensagem</label>
                <EmailEditor value={body} onChange={setBody} onRewrite={handleRewrite} rewriting={rewriting} />
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
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,.html,.htm"
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
                      <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary rounded-md text-sm">
                        <Icons.Paperclip className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        <span className="flex-1 truncate text-text-primary min-w-0">{att.name}</span>
                        <span className="text-xs text-text-tertiary whitespace-nowrap">{formatFileSize(att.size)}</span>
                        <button onClick={() => removeAttachment(att.id)} className="text-text-tertiary hover:text-red-500 p-0.5">
                          <Icons.X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* From mode */}
              {(profile?.role === 'admin' || profile?.role === 'manager') && (
                <div>
                  <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Remetente</label>
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
                      <span className="text-sm text-text-primary">Meu e-mail ({profile?.email})</span>
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

              {/* Domain warning */}
              {profile && fromMode === 'csm' && !profile.email?.endsWith('@donc.com.br') && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                  <Icons.HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Seu e-mail de perfil (<strong>{profile.email}</strong>) não é @donc.com.br.
                    Para enviar e-mails como remetente individual, atualize seu e-mail em{' '}
                    <strong>Configurações &gt; Perfil</strong>.
                  </span>
                </div>
              )}

              {/* Signature */}
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
                <span className="text-xs text-text-tertiary">
                  <strong className="text-text-primary">{summary.totalRecipients}</strong> destinatário{summary.totalRecipients !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  {selectedTemplate && (subject.trim() || body.trim()) && (
                    <Button variant="secondary" size="sm" onClick={() => setShowPreview(p => !p)}>
                      <Icons.Eye className="w-3.5 h-3.5" />
                      {showPreview ? 'Fechar preview' : 'Preview'}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!canSend || sending || uploadingFiles}
                    onClick={handleSend}
                  >
                    {uploadingFiles ? (
                      <>Enviando arquivos...</>
                    ) : sending ? (
                      <><Icons.Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                    ) : (
                      <><Icons.Send className="w-3.5 h-3.5" /> Enviar</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {selectedTemplate && firstSelectedContactId && (
        <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Preview" maxWidth="max-w-3xl">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Destinatário de exemplo</p>
              {(() => {
                const contact = contactsMap.get(firstSelectedContactId)
                return (
                  <span className="px-2 py-0.5 bg-bg-tertiary rounded text-xs text-text-primary">
                    {contact?.name || ''} &lt;{contact?.email || ''}&gt;
                  </span>
                )
              })()}
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
                  srcDoc={mergeTags(selectedTemplate.html_body, buildVarsForContact(firstSelectedContactId))}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
