import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Calendar } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useActivityMutations } from '../../hooks/useActivities'
import { useClients } from '../../hooks/useClients'
import { useProfiles } from '../../hooks/useProfiles'
import { useContacts } from '../../hooks/useContacts'
import { useGoogleCalendarStatus } from '../../hooks/useGoogleCalendarStatus'
import { useSessionToken } from '../../hooks/useSessionToken'
import AttachmentInput from '../activityAttachments/AttachmentInput'
import { saveActivityAttachments } from '../../services/activityAttachments/saveActivityAttachments'
import { getActivityAttachments } from '../../services/activityAttachments/getActivityAttachments'
import toast from 'react-hot-toast'

const EDGE_FUNCTION_URL = 'https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/google-calendar-event'

const TYPES = [
  { value: 'reuniao', label: 'Reunião' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tarefa', label: 'Tarefa' },
  { value: 'nota', label: 'Nota' },
]

const TODAY = new Date().toISOString().split('T')[0]

export function ActivityModal({ onClose, activity, defaultClientId }) {
  const isEdit = !!activity
  const [form, setForm] = useState({
    type: activity?.type || 'reuniao',
    title: activity?.title || '',
    description: activity?.description || '',
    client_id: activity?.client_id || defaultClientId || '',
    contact_id: activity?.contact_id || '',
    responsible_id: activity?.responsible_id || '',
    activity_date: activity?.activity_date || TODAY,
    activity_time: activity?.activity_time || '',
    status: activity?.status || 'pendente',
    due_date: activity?.due_date || '',
    notes: activity?.notes || '',
  })
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [existingAttachments, setExistingAttachments] = useState([])
  const [showDrawer, setShowDrawer] = useState(false)

  const { create, update } = useActivityMutations()
  const { data: clients = [] } = useClients()
  const { data: profiles = [] } = useProfiles()
  const { data: contacts = [] } = useContacts(form.client_id ? { client_id: Number(form.client_id) } : {})
  const { isConnected: isGoogleConnected } = useGoogleCalendarStatus()
  const token = useSessionToken()
  const [syncToGoogle, setSyncToGoogle] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    async function loadExistingAttachments() {
      if (!activity?.id) return
      const result = await getActivityAttachments(activity.id)
      if (result.success) setExistingAttachments(result.data)
    }
    loadExistingAttachments()
  }, [activity?.id])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      activity_time: form.activity_time?.trim() ? form.activity_time : null,
      client_id: form.client_id ? Number(form.client_id) : null,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      responsible_id: form.responsible_id || null,
    }

    let activityResult

    if (isEdit) {
      activityResult = await update.mutateAsync({ id: activity.id, ...payload })
    } else {
      activityResult = await create.mutateAsync(payload)
    }

    if (!isEdit && syncToGoogle && form.activity_time && token) {
      let activityId
      if (Array.isArray(activityResult)) {
        activityId = activityResult[0]?.id
      } else if (activityResult?.data?.id) {
        activityId = activityResult.data.id
      } else if (activityResult?.id) {
        activityId = activityResult.id
      }

      if (activityId) {
        setSyncing(true)
        try {
          const [h, m] = form.activity_time.split(':')
          const startISO = new Date(`${form.activity_date}T${h}:${m}:00`).toISOString()

          const res = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              activity_id: activityId,
              title: form.title || form.description?.slice(0, 100) || 'Atividade',
              description: form.description,
              start_iso: startISO,
              duration_minutes: 50,
            }),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            toast.error(err.error || 'Erro ao sincronizar com Google Calendar')
          } else {
            toast.success('Atividade sincronizada com Google Calendar!')
          }
        } catch (err) {
          toast.error('Erro ao sincronizar com Google Calendar')
        } finally {
          setSyncing(false)
        }
      }
    }

    if (attachmentFiles.length > 0) {
      let activityId

      if (isEdit) {
        activityId = activity.id
      } else {
        if (Array.isArray(activityResult)) {
          activityId = activityResult[0]?.id
        } else if (activityResult?.data?.id) {
          activityId = activityResult.data.id
        } else if (activityResult?.id) {
          activityId = activityResult.id
        }
      }

      if (!activityId) {
        console.error('Erro: activityId não encontrado após criação', activityResult)
        return
      }

      await saveActivityAttachments({
        activityId,
        clientId: payload.client_id,
        userId: payload.responsible_id || activity?.responsible_id || null,
        files: attachmentFiles,
      })
    }

    onClose()
  }

  function handleFilesChange(files) {
    setAttachmentFiles(files)
  }

  const isMutating = create.isPending || update.isPending

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Editar Atividade' : 'Nova Atividade'}
      maxWidth={
        showDrawer
          ? 'w-[95vw] max-w-[980px] transition-all duration-[250ms] ease-in-out'
          : 'w-[90vw] max-w-[560px] transition-all duration-[250ms] ease-in-out'
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-row items-stretch">
          {/* Left Panel */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Rows 1–2: Tipo/Status + Data/Hora */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-sm">Tipo *</label>
                  <select name="type" value={form.type} onChange={handleChange} className="input-base w-full h-9">
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-sm">Status</label>
                  <select name="status" value={form.status} onChange={handleChange} className="input-base w-full h-9">
                    <option value="pendente">Pendente</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                <div>
                  <label className="label-sm">Data *</label>
                  <input name="activity_date" type="date" value={form.activity_date} onChange={handleChange} required className="input-base w-full h-9" />
                </div>
                <div className="flex flex-col items-center gap-1 pb-1">
                  {isGoogleConnected && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                      <input
                        type="checkbox"
                        checked={syncToGoogle}
                        onChange={e => {
                          setSyncToGoogle(e.target.checked)
                          if (e.target.checked && !form.activity_time) {
                            setForm(prev => ({ ...prev, activity_time: '' }))
                          }
                        }}
                        className="w-4 h-4 rounded border-border-tertiary text-blue-600 focus:ring-blue-500"
                      />
                      <Calendar className="w-3.5 h-3.5 text-text-tertiary group-hover:text-blue-600 transition-colors" />
                      <span className="text-[11px] text-text-tertiary group-hover:text-blue-600 transition-colors whitespace-nowrap">Google Calendar</span>
                    </label>
                  )}
                </div>
                <div>
                  <label className="label-sm">
                    Hora{syncToGoogle ? ' *' : ''}
                  </label>
                  <input
                    name="activity_time"
                    type="time"
                    value={form.activity_time}
                    onChange={handleChange}
                    required={syncToGoogle}
                    className="input-base w-full h-9"
                  />
                </div>
              </div>
            </div>

            {/* Título */}
            <div>
              <label className="label-sm">Título</label>
              <input name="title" value={form.title} onChange={handleChange} className="input-base w-full" placeholder="Título opcional" />
            </div>

            {/* Descrição */}
            <div>
              <label className="label-sm">Descrição *</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={5}
                className="input-base w-full resize-none"
                placeholder="Descreva a atividade..."
              />
            </div>

            {/* Section separator: Contexto */}
            <div className="border-t border-border-tertiary pt-1">
              <span className="text-[11px] uppercase tracking-wide text-text-tertiary font-medium">Contexto</span>
            </div>

            {/* Row 2: Cliente | Contato */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label-sm">Cliente *</label>
                <select name="client_id" value={form.client_id} onChange={handleChange} required className="input-base w-full h-9">
                  <option value="">Selecionar cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Contato</label>
                <select name="contact_id" value={form.contact_id} onChange={handleChange} className="input-base w-full h-9" disabled={!form.client_id}>
                  <option value="">Sem contato</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Row 3: Vencimento | Responsável */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label-sm">Vencimento</label>
                <input name="due_date" type="date" value={form.due_date} onChange={handleChange} className="input-base w-full h-9" />
              </div>
              <div>
                <label className="label-sm">Responsável</label>
                <select name="responsible_id" value={form.responsible_id} onChange={handleChange} className="input-base w-full h-9">
                  <option value="">Sem responsável</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {/* Card: Registrar resultado */}
            <button
              type="button"
              onClick={() => setShowDrawer(!showDrawer)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-bg-secondary border border-border-tertiary rounded-md hover:bg-bg-tertiary transition-colors text-left"
            >
              <svg className="w-4 h-4 text-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text-primary">Registrar resultado</div>
                <div className="text-[11px] text-text-tertiary">Notas e anexos da atividade</div>
              </div>
              {showDrawer
                ? <ChevronDown size={16} className="text-text-tertiary flex-shrink-0" />
                : <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />
              }
            </button>
          </div>

          {/* Divider */}
          {showDrawer && (
            <div className="w-px bg-border-tertiary flex-shrink-0 mx-4" />
          )}

          {/* Right Panel */}
          {showDrawer && (
            <div
              className="flex-1 min-w-0 space-y-4 overflow-y-auto"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            >
              {/* Section label */}
              <div>
                <span className="text-[11px] uppercase tracking-wide text-text-tertiary font-medium">Resultado</span>
              </div>

              {/* Notas */}
              <div>
                <label className="label-sm">Notas</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  className="input-base w-full resize-y"
                  style={{ minHeight: '250px', maxHeight: 'calc(100vh - 320px)' }}
                  placeholder="Resultado ou notas da atividade..."
                />
              </div>

              {/* Anexos */}
              <div>
                <label className="label-sm">Anexos</label>
                <p className="text-[11px] text-text-tertiary mb-2">Imagens, PDF e áudios</p>
                <AttachmentInput
                  onFilesChange={handleFilesChange}
                  existingFiles={existingAttachments}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isMutating || syncing}>
            {syncing ? 'Sincronizando...' : isMutating ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Atividade'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
