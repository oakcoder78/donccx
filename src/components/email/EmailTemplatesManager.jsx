import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { SettingsMenuIcons } from '../../lib/icons'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import { SettingsSectionHeader } from '../settings/SettingsSectionHeader'
import { Mail, Plus, X, Pencil, Trash2 } from 'lucide-react'

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
  return { next, pos }
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        backgroundColor: value ? '#173557' : '#d4d3ce',
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-block',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
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
      qc.invalidateQueries({ queryKey: ['email_templates'] })
      toast.success('Template salvo.')
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  })
}

// ─── Editor panel ─────────────────────────────────────────────────────────────
function TemplateEditor({ template, onSave, onCancel, saving }) {
  const [name,      setName]     = useState(template?.name      ?? '')
  const [subject,   setSubject]  = useState(template?.subject   ?? '')
  const [htmlBody,  setHtmlBody] = useState(template?.html_body ?? '')
  const [active,    setActive]   = useState(template?.active ?? true)
  const [variables, setVars]     = useState(() => {
    const v = template?.variables
    if (Array.isArray(v)) return v
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
    return []
  })
  const [newVar,      setNewVar]       = useState('')
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
      active,
    })
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* Nome + ativo */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Nome *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-border-tertiary rounded-md text-sm bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
            placeholder="nome_do_template"
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Toggle value={active} onChange={setActive} />
          <span className="text-sm text-text-secondary">Ativo</span>
        </div>
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
      <div className="flex flex-col gap-1 flex-1">
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
          style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 280 }}
          className="w-full px-3 py-2 border border-border-tertiary rounded-md bg-bg-primary text-text-primary outline-none focus:border-donc-sky resize-y flex-1"
          spellCheck={false}
        />
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="flex-shrink-0">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Preview (dados fictícios)</p>
          <div className="border border-border-tertiary rounded-md overflow-hidden" style={{ height: 320 }}>
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
        <Button variant="primary"   size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EmailTemplatesManager() {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: templates = [], isLoading } = useTemplates()
  const save = useSaveTemplate(qc)

  const [selectedId, setSelectedId] = useState(null)
  const [isNew,      setIsNew]      = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const selected = isNew ? null : templates.find(t => t.id === selectedId)
  const showEditor = isNew || !!selected

  async function handleSave(tpl) {
    setSaving(true)
    try {
      await save.mutateAsync(tpl)
      setIsNew(false)
      setSelectedId(tpl.id)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setIsNew(false)
    setSelectedId(null)
  }

  async function handleDelete(item) {
    if (!window.confirm(`Excluir "${item.name}"?`)) return
    setDeletingId(item.id)
    const { count, error: countErr } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', item.id)
    if (countErr) { toast.error(countErr.message); setDeletingId(null); return }
    if (count > 0) {
      toast.error(`Este template foi usado em ${count} envio(s) e não pode ser excluído.`)
      setDeletingId(null)
      return
    }
    const { error } = await supabase.from('email_templates').delete().eq('id', item.id)
    setDeletingId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Template excluído')
    if (selectedId === item.id) setSelectedId(null)
    qc.invalidateQueries({ queryKey: ['email_templates_all'] })
    qc.invalidateQueries({ queryKey: ['email_templates'] })
  }

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <SettingsSectionHeader
        icon={SettingsMenuIcons['email-templates'] || Mail}
        title="Templates de E-mail"
        subtitle="Gerencie os templates usados no envio de e-mails para clientes."
        actions={
          isAdmin && (
            <Button
              size="sm"
              onClick={() => { setIsNew(true); setSelectedId(null) }}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Template
            </Button>
          )
        }
      />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-64 flex flex-col gap-2">
          {isAdmin && (
            <Button
              variant="primary" size="sm"
              className="w-full justify-center"
              onClick={() => { setIsNew(true); setSelectedId(null) }}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo template
            </Button>
          )}

          <div className="flex-1 overflow-y-auto border border-border-tertiary rounded-md bg-bg-primary">
            {templates.length === 0 ? (
              <p className="text-xs text-text-tertiary p-3">Nenhum template.</p>
            ) : (
              templates.map(t => {
                const isSelected = selectedId === t.id && !isNew
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-1 px-3 py-2.5 border-b border-border-tertiary last:border-b-0 transition-colors group
                      ${isSelected
                        ? 'bg-donc-navy text-white'
                        : 'hover:bg-bg-tertiary text-text-primary cursor-pointer'}`}
                    onClick={() => { setSelectedId(t.id); setIsNew(false) }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-text-primary'}`}>
                        {t.name}
                      </div>
                      {!t.active && (
                        <span className={`text-xs ${isSelected ? 'text-white/60' : 'text-text-tertiary'}`}>
                          inativo
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className={`flex gap-1 flex-shrink-0 ${isSelected ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(t.id); setIsNew(false) }}
                          title="Editar"
                          className={`p-1 rounded ${isSelected ? 'text-white/70 hover:text-white' : 'text-text-tertiary hover:text-donc-sky'}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(t) }}
                          disabled={deletingId === t.id}
                          title="Excluir"
                          className={`p-1 rounded ${isSelected ? 'text-white/70 hover:text-red-400' : 'text-text-tertiary hover:text-red-500'} disabled:opacity-40`}
                        >
                          {deletingId === t.id ? '...' : <Trash2 size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Editor ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden bg-bg-primary border border-border-tertiary rounded-lg p-4">
          {showEditor ? (
            <TemplateEditor
              key={isNew ? '__new__' : selectedId}
              template={isNew ? null : selected}
              onSave={handleSave}
              onCancel={handleCancel}
              saving={saving}
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