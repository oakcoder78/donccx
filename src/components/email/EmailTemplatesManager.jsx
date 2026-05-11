import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { SettingsMenuIcons } from '../../lib/icons'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import { SettingsSectionHeader } from '../settings/SettingsSectionHeader'
import { Mail, Plus, X, Pencil, Trash2, ArrowLeft, Image } from 'lucide-react'

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

// ─── Table view ───────────────────────────────────────────────────────────────
function TemplateList({ templates, onEdit, onDelete, deletingId, onNew, isAdmin }) {
  if (templates.length === 0) {
    return (
      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden w-full">
        <div className="flex items-center justify-center py-16 text-text-tertiary text-sm">
          <div className="text-center">
            <p className="mb-3">Nenhum template cadastrado.</p>
            {isAdmin && (
              <Button size="sm" onClick={onNew}>
                <Plus className="w-3.5 h-3.5" />
                Criar primeiro template
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden w-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-tertiary bg-donc-navy text-white">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Nome</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Assunto</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">Ativo</th>
              {isAdmin && <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {templates.map(item => (
              <tr
                key={item.id}
                className="border-b border-border-tertiary hover:bg-bg-secondary transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="font-medium text-text-primary">{item.name}</span>
                </td>
                <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">
                  {item.subject || <span className="text-text-tertiary">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Toggle
                    value={item.active}
                    onChange={async (val) => {
                      const { error } = await supabase
                        .from('email_templates')
                        .update({ active: val })
                        .eq('id', item.id)
                      if (error) { toast.error(error.message); return }
                      toast.success(val ? 'Template ativado' : 'Template desativado')
                    }}
                    disabled={!isAdmin}
                  />
                </td>
                {isAdmin && (
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onEdit(item)}
                        title="Editar"
                        className="p-1 text-text-secondary hover:text-donc-sky rounded"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(item)}
                        disabled={deletingId === item.id}
                        title="Excluir"
                        className="p-1 text-text-secondary hover:text-red-500 rounded disabled:opacity-40"
                      >
                        {deletingId === item.id ? '...' : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Editor view ──────────────────────────────────────────────────────────────
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
    <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden w-full p-5">
      {/* Nome + Ativo row */}
      <div className="flex items-end gap-3 mb-4">
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
      <div className="mb-4">
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
      <div className="mb-4">
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
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
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
              <Image className="w-3.5 h-3.5" />
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
          rows={16}
          style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 360 }}
          className="w-full px-3 py-2 border border-border-tertiary rounded-md bg-bg-primary text-text-primary outline-none focus:border-donc-sky resize-y"
          spellCheck={false}
        />
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Preview (dados fictícios)</p>
          <div className="border border-border-tertiary rounded-md overflow-hidden" style={{ height: 380 }}>
            <iframe
              title="template-preview"
              style={{ width: '100%', height: '100%', border: 'none' }}
              srcDoc={mergeTags(htmlBody, { ...PREVIEW_VARS, assunto: subject || PREVIEW_VARS.assunto })}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2 border-t border-border-tertiary">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
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

  const [view,        setView]        = useState('list')
  const [editingItem, setEditingItem] = useState(null)
  const [isNew,       setIsNew]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [deletingId,  setDeletingId]  = useState(null)

  async function handleSave(tpl) {
    setSaving(true)
    try {
      await save.mutateAsync(tpl)
      setView('list')
      setEditingItem(null)
      setIsNew(false)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setView('list')
    setEditingItem(null)
    setIsNew(false)
  }

  function handleEdit(item) {
    setEditingItem(item)
    setIsNew(false)
    setView('editor')
  }

  function handleNew() {
    setEditingItem(null)
    setIsNew(true)
    setView('editor')
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
    qc.invalidateQueries({ queryKey: ['email_templates_all'] })
    qc.invalidateQueries({ queryKey: ['email_templates'] })
  }

  const editorTitle = isNew ? 'Novo Template' : `Editar: ${editingItem?.name}`

  if (isLoading) return <PageSpinner />

  return (
    <div className="max-w-6xl space-y-4">

      <SettingsSectionHeader
        icon={SettingsMenuIcons['email-templates'] || Mail}
        title={view === 'editor' ? editorTitle : 'Templates de E-mail'}
        subtitle={view === 'editor'
          ? null
          : 'Gerencie os templates usados no envio de e-mails para clientes.'}
        actions={
          view === 'list' && isAdmin && (
            <Button size="sm" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5" />
              Novo Template
            </Button>
          )
        }
        backAction={
          view === 'editor' ? (
            <Button variant="secondary" size="sm" onClick={handleCancel}>
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para lista
            </Button>
          ) : undefined
        }
      />

      {view === 'list' && (
        <TemplateList
          templates={templates}
          onEdit={handleEdit}
          onDelete={handleDelete}
          deletingId={deletingId}
          onNew={handleNew}
          isAdmin={isAdmin}
        />
      )}

      {view === 'editor' && (
        <TemplateEditor
          key={isNew ? '__new__' : editingItem?.id}
          template={isNew ? null : editingItem}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
        />
      )}
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