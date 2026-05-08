import { useState, useEffect } from 'react'
import { Paperclip, Eye, Download, Trash2, FileText, FileImage, FileSpreadsheet, File } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { getClientAttachments } from '../../../../services/activityAttachments/getClientAttachments'
import { softDeleteActivityAttachment } from '../../../../services/activityAttachments/softDeleteActivityAttachment'
import { useProfiles } from '../../../../hooks/useProfiles'
import toast from 'react-hot-toast'

const ACTIVITY_TYPE_LABEL = {
  reuniao: 'Reunião', ligacao: 'Ligação', email: 'E-mail',
  whatsapp: 'WhatsApp', tarefa: 'Tarefa', nota: 'Nota',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType, className = 'w-4 h-4' }) {
  if (!mimeType) return <File className={className} />
  if (mimeType.startsWith('image/')) return <FileImage className={`${className} text-sky-500`} />
  if (mimeType === 'application/pdf') return <FileText className={`${className} text-red-500`} />
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv'))
    return <FileSpreadsheet className={`${className} text-green-600`} />
  if (mimeType.includes('word') || mimeType.includes('document'))
    return <FileText className={`${className} text-blue-500`} />
  return <File className={`${className} text-text-tertiary`} />
}

function SourceBadge({ source }) {
  if (source === 'evidencia') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 mr-1.5 flex-shrink-0">
        Projeto
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 mr-1.5 flex-shrink-0">
      Atividade
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

async function softDeleteEvidencia(id) {
  const { error } = await supabase
    .from('onboarding_evidencias')
    .update({ is_deleted: true })
    .eq('id', id)
  return error ? { success: false, error: error.message } : { success: true }
}

export function ClientSubAnexos({ client }) {
  const [attachments, setAttachments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
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
    const { data, error } = await supabase
      .storage
      .from('activity-attachments')
      .createSignedUrl(file.storage_path, 60)
    if (error || !data?.signedUrl) { toast.error('Erro ao gerar URL'); return }
    if (file.file_type?.startsWith('image/')) {
      setPreviewUrl(data.signedUrl)
    } else {
      window.open(data.signedUrl, '_blank')
    }
  }

  async function handleDownload(file) {
    const { data, error } = await supabase
      .storage
      .from('activity-attachments')
      .createSignedUrl(file.storage_path, 60, { download: true })
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
      setAttachments(prev => prev.filter(a => a.id !== file.id || a._source !== file._source))
      toast.success('Anexo excluído')
    } else {
      toast.error('Erro ao excluir anexo')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-tertiary text-sm">
        Carregando anexos...
      </div>
    )
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
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-secondary border-b border-border-tertiary text-text-tertiary text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2.5 font-medium">Arquivo</th>
              <th className="text-left px-3 py-2.5 font-medium">Origem</th>
              <th className="text-left px-3 py-2.5 font-medium">Data</th>
              <th className="text-left px-3 py-2.5 font-medium">Enviado por</th>
              <th className="text-left px-3 py-2.5 font-medium">Tamanho</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-tertiary">
            {attachments.map(file => (
              <tr key={`${file._source}-${file.id}`} className="bg-bg-primary hover:bg-bg-secondary transition-colors">
                {/* File */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon mimeType={file.file_type} className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate text-text-primary max-w-[200px]" title={file.file_name}>
                      {file.file_name}
                    </span>
                  </div>
                </td>

                {/* Origin */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center min-w-0">
                    <SourceBadge source={file._source} />
                    <span className="truncate text-text-secondary max-w-[200px]" title={getOriginLabel(file)}>
                      {getOriginLabel(file)}
                    </span>
                  </div>
                </td>

                {/* Date */}
                <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">
                  {formatDate(file.created_at)}
                </td>

                {/* Uploader */}
                <td className="px-3 py-2.5 text-text-secondary">
                  {file.profiles?.name ?? '—'}
                </td>

                {/* Size */}
                <td className="px-3 py-2.5 text-text-tertiary whitespace-nowrap">
                  {formatSize(file.file_size)}
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => handleView(file)}
                      className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                      title="Visualizar"
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => handleDownload(file)}
                      className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                      title="Baixar"
                    >
                      <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => handleDelete(file)}
                      className="p-1.5 rounded text-text-tertiary hover:text-red-500 hover:bg-bg-tertiary transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Image preview overlay */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-2" onClick={e => e.stopPropagation()}>
            <img src={previewUrl} alt="Preview" className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl" />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 bg-black/50 hover:bg-black/75 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
