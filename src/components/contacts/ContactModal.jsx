import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useContactMutations } from '../../hooks/useContacts'
import { useClients } from '../../hooks/useClients'

const EMPTY = { name: '', cargo: '', email: '', linkedin: '', notes: '' }

const STATUS_OPTIONS = [
  { value: 'Alto',  label: '🟢 Alto'  },
  { value: 'Médio', label: '🟡 Médio' },
  { value: 'Baixo', label: '🔴 Baixo' },
]

export function ContactModal({ contact, onClose, defaultClientId }) {
  const isEdit = !!contact
  const [form, setForm] = useState(contact ? { ...EMPTY, ...contact } : EMPTY)
  const [phones, setPhones] = useState(contact?.contact_phones || [{ number: '', type: 'WhatsApp' }])
  const [links, setLinks] = useState(
    contact?.contact_links?.map(l => ({
      client_id: Number(l.client_id),
      papel: l.papel,
      engajamento: l.engajamento || 'Alto',
      champion: l.champion,
    })) ||
    (defaultClientId != null ? [{ client_id: Number(defaultClientId), papel: 'Usuário', engajamento: 'Alto', champion: false }] : [])
  )

  const { create, update } = useContactMutations()
  const { data: clients = [] } = useClients()

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function addPhone() { setPhones(p => [...p, { number: '', type: 'WhatsApp' }]) }
  function removePhone(i) { setPhones(p => p.filter((_,idx) => idx !== i)) }
  function setPhone(i, k, v) { setPhones(p => p.map((ph, idx) => idx === i ? { ...ph, [k]: v } : ph)) }

  function addLink() { setLinks(l => [...l, { client_id: '', papel: 'Usuário', engajamento: 'Alto', champion: false }]) }
  function removeLink(i) { setLinks(l => l.filter((_,idx) => idx !== i)) }
  function setLink(i, k, v) { setLinks(l => l.map((lk, idx) => idx === i ? { ...lk, [k]: v } : lk)) }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      phones: phones.filter(p => p.number.trim()),
      links: links.filter(l => l.client_id != null && l.client_id !== '').map(l => ({ ...l, client_id: Number(l.client_id) })),
    }
    if (isEdit) await update.mutateAsync({ id: contact.id, ...payload })
    else await create.mutateAsync(payload)
    onClose()
  }

  const isMutating = create.isPending || update.isPending

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Contato' : 'Novo Contato'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label-sm">Nome *</label>
            <input name="name" value={form.name} onChange={handleChange} required className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Cargo</label>
            <input name="cargo" value={form.cargo} onChange={handleChange} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">E-mail</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} className="input-base w-full" />
          </div>
          <div className="col-span-2">
            <label className="label-sm">LinkedIn</label>
            <input name="linkedin" value={form.linkedin} onChange={handleChange} className="input-base w-full" placeholder="URL do perfil" />
          </div>
        </div>

        {/* Phones */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-sm">Telefones</label>
            <button type="button" onClick={addPhone} className="text-xs text-donc-sky hover:underline">+ Adicionar</button>
          </div>
          <div className="space-y-2">
            {phones.map((ph, i) => (
              <div key={i} className="flex gap-2">
                <input value={ph.number} onChange={e => setPhone(i, 'number', e.target.value)}
                  placeholder="(00) 00000-0000" className="input-base flex-1" />
                <select value={ph.type} onChange={e => setPhone(i, 'type', e.target.value)} className="input-base w-28">
                  <option>WhatsApp</option><option>Celular</option><option>Fixo</option>
                </select>
                <button type="button" onClick={() => removePhone(i)} className="text-donc-red text-sm px-1">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Links com Empresas */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-sm">Vínculos com Empresas</label>
            <button type="button" onClick={addLink} className="text-xs text-donc-sky hover:underline">+ Adicionar</button>
          </div>
          <div className="space-y-2">
            {links.map((lk, i) => (
              <div key={i} className="flex gap-2 items-center flex-wrap">
                <select value={lk.client_id} onChange={e => setLink(i, 'client_id', e.target.value)} className="input-base flex-1 min-w-[140px]">
                  <option value="">Empresa</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={lk.papel} onChange={e => setLink(i, 'papel', e.target.value)} className="input-base w-32">
                  <option>Decisor</option>
                  <option>Influenciador</option>
                  <option>Usuário</option>
                  <option>Técnico</option>
                </select>
                <select value={lk.engajamento} onChange={e => setLink(i, 'engajamento', e.target.value)} className="input-base w-28">
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={lk.champion} onChange={e => setLink(i, 'champion', e.target.checked)} className="accent-donc-amber" />
                  ⭐
                </label>
                <button type="button" onClick={() => removeLink(i)} className="text-donc-red text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label-sm">Notas</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} className="input-base w-full resize-none" />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isMutating}>{isMutating ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Contato'}</Button>
        </div>
      </form>
    </Modal>
  )
}
