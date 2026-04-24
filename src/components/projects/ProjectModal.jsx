import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useProfiles } from '../../hooks/useProfiles'
import { useClients } from '../../hooks/useClients'
import { useCapabilityTypes, useCreateOnboardingFlow, useCreateInternalProject } from '../../hooks/useOnboardings'

const TYPES = [
  { key: 'onboarding', label: 'Onboarding', desc: 'Implantação inicial da plataforma' },
  { key: 'expansao',   label: 'Expansão',   desc: 'Expansão de operações ou módulos'  },
  { key: 'interno',    label: 'Interno',    desc: 'Projeto interno sem onboarding'    },
]

const EMPTY_FORM = {
  title: '', description: '', csm_id: '', responsible_id: '',
  start_date: '', end_date: '', notes: '', status: 'em_andamento',
  selectedClientId: '',
}

export function ProjectModal({ isOpen, onClose, clientId }) {
  const isGlobal = !clientId

  const [type, setType]   = useState('onboarding')
  const [form, setForm]   = useState(EMPTY_FORM)
  const [caps, setCaps]   = useState([])

  const { data: profiles = [] }       = useProfiles()
  const { data: clients  = [] }       = useClients({}, { enabled: isGlobal })
  const { data: capTypes = [] }       = useCapabilityTypes()
  const createOnboardingFlow          = useCreateOnboardingFlow()
  const createInternalProject         = useCreateInternalProject()

  const isPending = createOnboardingFlow.isPending || createInternalProject.isPending

  function reset() {
    setType('onboarding')
    setForm(EMPTY_FORM)
    setCaps([])
  }

  function handleClose() { reset(); onClose() }

  function toggleCap(id) {
    setCaps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const resolvedClientId = clientId || (form.selectedClientId ? parseInt(form.selectedClientId, 10) : null)
  const canSubmit = form.title.trim() && (!isGlobal || resolvedClientId)

  async function handleSubmit() {
    if (!canSubmit || isPending) return

    if (type === 'interno') {
      await createInternalProject.mutateAsync({
        clientId:       resolvedClientId,
        title:          form.title.trim(),
        description:    form.description || undefined,
        responsible_id: form.responsible_id || undefined,
        start_date:     form.start_date || undefined,
        end_date:       form.end_date   || undefined,
        status:         form.status,
      })
    } else {
      await createOnboardingFlow.mutateAsync({
        clientId:   resolvedClientId,
        type,
        title:      form.title.trim(),
        csm_id:     form.csm_id    || undefined,
        start_date: form.start_date || undefined,
        notes:      form.notes     || undefined,
        capabilities: caps,
      })
    }
    handleClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Novo Projeto" maxWidth="max-w-lg">
      <div className="space-y-4">

        {/* Type selector */}
        <div>
          <label className="label-sm">Tipo de projeto</label>
          <div className="flex gap-2 mt-1">
            {TYPES.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                  type === t.key
                    ? 'bg-donc-sky text-white border-donc-sky'
                    : 'border-border-tertiary text-text-secondary hover:border-donc-sky hover:text-donc-sky'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            {TYPES.find(t => t.key === type)?.desc}
          </p>
        </div>

        {/* Empresa picker — global mode only */}
        {isGlobal && (
          <div>
            <label className="label-sm">Empresa *</label>
            <select
              value={form.selectedClientId}
              onChange={e => setForm(p => ({ ...p, selectedClientId: e.target.value }))}
              className="input-base w-full"
            >
              <option value="">— Selecionar empresa —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.fantasy_name || c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="label-sm">
            {type === 'interno' ? 'Título *' : 'Nome do onboarding *'}
          </label>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="input-base w-full"
            placeholder={type === 'interno' ? 'Nome do projeto' : 'Ex: Onboarding Entrega SP'}
          />
        </div>

        {/* Interno fields */}
        {type === 'interno' && (
          <>
            <div>
              <label className="label-sm">Descrição</label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="input-base w-full resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="label-sm">Responsável</label>
              <select
                value={form.responsible_id}
                onChange={e => setForm(p => ({ ...p, responsible_id: e.target.value }))}
                className="input-base w-full"
              >
                <option value="">— Selecionar —</option>
                {profiles.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Data Início</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  className="input-base w-full"
                />
              </div>
              <div>
                <label className="label-sm">Data Fim</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                  className="input-base w-full"
                />
              </div>
            </div>
            <div>
              <label className="label-sm">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="input-base w-full"
              >
                <option value="planejado">Planejado</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluido">Concluído</option>
                <option value="suspenso">Suspenso</option>
              </select>
            </div>
          </>
        )}

        {/* Onboarding / Expansão fields */}
        {type !== 'interno' && (
          <>
            <div>
              <label className="label-sm">CSM Responsável</label>
              <select
                value={form.csm_id}
                onChange={e => setForm(p => ({ ...p, csm_id: e.target.value }))}
                className="input-base w-full"
              >
                <option value="">— Selecionar —</option>
                {profiles.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-sm">Data de início</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="input-base w-full"
              />
            </div>
            {capTypes.length > 0 && (
              <div>
                <label className="label-sm">Capacidades</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {capTypes.map(ct => (
                    <label key={ct.id} className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={caps.includes(ct.id)}
                        onChange={() => toggleCap(ct.id)}
                        className="rounded accent-donc-sky"
                      />
                      {ct.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label-sm">Observações</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="input-base w-full resize-none"
                rows={2}
                placeholder="Contexto, escopo, observações iniciais..."
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? 'Criando...' : 'Criar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
