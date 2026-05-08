import { useState, useEffect } from 'react'
import { Paperclip, Eye, Download, Trash2, FileText, FileImage, FileSpreadsheet, File, Info, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { getClientAttachments } from '../../../../services/activityAttachments/getClientAttachments'
import { softDeleteActivityAttachment } from '../../../../services/activityAttachments/softDeleteActivityAttachment'
import { useProfiles } from '../../../../hooks/useProfiles'
import toast from 'react-hot-toast'

const ACTIVITY_TYPE_LABEL = {
  reuniao: 'Reunião', ligacao: 'Ligação', email: 'E-mail',
  whatsapp: 'WhatsApp', tarefa: 'Tarefa', nota: 'Nota',
}

function formatDate(iso, withTime = false) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (withTime) return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getExt(fileName) {
  return fileName?.split('.').pop()?.toLowerCase() ?? ''
}

function getFriendlyType(mimeType, fileName) {
  const ext = getExt(fileName)
  if (mimeType?.startsWith('image/')) return 'Imagem'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') return 'HTML'
  if (mimeType === 'text/markdown' || mimeType === 'text/x-markdown' || ext === 'md') return 'Markdown'
  if (mimeType?.includes('sheet') || mimeType?.includes('excel') || ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'Planilha'
  if (mimeType?.includes('word') || mimeType?.includes('document') || ext === 'docx' || ext === 'doc') return 'Word'
  if (mimeType?.startsWith('audio/')) return 'Áudio'
  if (mimeType?.startsWith('video/')) return 'Vídeo'
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'Compactado'
  if (ext === 'txt') return 'Texto'
  return 'Arquivo'
}

const TYPE_COLORS = {
  'Imagem':     'bg-sky-100 text-sky-700',
  'PDF':        'bg-red-100 text-red-700',
  'HTML':       'bg-orange-100 text-orange-700',
  'Markdown':   'bg-teal-100 text-teal-700',
  'Planilha':   'bg-green-100 text-green-700',
  'Word':       'bg-blue-100 text-blue-700',
  'Áudio':      'bg-purple-100 text-purple-700',
  'Vídeo':      'bg-pink-100 text-pink-700',
  'Compactado': 'bg-yellow-100 text-yellow-700',
  'Texto':      'bg-slate-100 text-slate-600',
  'Arquivo':    'bg-bg-tertiary text-text-tertiary',
}

function TypeBadge({ mimeType, fileName }) {
  const label = getFriendlyType(mimeType, fileName)
  const colors = TYPE_COLORS[label] ?? TYPE_COLORS['Arquivo']
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors}`}>
      {label}
    </span>
  )
}

function FileIcon({ mimeType, fileName, className = 'w-4 h-4' }) {
  const ext = getExt(fileName)
  if (mimeType?.startsWith('image/')) return <FileImage className={`${className} text-sky-500`} />
  if (mimeType === 'application/pdf') return <FileText className={`${className} text-red-500`} />
  if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') return <FileText className={`${className} text-orange-500`} />
  if (mimeType?.includes('sheet') || mimeType?.includes('excel') || ext === 'xlsx' || ext === 'csv')
    return <FileSpreadsheet className={`${className} text-green-600`} />
  if (mimeType?.includes('word') || mimeType?.includes('document'))
    return <FileText className={`${className} text-blue-500`} />
  return <File className={`${className} text-text-tertiary`} />
}

function SourceBadge({ source }) {
  const cls = source === 'evidencia'
    ? 'bg-violet-100 text-violet-700'
    : 'bg-sky-100 text-sky-700'
  const label = source === 'evidencia' ? 'Projeto' : 'Atividade'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls} mr-1.5 flex-shrink-0`}>
      {label}
    </span>
  )
}

function getOriginLabel(file) {
  if (file._source === 'activity') {
    const act = file.activities
    if (!act) return 'Atividade'
    const typeLabel = ACTIVITY_TYPE_LABEL[act.type] ?? act.type
    return `${typeLabel}: ${act.title || act.description || `#${act.id}`}`
  }
  if (file._source === 'evidencia') {
    const { faseName, projectTitle } = file._faseInfo ?? {}
    if (projectTitle && faseName) return `${projectTitle} / ${faseName}`
    if (projectTitle) return projectTitle
    if (faseName) return `Fase: ${faseName}`
    return 'Evidência de fase'
  }
  return '—'
}

function getPreviewMode(file) {
  const ext = getExt(file.file_name)
  const mime = file.file_type ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'text/html' || ext === 'html' || ext === 'htm') return 'html'
  if (mime === 'text/markdown' || mime === 'text/x-markdown' || ext === 'md') return 'markdown'
  return 'external'
}

function mdToHtml(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>')
}

const MD_IFRAME_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; line-height: 1.7; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
  h1,h2,h3 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
  code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  a { color: #0066cc; }
  p { margin: 0.75rem 0; }
`

async function softDeleteEvidencia(id) {
  const { error } = await supabase
    .from('onboarding_evidencias')
    .update({ is_deleted: true })
    .eq('id', id)
  return error ? { success: false, error: error.message } : { success: true }
}

function CloseBtn({ onClick }) {
  return (
    <button onClick={onClick} className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors">
      <X className="w-4 h-4" />
    </button>
  )
}

// ── Details modal ─────────────────────────────────────────────────────────────
function DetailsModal({ file, onClose }) {
  const origin = getOriginLabel(file)
  const friendlyType = getFriendlyType(file.file_type, file.file_name)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-bg-primary rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-border-tertiary">
          <div className="w-9 h-9 rounded-lg bg-bg-secondary flex items-center justify-center flex-shrink-0">
            <FileIcon mimeType={file.file_type} fileName={file.file_name} className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary break-all leading-snug">{file.file_name}</p>
            <p className="text-xs text-text-tertiary mt-0.5">{file.file_type || '—'}</p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        {/* Body */}
        <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-xs text-text-tertiary mb-0.5">Tipo</p>
            <TypeBadge mimeType={file.file_type} fileName={file.file_name} />
          </div>
          <div>
            <p className="text-xs text-text-tertiary mb-0.5">Tamanho</p>
            <p className="text-sm text-text-primary">{formatSize(file.file_size)}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary mb-0.5">Enviado por</p>
            <p className="text-sm text-text-primary">{file.profiles?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary mb-0.5">Data</p>
            <p className="text-sm text-text-primary">{formatDate(file.created_at, true)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-text-tertiary mb-1">Origem</p>
            <div className="flex items-center">
              <SourceBadge source={file._source} />
              <p className="text-sm text-text-primary">{origin}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ preview, onClose }) {
  if (!preview) return null

  if (preview.type === 'image') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
        <div className="relative max-w-5xl max-h-[92vh] p-2" onClick={e => e.stopPropagation()}>
          <img src={preview.url} alt="Preview" className="max-h-[88vh] max-w-full object-contain rounded-lg shadow-2xl" />
          <button onClick={onClose} className="absolute top-4 right-4 bg-black/50 hover:bg-black/75 text-white rounded-full w-8 h-8 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  if (preview.type === 'html' || preview.type === 'markdown') {
    const srcDoc = preview.type === 'html'
      ? preview.content
      : `<!DOCTYPE html><html><head><style>${MD_IFRAME_CSS}</style></head><body><p>${mdToHtml(preview.content)}</p></body></html>`

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
        <div className="w-full max-w-4xl h-[88vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <TypeBadge mimeType={preview.file.file_type} fileName={preview.file.file_name} />
              <span className="text-sm text-gray-700 truncate">{preview.file.file_name}</span>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <iframe
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-forms"
            title={preview.file.file_name}
            className="flex-1 w-full border-0"
          />
        </div>
      </div>
    )
  }

  return null
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ClientSubAnexos({ client }) {
  const [attachments, setAttachments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [preview, setPreview] = useState(null)
  const [detailFile, setDetailFile] = useState(null)
  const [authUser, setAuthUser] = useState(null)

  const { data: profiles = [] } = useProfiles()
  const profile = profiles.find(p => p.id === authUser?.id)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data?.user ?? null))
  }, [])

  useEffect(() => {
    if (!client?.id) return
    setIsLoading(true)
    getClientAttachments(client.id).then(result => {
      if (result.success) setAttachments(result.data)
      setIsLoading(false)
    })
  }, [client?.id])

  async function handleView(file) {
    const mode = getPreviewMode(file)
    const { data, error } = await supabase.storage.from('activity-attachments').createSignedUrl(file.storage_path, 120)
    if (error || !data?.signedUrl) { toast.error('Erro ao gerar URL'); return }

    if (mode === 'image') {
      setPreview({ type: 'image', url: data.signedUrl, file })
      return
    }

    if (mode === 'html' || mode === 'markdown') {
      try {
        const resp = await fetch(data.signedUrl)
        const content = await resp.text()
        setPreview({ type: mode, content, file })
      } catch {
        window.open(data.signedUrl, '_blank')
      }
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function handleDownload(file) {
    const { data, error } = await supabase.storage.from('activity-attachments').createSignedUrl(file.storage_path, 60, { download: true })
    if (error || !data?.signedUrl) { toast.error('Erro ao baixar arquivo'); return }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = file.file_name
    a.click()
  }

  async function handleDelete(file) {
    const canDelete = file.uploaded_by === authUser?.id || profile?.role === 'admin'
    if (!canDelete) { toast.error('Sem permissão para excluir este anexo'); return }
    if (!confirm(`Excluir "${file.file_name}"?`)) return

    const result = file._source === 'evidencia'
      ? await softDeleteEvidencia(file.id)
      : await softDeleteActivityAttachment(file.id)

    if (result.success) {
      setAttachments(prev => prev.filter(a => !(a.id === file.id && a._source === file._source)))
      toast.success('Anexo excluído')
    } else {
      toast.error('Erro ao excluir anexo')
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-text-tertiary text-sm">Carregando anexos...</div>
  }

  if (attachments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-tertiary">
        <Paperclip className="w-8 h-8 opacity-40" strokeWidth={1.5} />
        <p className="text-sm">Nenhum anexo encontrado para este cliente.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
        <Paperclip className="w-4 h-4" strokeWidth={1.8} />
        <span>{attachments.length} anexo{attachments.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded-lg border border-border-tertiary overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[18%]" />
            <col className="w-[28%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead>
            <tr className="bg-bg-secondary border-b border-border-tertiary text-text-tertiary text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2.5 font-medium">Arquivo</th>
              <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
              <th className="text-left px-3 py-2.5 font-medium">Origem</th>
              <th className="text-left px-3 py-2.5 font-medium">Data</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-tertiary">
            {attachments.map(file => (
              <tr key={`${file._source}-${file.id}`} className="bg-bg-primary hover:bg-bg-secondary transition-colors">
                {/* File name */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon mimeType={file.file_type} fileName={file.file_name} className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-text-primary" title={file.file_name}>
                      {file.file_name}
                    </span>
                  </div>
                </td>

                {/* Type */}
                <td className="px-3 py-2.5">
                  <TypeBadge mimeType={file.file_type} fileName={file.file_name} />
                </td>

                {/* Origin */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center min-w-0">
                    <SourceBadge source={file._source} />
                    <span className="truncate text-text-secondary text-xs" title={getOriginLabel(file)}>
                      {getOriginLabel(file)}
                    </span>
                  </div>
                </td>

                {/* Date */}
                <td className="px-3 py-2.5 text-text-secondary text-xs whitespace-nowrap">
                  {formatDate(file.created_at)}
                </td>

                {/* Actions */}
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-0.5 justify-end">
                    <button onClick={() => handleView(file)} className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors" title="Visualizar">
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button onClick={() => handleDownload(file)} className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors" title="Baixar">
                      <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button onClick={() => setDetailFile(file)} className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors" title="Detalhes">
                      <Info className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button onClick={() => handleDelete(file)} className="p-1 rounded text-text-tertiary hover:text-red-500 hover:bg-bg-tertiary transition-colors" title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
      {detailFile && <DetailsModal file={detailFile} onClose={() => setDetailFile(null)} />}
    </div>
  )
}
