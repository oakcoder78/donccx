import { useState, useEffect } from 'react'
import { useActivityMutations } from '@/hooks/useActivities'
import { ActivityModal } from './ActivityModal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { getActivityAttachments } from '@/services/activityAttachments/getActivityAttachments'
import { softDeleteActivityAttachment } from '@/services/activityAttachments/softDeleteActivityAttachment'
import { supabase } from '@/lib/supabaseClient'
import toast from 'react-hot-toast'
import { Icons } from "@/lib/icons"

const ACTIVITY_ICONS = {
  reuniao: Icons.Calendar,
  ligacao: Icons.Phone,
  email: Icons.Mail,
  whatsapp: Icons.MessageCircle,
  tarefa: Icons.CheckSquare,
  nota: Icons.FileText,
  relatorio: Icons.FileText,
}
const ACTIVITY_BG = {
  reuniao: '#E6F1FB',
  ligacao: '#FAEEDA',
  email: '#EAF3DE',
  whatsapp: '#E6F9EC',
  tarefa: '#EEEDFE',
  nota: '#F5F5F3',
  relatorio: '#E8EEF7',
}
import { useProfiles } from '@/hooks/useProfiles'
import { useGoogleCalendarStatus } from '@/hooks/useGoogleCalendarStatus'
import { useSessionToken } from '@/hooks/useSessionToken'
import { GoogleSyncModal } from './GoogleSyncModal'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://etfeqblaeuhaobefxilp.supabase.co'

const typeLabel = { reuniao: 'Reunião', ligacao: 'Ligação', email: 'E-mail', whatsapp: 'WhatsApp', tarefa: 'Tarefa', nota: 'Nota' }

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function InfoCell({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-tertiary mb-0.5">{label}</p>
      <p className="text-sm text-text-primary">{value || '—'}</p>
    </div>
  )
}

export function ActivityDetailModal({ activity: a, onClose, onUpdated }) {
  const [showEdit, setShowEdit] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [previewUrl, setPreviewUrl] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [showTimeConfirm, setShowTimeConfirm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  // Removed currentUser state – using profile from useProfiles
  const { update, remove } = useActivityMutations()

  const { data: userProfiles } = useProfiles()
  const [authUser, setAuthUser] = useState(null)

  // Load authenticated user from Supabase
  useEffect(() => {
    async function loadAuthUser() {
      const { data, error } = await supabase.auth.getUser()
      if (error) {
        console.error('Error loading auth user:', error)
        return
      }
      setAuthUser(data?.user || null)
    }
    loadAuthUser()
  }, [])

  const profile = userProfiles?.find(p => p.id === authUser?.id)
  const { isConnected } = useGoogleCalendarStatus()
  const sessionToken = useSessionToken()

// Load current authenticated user
useEffect(() => {
  async function loadAttachments() {

    if (!a?.id) return

    const result =
      await getActivityAttachments(a.id)

    if (result.success) {
      setAttachments(result.data)
    }

  }

  loadAttachments()

}, [a?.id])

  async function handleDownload(file) {
    try {
      const { data, error } =
        await supabase
          .storage
          .from('activity-attachments')
          .createSignedUrl(
            file.storage_path,
            60
          )

      if (error) {
        console.error(error)
        return
      }

      if (!data?.signedUrl) return

      if (file.file_type.startsWith('image/')) {
        setPreviewUrl(data.signedUrl)
      } else {
        window.open(
          data.signedUrl,
          '_blank'
        )
      }
    } catch (err) {
      console.error('Download error:', err)
    }
  }

  async function handleToggle() {
    const newStatus = a.status === 'concluida' ? 'pendente' : 'concluida'
    await update.mutateAsync({ id: a.id, status: newStatus })
    onClose()
  }

  async function handleDelete() {
    if (!confirm('Excluir esta atividade?')) return
    await remove.mutateAsync(a.id)
    onClose()
  }

  function buildISO(date, time) {
    if (!date) return null
    const [h, m] = (time || '00:00').split(':')
    return new Date(`${date}T${h}:${m}:00`).toISOString()
  }

  async function handleSyncToGoogleCalendar(time) {
    if (!sessionToken) { toast.error('Sessão não disponível'); return }
    if (!isConnected) return

    setSyncing(true)
    try {
      const startISO = buildISO(a.activity_date, time)
      const endISO = new Date(new Date(startISO).getTime() + 50 * 60 * 1000).toISOString()

      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-event`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: a.title || a.description,
          description: a.description,
          start: startISO,
          end: endISO,
          attendees: a.contact?.email ? [{ email: a.contact.email }] : [],
          linkedActivity: { table: 'activities', id: a.id },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'TOKEN_EXPIRED') throw new Error('Google Calendar desconectado. Reconecte em Minha Conta.')
        throw new Error(data.error ?? 'Erro desconhecido')
      }
      toast.success('Evento criado no Google Calendar!')
      onUpdated?.()
    } catch (err) {
      toast.error(`Erro: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  if (showEdit) return <ActivityModal activity={a} onClose={() => { setShowEdit(false); onClose() }} />

  const isOverdue = a.due_date && a.status !== 'concluida' && new Date(a.due_date) < new Date();
  const Icon = ACTIVITY_ICONS[a.type] || Icons.FileText;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative mx-auto mt-[80px] mb-8 max-w-2xl bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-border-tertiary">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: ACTIVITY_BG[a.type] }}
>
            <Icon className="w-5 h-5 text-text-secondary" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-tertiary font-medium uppercase">{typeLabel[a.type]}</span>
              <Badge variant={a.status === 'concluida' ? 'green' : isOverdue ? 'red' : 'amber'}>
                {a.status === 'concluida' ? 'Concluída' : isOverdue ? 'Atrasada' : 'Pendente'}
              </Badge>
            </div>
            <h2 className="text-base font-semibold text-text-primary mt-0.5">{a.title || a.description}</h2>
            <p className="text-xs text-text-tertiary">{a.client?.name} · {formatDate(a.activity_date)}</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary p-1 rounded hover:bg-bg-tertiary flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Description box */}
          <div className="bg-bg-secondary rounded-lg p-3">
            <p className="text-sm text-text-primary whitespace-pre-wrap">{a.description}</p>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCell label="Cliente" value={a.client?.name} />
            <InfoCell label="Contato" value={a.contact?.name} />
            <InfoCell label="Responsável" value={a.responsible?.name} />
            <InfoCell label="Status" value={a.status === 'concluida' ? 'Concluída' : 'Pendente'} />
            <InfoCell label="Data" value={formatDate(a.activity_date)} />
            <InfoCell label="Vencimento" value={formatDate(a.due_date)} />
          </div>

          {a.notes && (
            <div>
              <p className="text-xs text-text-tertiary mb-1">Notas</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap bg-bg-secondary rounded-lg p-3">{a.notes}</p>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">
                <Icons.Paperclip className="w-4 h-4 text-text-secondary" strokeWidth={1.8} />
                <span>Anexos</span>
              </div>

              <div className="space-y-1">
                {attachments.map((file) => (
                  <div className="flex items-center justify-between gap-2 p-2 border border-border-tertiary rounded-md bg-bg-secondary">
                    {/* File name */}
                    <span
                      className="text-sm text-text-primary truncate flex-1"
                      title={file.file_name}
                    >
                      {file.file_name}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Preview */}
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="text-text-secondary hover:text-text-primary text-sm"
                        title="Visualizar"
                      >
                        <Icons.Eye className="w-4 h-4 text-text-secondary hover:text-text-primary"/>
                      </button>

                      {/* Download */}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { data, error } =
                              await supabase
                                .storage
                                .from('activity-attachments')
                                .createSignedUrl(
                                  file.storage_path,
                                  60
                                )

                            if (error) {
                              console.error(error)
                              return
                            }

                            if (data?.signedUrl) {
                              const link = document.createElement('a')
                              link.href = data.signedUrl
                              link.download = file.file_name
                              document.body.appendChild(link)
                              link.click()
                              link.remove()
                            }
                          } catch (err) {
                            console.error('Download error:', err)
                          }
                        }}
                        className="text-text-secondary hover:text-text-primary text-sm"
                        title="Download"
                      >
                        <Icons.Download className="w-4 h-4 text-text-secondary hover:text-text-primary transition-colors"/>
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!profile) {
                            toast.error('Usuário ainda não carregado. Tente novamente.')
                            return
                          }
                          const hasPermission =
                            file.uploaded_by === profile.id ||
                            profile.role === 'admin'

                          if (!hasPermission) {
                            toast.error('Você não tem permissão para remover este arquivo.')
                            return
                          }

                          // Show confirmation
                          if (window.confirm('Confirmar remoção deste arquivo?')) {
                            const result = await softDeleteActivityAttachment(file.id)
                            if (result.success) {
                              // Remove from local state immediately
                              setAttachments(prev => prev.filter(f => f.id !== file.id))
                              toast.success('Arquivo removido com sucesso')
                            } else {
                              toast.error(result.error || 'Falha ao remover arquivo')
                            }
                          }
                        }}
                        className="text-text-secondary hover:text-text-primary text-sm"
                        title="Excluir"
                      >
                        <Icons.Trash2 className="w-4 h-4 text-text-secondary hover:text-text-primary"/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* GoogleSyncModal */}
        {showTimeConfirm && (
          <GoogleSyncModal
            isOpen
            activityTitle={a.title || a.description}
            activityDate={a.activity_date}
            onConfirm={time => { setShowTimeConfirm(false); handleSyncToGoogleCalendar(time) }}
            onClose={() => setShowTimeConfirm(false)}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border-tertiary">
          <div className="flex gap-2">
            <Button
              variant={a.status === 'concluida' ? 'secondary' : 'green'}
              size="sm"
              onClick={handleToggle}
              disabled={update.isPending}
            >
              {a.status === 'concluida' ? '↩ Reabrir' : '✓ Concluir'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>✏ Editar</Button>
            {isConnected && a.status !== 'concluida' && !a.google_event_id && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => a.activity_time ? handleSyncToGoogleCalendar(a.activity_time) : setShowTimeConfirm(true)}
                disabled={syncing}
              >
                <Icons.Calendar className="w-3.5 h-3.5" />
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
            )}
            {a.google_event_id && (
              <a
                href={`https://calendar.google.com/calendar/r/eventedit/${a.google_event_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
              >
                <Icons.Calendar className="w-3.5 h-3.5 text-green-600" />
                Sincronizado
              </a>
            )}
          </div>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={remove.isPending}>Excluir</Button>
        </div>
      </div>

      {/* Image preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-lg" />
          </div>
        </div>
      )}
    </div>
  )
}
