import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { Button } from '../ui/Button'
import { SettingsSectionHeader } from '../settings/SettingsSectionHeader'
import { Mail, Plus, X } from 'lucide-react'

// ─── Example values used in template preview ─────────────────────────────────
const PREVIEW_VARS = {
  assunto:        'Assunto de exemplo',
  corpo_mensagem: '<p>Mensagem de exemplo para visualização do template.</p>',
  csm_nome:       'João Silva',
  csm_cargo:      'Customer Success Manager',
  csm_telefone:   '(11) 99999-9999',
  csm_email:      'joao.silva@donc.com.br',
  empresa_nome:   'Empresa Exemplo',
  contato_nome:   'Maria Souza',
}

function mergeTags(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `[${k}]`)
}

// ─── Insert text at cursor in a textarea ─────────────────────────────────────
function insertAtCursor(textarea, text) {
  if (!textarea) return
  const start = textarea.selectionStart
  const end   = textarea.selectionEnd
  const val   = textarea.value
  const next  = val.slice(0, start) + text + val.slice(end)
  const pos   = start + text.length
  // We return the new value and cursor position so the caller can setState
  return { next, pos }
}

// ─── Query hooks ──────────────────────────────────────────────────────────────
function useTemplates() {
  return useQuery({
    queryKey: ['email_templates_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, subject, html_body, variables, active')
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

function useSaveTemplate(qc) {
  return useMutation({
    mutationFn: async (tpl) => {
      const { error } = await supabase
        .from('email_templates')
        .upsert({ ...tpl }, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email_templates_all'] })
      qc.invalidateQueries({ queryKey: ['email_templates'] }) // invalidate composer cache too
      toast.success('Template salvo.')
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  })
}

// ─── Editor panel ─────────────────────────────────────────────────────────────
function TemplateEditor({ template, onSave, onCancel }) {
  const [name,      setName]     = useState(template?.name      ?? '')
  const [subject,   setSubject]  = useState(template?.subject   ?? '')
  const [htmlBody,  setHtmlBody] = useState(template?.html_body ?? '')
  const [variables, setVars]     = useState(() => {
    const v = template?.variables
    if (Array.isArray(v)) return v
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
    return []
  })
  const [newVar,    setNewVar]   = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [uploading,   setUploading]   = useState(false)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  function handleVarClick(varName) {
    const ta = textareaRef.current
    if (!ta) return
    const result = insertAtCursor(ta, `{{${varName}}}`)
    if (!result) return
    setHtmlBody(result.next)
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = result.pos
      ta.selectionEnd   = result.pos
    })
  }

  function addVar() {
    const v = newVar.trim().replace(/\s+/g, '_').toLowerCase()
    if (!v || variables.includes(v)) return
    setVars(prev => [...prev, v])
    setNewVar('')
  }

  function removeVar(v) {
    setVars(prev => prev.filter(x => x !== v))
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path  = `email-templates/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage
        .from('report-images')
        .upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage
        .from('report-images')
        .getPublicUrl(path)
      const tag = `<img src="${publicUrl}" style="max-width:100%">`
      const ta  = textareaRef.current
      if (ta) {
        const result = insertAtCursor(ta, tag)
        if (result) {
          setHtmlBody(result.next)
          requestAnimationFrame(() => {
            ta.focus()
            ta.selectionStart = result.pos
            ta.selectionEnd   = result.pos
          })
        }
      } else {
        setHtmlBody(prev => prev + tag)
      }
      toast.success('Imagem inserida.')
    } catch (err) {
      toast.error(`Erro no upload: ${err.message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return }
    onSave({
      id:        template?.id ?? crypto.randomUUID(),
      name:      name.trim(),
      subject:   subject.trim(),
      html_body: htmlBody,
      variables,
      active:    template?.active ?? true,
    })
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* Nome */}
      <div>
        <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Nome</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
          placeholder="nome_do_template"
        />
      </div>

      {/* Assunto */}
      <div>
        <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
          Assunto <span className="text-text-tertiary font-normal normal-case">(use {'{{assunto}}'} para assunto dinâmico)</span>
        </label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
          placeholder="{{assunto}}"
        />
      </div>

      {/* Variáveis */}
      <div>
        <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">
          Variáveis <span className="text-text-tertiary font-normal normal-case">(clique para inserir no editor)</span>
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {variables.map(v => (
            <div key={v} className="flex items-center gap-1 bg-bg-tertiary border border-border-tertiary rounded px-2 py-0.5">
              <button
                onClick={() => handleVarClick(v)}
                className="text-xs text-donc-navy font-mono hover:text-donc-sky"
                title={`Inserir {{${v}}}`}
              >
                {`{{${v}}}`}
              </button>
              <button onClick={() => removeVar(v)} className="text-text-tertiary hover:text-red-500 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newVar}
            onChange={e => setNewVar(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addVar()}
            placeholder="nova_variavel"
            className="flex-1 px-2 py-1 border border-border-tertiary rounded text-xs bg-bg-primary text-text-primary outline-none focus:border-donc-sky font-mono"
          />
          <Button variant="secondary" size="xs" onClick={addVar}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* HTML editor */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">HTML do template</label>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button variant="secondary" size="xs" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? 'Enviando...' : 'Inserir imagem'}
            </Button>
            <Button variant="secondary" size="xs" onClick={() => setShowPreview(p => !p)}>
              {showPreview ? 'Fechar preview' : 'Preview'}
            </Button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={htmlBody}
          onChange={e => setHtmlBody(e.target.value)}
          rows={14}
          style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 320 }}
          className="w-full px-3 py-2 border border-border-tertiary rounded-md bg-bg-primary text-text-primary outline-none focus:border-donc-sky resize-y"
          spellCheck={false}
        />
      </div>

      {/* Preview */}
      {showPreview && (
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Preview (dados fictícios)</p>
          <div className="border border-border-tertiary rounded-md overflow-hidden" style={{ height: 360 }}>
            <iframe
              title="template-preview"
              style={{ width: '100%', height: '100%', border: 'none' }}
              srcDoc={mergeTags(htmlBody, { ...PREVIEW_VARS, assunto: subject || PREVIEW_VARS.assunto })}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1 pb-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary"   size="sm" onClick={handleSave}>Salvar</Button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmailTemplatesManager() {
  const qc = useQueryClient()
  const { data: templates = [], isLoading } = useTemplates()
  const save = useSaveTemplate(qc)

  const [selectedId, setSelectedId] = useState(null)
  const [isNew,      setIsNew]      = useState(false)

  const selected = isNew ? null : templates.find(t => t.id === selectedId)
  const showEditor = isNew || !!selected

  function handleSave(tpl) {
    save.mutate(tpl, {
      onSuccess: () => {
        setIsNew(false)
        setSelectedId(tpl.id)
      },
    })
  }

  function handleCancel() {
    setIsNew(false)
    setSelectedId(null)
  }

  return (
    <div>
      <SettingsSectionHeader
        icon={Mail}
        title="Templates de E-mail"
        subtitle="Gerencie os templates usados no envio de e-mails para clientes."
      />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-64 flex flex-col gap-2">
          <Button
            variant="primary" size="sm"
            className="w-full justify-center"
            onClick={() => { setIsNew(true); setSelectedId(null) }}
          >
            <Plus className="w-3.5 h-3.5" />
            Novo template
          </Button>

          <div className="flex-1 overflow-y-auto border border-border-tertiary rounded-md">
            {isLoading ? (
              <p className="text-xs text-text-tertiary p-3">Carregando...</p>
            ) : templates.length === 0 ? (
              <p className="text-xs text-text-tertiary p-3">Nenhum template.</p>
            ) : (
              templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedId(t.id); setIsNew(false) }}
                  className={`w-full text-left px-3 py-2.5 border-b border-border-tertiary last:border-b-0 transition-colors
                    ${(selectedId === t.id && !isNew)
                      ? 'bg-donc-navy text-white'
                      : 'hover:bg-bg-tertiary text-text-primary'}`}
                >
                  <div className={`text-sm font-medium truncate ${selectedId === t.id && !isNew ? 'text-white' : 'text-text-primary'}`}>
                    {t.name}
                  </div>
                  {!t.active && (
                    <span className={`text-xs ${selectedId === t.id && !isNew ? 'text-white/60' : 'text-text-tertiary'}`}>
                      inativo
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Editor ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {showEditor ? (
            <TemplateEditor
              key={isNew ? '__new__' : selectedId}
              template={isNew ? null : selected}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
              Selecione um template ou crie um novo.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
