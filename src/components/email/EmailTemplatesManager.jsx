import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { SettingsMenuIcons } from '../../lib/icons'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import { SettingsSectionHeader } from '../settings/SettingsSectionHeader'
import toast from 'react-hot-toast'
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

// ─── Inline form ──────────────────────────────────────────────────────────────
const EMPTY = { name: '', subject: '', html_body: '', variables: [], active: true }

function InlineForm({ form, setForm, onSave, onCancel, saving }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-sm">Nome *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className="input-base w-full"
            placeholder="nome_do_template"
          />
        </div>
        <div>
          <label className="label-sm">Assunto</label>
          <input
            value={form.subject}
            onChange={e => set('subject', e.target.value)}
            className="input-base w-full"
            placeholder="{{assunto}}"
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
          <Toggle value={form.active} onChange={v => set('active', v)} />
          Ativo
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

// ─── Editor panel ─────────────────────────────────────────────────────────────
function TemplateEditor({ template, onSave, onCancel, saving }) {
  const [name,      setName]     = useState(template?.name      ?? '')
  const [subject,   setSubject]  = useState(template?.subject   ?? '')
  const [htmlBody, setHtmlBody] = useState(template?.html_body ?? '')
  const [variables, setVars]     = useState(() => {
    const v = template?.variables
    if (Array.isArray(v)) return v
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return [] } }
    return []
  })
  const [newVar,    setNewVar]   = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [uploading, setUploading]     = useState(false)

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
      active:    template?.active ?? true,
    })
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* Nome + Assunto */}
      <div>
        <label className="label-sm">Nome *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="input-base w-full"
          placeholder="nome_do_template"
        />
      </div>

      <div>
        <label className="label-sm">
          Assunto <span className="text-text-tertiary font-normal normal-case">(use {'{{assunto}}'} para assunto dinâmico)</span>
        </label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="input-base w-full"
          placeholder="{{assunto}}"
        />
      </div>

      {/* Variáveis */}
      <div>
        <label className="label-sm">
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
  const MailIcon = SettingsMenuIcons['email-templates'] || Mail
  const { isAdmin } = useAuth()

  const [items,     setItems]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm,  setEditForm]  = useState({})
  const [saving,    setSaving]    = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('email_templates')
      .select('id, name, subject, html_body, variables, active')
      .order('name')
    if (error) toast.error(error.message)
    else setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({ ...item })
    setAdding(false)
  }

  async function handleAdd() {
    if (!editForm.name?.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { error } = await supabase
      .from('email_templates')
      .insert({
        name:      editForm.name.trim(),
        subject:   editForm.subject?.trim() || '',
        html_body: editForm.html_body || '',
        variables: editForm.variables || [],
        active:    editForm.active ?? true,
      })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Template criado')
    setAdding(false)
    setEditForm(EMPTY)
    load()
  }

  async function handleEdit() {
    if (!editForm.name?.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { error } = await supabase
      .from('email_templates')
      .update({
        name:      editForm.name.trim(),
        subject:   editForm.subject?.trim() || '',
        html_body: editForm.html_body || '',
        variables: editForm.variables || [],
        active:    editForm.active ?? true,
      })
      .eq('id', editingId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Template atualizado')
    setEditingId(null)
    load()
  }

  async function handleToggleAtivo(item) {
    const { error } = await supabase
      .from('email_templates')
      .update({ active: !item.active })
      .eq('id', item.id)
    if (error) { toast.error(error.message); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !item.active } : i))
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
    if (editingId === item.id) setEditingId(null)
    load()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-6xl space-y-4">

      <SettingsSectionHeader
        icon={MailIcon}
        title="Templates de E-mail"
        subtitle="Gerencie os templates usados no envio de e-mails para clientes."
        actions={
          isAdmin && !adding && (
            <Button
              size="sm"
              onClick={() => {
                setAdding(true)
                setEditingId(null)
                setEditForm(EMPTY)
              }}
            >
              + Novo Template
            </Button>
          )
        }
      />

      {/* Card */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden w-full">

        {/* New form */}
        {adding && (
          <div className="p-4 border-b border-border-tertiary bg-bg-secondary">
            <p className="text-xs font-semibold text-text-primary mb-3">Novo Template</p>
            <InlineForm
              form={editForm}
              setForm={setEditForm}
              onSave={handleAdd}
              onCancel={() => { setAdding(false); setEditForm(EMPTY) }}
              saving={saving}
            />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-tertiary bg-donc-navy text-white">
                {isAdmin && <th className="w-8 px-3 py-2.5" />}
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Assunto</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Ativo</th>
                {isAdmin && <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Ações</th>}
              </tr>
            </thead>

            <tbody>
              {items.map(item =>
                editingId === item.id ? (
                  <tr key={item.id} className="border-b border-border-tertiary bg-bg-secondary">
                    <td colSpan={isAdmin ? 5 : 3} className="px-4 py-3">
                      <InlineForm
                        form={editForm}
                        setForm={setEditForm}
                        onSave={handleEdit}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={item.id}
                    className="border-b border-border-tertiary hover:bg-bg-secondary transition-colors"
                  >
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-text-tertiary cursor-grab">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-medium text-text-primary whitespace-nowrap">{item.name}</td>
                    <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">
                      {item.subject || <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Toggle
                        value={item.active}
                        onChange={() => handleToggleAtivo(item)}
                        disabled={!isAdmin}
                      />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(item)}
                            title="Editar"
                            className="p-1 text-text-secondary hover:text-donc-sky rounded"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
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
                )
              )}
              {items.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 3} className="px-4 py-8 text-center text-sm text-text-tertiary">
                    Nenhum template cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}