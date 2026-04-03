import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useClientMutations } from '../../hooks/useClients'
import { useStages } from '../../hooks/useStages'
import { useCatalog } from '../../hooks/useCatalog'
import { useProfiles } from '../../hooks/useProfiles'

const EMPTY = {
  name: '', cnpj: '', segment: '', csm_id: '', stage_id: '',
  abc_class: '', mrr: '', licencas: '', valor_lic: '',
  contract_start: '', contract_renewal: '', app_code: '', url_donc: '',
  onb_start: '', golive: '', delay_days: 0,
}

export function ClientForm({ client, onClose }) {
  const [form, setForm] = useState(client ? {
    ...EMPTY, ...client,
    csm_id: client.csm_id || '',
    stage_id: client.stage_id || '',
  } : EMPTY)
  const [selectedCatalog, setSelectedCatalog] = useState(
    client?.client_catalog?.map(cc => cc.catalog_item_id) || []
  )

  const { create, update } = useClientMutations()
  const { data: stages = [] } = useStages()
  const { data: catalog = [] } = useCatalog()
  const { data: profiles = [] } = useProfiles()

  const isEdit = !!client

  function handleChange(e) {
    const { name, value, type } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }))
  }

  function toggleCatalog(id) {
    setSelectedCatalog(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      csm_id: form.csm_id || null,
      stage_id: form.stage_id ? Number(form.stage_id) : null,
      mrr: Number(form.mrr) || 0,
      licencas: Number(form.licencas) || 0,
      valor_lic: Number(form.valor_lic) || 0,
      contract_start: form.contract_start || null,
      contract_renewal: form.contract_renewal || null,
      onb_start: form.onb_start || null,
      golive: form.golive || null,
      catalogItems: selectedCatalog,
    }
    if (isEdit) {
      await update.mutateAsync({ id: client.id, ...payload })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  const csms = profiles.filter(p => p.role === 'csm' || p.role === 'manager')
  const servicos = catalog.filter(c => c.type === 'servico')
  const solucoes = catalog.filter(c => c.type === 'solucao')
  const isMutating = create.isPending || update.isPending

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Cliente' : 'Novo Cliente'} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label-sm">Nome *</label>
            <input name="name" value={form.name} onChange={handleChange} required className="input-base w-full" placeholder="Nome do cliente" />
          </div>
          <div>
            <label className="label-sm">CNPJ</label>
            <input name="cnpj" value={form.cnpj} onChange={handleChange} className="input-base w-full" placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="label-sm">Segmento</label>
            <input name="segment" value={form.segment} onChange={handleChange} className="input-base w-full" placeholder="Ex: Logística" />
          </div>
          <div>
            <label className="label-sm">CSM</label>
            <select name="csm_id" value={form.csm_id} onChange={handleChange} className="input-base w-full">
              <option value="">Sem CSM</option>
              {csms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Estágio</label>
            <select name="stage_id" value={form.stage_id} onChange={handleChange} className="input-base w-full">
              <option value="">Sem estágio</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Classificação ABC</label>
            <select name="abc_class" value={form.abc_class} onChange={handleChange} className="input-base w-full">
              <option value="">—</option>
              <option>A</option><option>B</option><option>C</option>
            </select>
          </div>
          <div>
            <label className="label-sm">MRR (R$)</label>
            <input name="mrr" type="number" value={form.mrr} onChange={handleChange} className="input-base w-full" min="0" />
          </div>
          <div>
            <label className="label-sm">Licenças</label>
            <input name="licencas" type="number" value={form.licencas} onChange={handleChange} className="input-base w-full" min="0" />
          </div>
          <div>
            <label className="label-sm">Valor/Licença</label>
            <input name="valor_lic" type="number" value={form.valor_lic} onChange={handleChange} className="input-base w-full" min="0" />
          </div>
          <div>
            <label className="label-sm">Início Contrato</label>
            <input name="contract_start" type="date" value={form.contract_start} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Renovação</label>
            <input name="contract_renewal" type="date" value={form.contract_renewal} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">App Code</label>
            <input name="app_code" value={form.app_code} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">URL donc</label>
            <input name="url_donc" value={form.url_donc} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Início Onboarding</label>
            <input name="onb_start" type="date" value={form.onb_start} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Go Live</label>
            <input name="golive" type="date" value={form.golive} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Dias em Atraso</label>
            <input name="delay_days" type="number" value={form.delay_days} onChange={handleChange} className="input-base w-full" min="0" />
          </div>
        </div>

        {/* Catalog */}
        {(servicos.length > 0 || solucoes.length > 0) && (
          <div>
            <label className="label-sm block mb-2">Serviços e Soluções</label>
            <div className="space-y-2">
              {[{ label: 'Serviços', items: servicos }, { label: 'Soluções', items: solucoes }].map(({ label, items }) => (
                <div key={label}>
                  <p className="text-xs text-text-tertiary mb-1">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(item => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => toggleCatalog(item.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selectedCatalog.includes(item.id)
                            ? 'text-white border-transparent'
                            : 'text-text-secondary border-border-secondary hover:border-text-tertiary'
                        }`}
                        style={selectedCatalog.includes(item.id) ? { backgroundColor: item.color, borderColor: item.color } : {}}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isMutating}>{isMutating ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Cliente'}</Button>
        </div>
      </form>
    </Modal>
  )
}
