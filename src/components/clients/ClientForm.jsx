import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useClientMutations } from '../../hooks/useClients'
import { useStages } from '../../hooks/useStages'
import { useCatalog } from '../../hooks/useCatalog'
import { useProfiles } from '../../hooks/useProfiles'
import { useSegments, useSegmentsMutations } from '../../hooks/useSegments'
import { useModulePricing, useModulePricingMutations } from '../../hooks/useModulePricing'
import { supabase } from '../../lib/supabaseClient'
import { calculateUnitValue } from '../../lib/billing'
import toast from 'react-hot-toast'

const TABS = ['Dados da Empresa', 'Contrato', 'Operacional', 'Endereço']

const EMPTY = {
  name: '', fantasy_name: '', cnpj: '', segment_id: '',
  unidades_total: '', unidades_donc: '',
  abc_class: '', csm_id: '', site: '', contract_active: true,
  logo_url: '',
  billing_type: 'por_licenca', billing_base_value: '',
  billing_floor: '', contract_signed_date: '', contract_start: '',
  contract_renewal: '', correction_index: '',
  stage_id: '', app_code: '', url_donc: '',
  onb_start: '', golive: '', description: '',
  address_cep: '', address_street: '', address_number: '',
  address_complement: '', address_neighborhood: '',
  address_city: '', address_state: '',
  lifecycle_stage: 'lead',
}

function maskCNPJ(v) {
  v = v.replace(/\D/g, '').slice(0, 14)
  return v
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function maskCEP(v) {
  v = v.replace(/\D/g, '').slice(0, 8)
  return v.replace(/^(\d{5})(\d)/, '$1-$2')
}

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ClientForm({ client, onClose }) {
  const isEdit = !!client
  const [activeTab, setActiveTab] = useState(0)
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          ...EMPTY,
          ...client,
          unidades_total: client.unidades_total ?? '',
          unidades_donc: client.unidades_donc ?? '',
          billing_base_value: client.billing_base_value ?? '',
          billing_floor: client.billing_floor ?? '',
          segment_id: client.segment_id || '',
          csm_id: client.csm_id || '',
          stage_id: client.stage_id || '',
          contract_active: client.contract_active !== false,
          lifecycle_stage: client.lifecycle_stage || 'lead',
        }
      : EMPTY
  )
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(client?.logo_url || null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoRef = useRef()

  const [addingSegment, setAddingSegment] = useState(false)
  const [newSegName, setNewSegName] = useState('')

  const [selectedCatalog, setSelectedCatalog] = useState(
    client?.client_catalog?.map(cc => cc.catalog_item_id) || []
  )

  // { [catalog_item_id]: { active: bool, value: string } }
  const [modPricing, setModPricing] = useState({})
  const [modErrors, setModErrors] = useState({}) // { [id]: string }

  const { create, update } = useClientMutations()
  const { data: stages = [] } = useStages()
  const { data: catalog = [] } = useCatalog()
  const { data: profiles = [] } = useProfiles()
  const { data: segments = [] } = useSegments()
  const { create: createSegment } = useSegmentsMutations()
  const { data: existingModPricing = [] } = useModulePricing(client?.id)
  const { saveAll: saveModPricing } = useModulePricingMutations()

  useEffect(() => {
    if (existingModPricing.length > 0) {
      const init = {}
      existingModPricing.forEach(mp => {
        const catalogEntry = client?.client_catalog?.find(cc => cc.catalog_item_id === mp.catalog_item_id)
        init[mp.catalog_item_id] = {
          active: true,
          value: mp.additional_value != null ? String(mp.additional_value) : '',
          status: catalogEntry?.status || 'implantado',
        }
      })
      setModPricing(init)
    }
  }, [existingModPricing.length])

  const csms = profiles.filter(p => p.role === 'csm' || p.role === 'manager')
  const servicos = catalog.filter(c => c.type === 'servico')
  const solucoes = catalog.filter(c => c.type === 'solucao')
  const isMutating = create.isPending || update.isPending

  // MRR real-time
  const activeModList = Object.entries(modPricing)
    .filter(([, v]) => v.active)
    .map(([, v]) => ({ additional_value: Number(v.value) || 0 }))
  const unitValue = calculateUnitValue(Number(form.billing_base_value) || 0, activeModList)
  const floor = Number(form.billing_floor) || 0
  const mrrMinimo = floor * unitValue

  // Toggle habilitar todos os módulos
  const allActive = solucoes.length > 0 && solucoes.every(s => modPricing[s.id]?.active)
  function toggleAll() {
    if (allActive) {
      const next = {}
      solucoes.forEach(s => {
        next[s.id] = { active: false, value: modPricing[s.id]?.value || '', status: modPricing[s.id]?.status || 'implantado' }
      })
      setModPricing(prev => ({ ...prev, ...next }))
    } else {
      const next = {}
      solucoes.forEach(s => {
        next[s.id] = { active: true, value: modPricing[s.id]?.value || '', status: modPricing[s.id]?.status || 'implantado' }
      })
      setModPricing(prev => ({ ...prev, ...next }))
    }
  }

  function set(name, value) {
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    if (type === 'checkbox') { set(name, checked); return }
    if (name === 'cnpj') { set('cnpj', maskCNPJ(value)); return }
    if (name === 'address_cep') { set('address_cep', maskCEP(value)); return }
    set(name, value)
  }

  async function fetchCEP(cep) {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          address_street: data.logradouro || prev.address_street,
          address_neighborhood: data.bairro || prev.address_neighborhood,
          address_city: data.localidade || prev.address_city,
          address_state: data.uf || prev.address_state,
        }))
      }
    } catch (_) {}
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo(file) {
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('company-logos').upload(path, file)
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(path)
    return publicUrl
  }

  async function handleAddSegment() {
    if (!newSegName.trim()) return
    const seg = await createSegment.mutateAsync(newSegName.trim())
    set('segment_id', String(seg.id))
    setNewSegName('')
    setAddingSegment(false)
  }

  function toggleCatalog(id) {
    setSelectedCatalog(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleMod(itemId) {
    setModPricing(prev => {
      const cur = prev[itemId] || { active: false, value: '', status: 'implantado' }
      return { ...prev, [itemId]: { ...cur, active: !cur.active, status: cur.status || 'implantado' } }
    })
    setModErrors(prev => ({ ...prev, [itemId]: undefined }))
  }

  function setModValue(itemId, value) {
    setModPricing(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], active: prev[itemId]?.active ?? false, value },
    }))
    setModErrors(prev => ({ ...prev, [itemId]: undefined }))
  }

  function setModStatus(itemId, status) {
    setModPricing(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], status },
    }))
  }

  function validateMods() {
    const errs = {}
    solucoes.forEach(sol => {
      const mp = modPricing[sol.id]
      if (mp?.active) {
        if (mp.value === '' || isNaN(Number(mp.value))) {
          errs[sol.id] = 'Informe um valor válido'
        }
      }
    })
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (form.lifecycle_stage === 'cliente' && selectedCatalog.length === 0) {
      toast.error('Clientes devem possuir ao menos um serviço selecionado.')
      return
    }

    let logoUrl = form.logo_url
    if (logoFile) {
      setUploadingLogo(true)
      try { logoUrl = await uploadLogo(logoFile) }
      catch { toast.error('Erro ao fazer upload do logo'); setUploadingLogo(false); return }
      setUploadingLogo(false)
    }

    // Soluções em client_catalog derivam do modPricing (fonte da verdade = Contrato)
    const solucaoIdSet = new Set(solucoes.map(s => s.id))
    const servicesInCatalog = selectedCatalog
      .filter(id => !solucaoIdSet.has(id))
      .map(id => ({ catalog_item_id: id, status: 'implantado' }))
    const activeModItems = Object.entries(modPricing)
      .filter(([, v]) => v.active)
      .map(([id, v]) => ({ catalog_item_id: Number(id), status: v.status || 'implantado' }))
    const catalogItems = [...servicesInCatalog, ...activeModItems]

    const payload = {
      name: form.name,
      fantasy_name: form.fantasy_name || null,
      cnpj: form.cnpj || null,
      segment_id: form.segment_id ? Number(form.segment_id) : null,
      logo_url: logoUrl || null,
      unidades_total: form.unidades_total !== '' ? Number(form.unidades_total) : 0,
      unidades_donc: form.unidades_donc !== '' ? Number(form.unidades_donc) : 0,
      abc_class: form.abc_class || null,
      csm_id: form.csm_id || null,
      site: form.site || null,
      contract_active: form.contract_active,
      billing_type: form.billing_type,
      billing_base_value: form.billing_base_value !== '' ? Number(form.billing_base_value) : 0,
      billing_floor: form.billing_floor !== '' ? Number(form.billing_floor) : 0,
      contract_signed_date: form.contract_signed_date || null,
      contract_start: form.contract_start || null,
      contract_renewal: form.contract_renewal || null,
      correction_index: form.correction_index || null,
      mrr: mrrMinimo,
      stage_id: form.stage_id ? Number(form.stage_id) : null,
      app_code: form.app_code || null,
      url_donc: form.url_donc || null,
      onb_start: form.onb_start || null,
      golive: form.golive || null,
      description: form.description || null,
      address_cep: form.address_cep || null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      address_neighborhood: form.address_neighborhood || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
      lifecycle_stage: form.lifecycle_stage || 'lead',
      catalogItems,
    }

    let clientId
    if (isEdit) {
      await update.mutateAsync({ id: client.id, ...payload })
      clientId = client.id
    } else {
      const created = await create.mutateAsync(payload)
      clientId = created.id
    }

    const items = Object.entries(modPricing)
      .filter(([, v]) => v.active)
      .map(([id, v]) => ({
        client_id: clientId,
        catalog_item_id: Number(id),
        additional_value: Number(v.value) || 0,
      }))
    await saveModPricing.mutateAsync({ clientId, items })

    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Empresa' : 'Nova Empresa'} maxWidth="max-w-3xl">
      {/* Tab bar */}
      <div className="flex border-b border-border-tertiary mb-5 -mt-1">
        {TABS.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === i
                ? 'text-donc-navy border-donc-navy'
                : 'text-text-tertiary border-transparent hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── ABA 1: Dados da Empresa ── */}
        {activeTab === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div
                className="w-24 h-24 rounded-full overflow-hidden bg-bg-secondary border-2 border-dashed border-border-secondary flex items-center justify-center cursor-pointer hover:border-donc-sky transition-colors flex-shrink-0"
                onClick={() => logoRef.current?.click()}
              >
                {logoPreview
                  ? <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                  : <span className="text-text-tertiary text-xs text-center px-2">+ Logo</span>
                }
              </div>
              <div>
                <p className="text-sm text-text-secondary font-medium">Logo da empresa</p>
                <p className="text-xs text-text-tertiary mb-1">PNG, JPG ou SVG · Exibição circular</p>
                <button type="button" onClick={() => logoRef.current?.click()} className="text-xs text-donc-sky hover:underline">
                  {logoPreview ? 'Trocar imagem' : 'Selecionar imagem'}
                </button>
              </div>
              <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleLogoChange} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label-sm">Razão Social *</label>
                <input name="name" value={form.name} onChange={handleChange} required className="input-base w-full" placeholder="Razão social" />
              </div>
              <div>
                <label className="label-sm">Nome Fantasia</label>
                <input name="fantasy_name" value={form.fantasy_name} onChange={handleChange} className="input-base w-full" placeholder="Nome fantasia (opcional)" />
              </div>
              <div>
                <label className="label-sm">Tipo de empresa</label>
                <select name="lifecycle_stage" value={form.lifecycle_stage} onChange={handleChange} className="input-base w-full">
                  <option value="lead">Lead</option>
                  <option value="prospect">Prospect</option>
                  <option value="cliente">Cliente</option>
                  <option value="parceiro">Parceiro</option>
                  <option value="teste">Conta teste</option>
                </select>
              </div>
              <div>
                <label className="label-sm">CNPJ</label>
                <input name="cnpj" value={form.cnpj} onChange={handleChange} className="input-base w-full" placeholder="00.000.000/0000-00" />
              </div>
              <div>
                {!addingSegment ? (
                  <>
                    <label className="label-sm">Segmento</label>
                    <select
                      name="segment_id"
                      value={form.segment_id}
                      onChange={e => {
                        if (e.target.value === '__new__') { setAddingSegment(true) }
                        else { set('segment_id', e.target.value) }
                      }}
                      className="input-base w-full"
                    >
                      <option value="">— Selecionar —</option>
                      {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      <option value="__new__">+ Novo segmento</option>
                    </select>
                  </>
                ) : (
                  <>
                    <label className="label-sm">Novo Segmento</label>
                    <div className="flex gap-1">
                      <input value={newSegName} onChange={e => setNewSegName(e.target.value)} className="input-base flex-1" placeholder="Nome do segmento" autoFocus />
                      <button type="button" onClick={handleAddSegment} className="px-2 py-1 bg-donc-navy text-white text-xs rounded-md">OK</button>
                      <button type="button" onClick={() => setAddingSegment(false)} className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary">✕</button>
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="label-sm">Total de unidades/lojas</label>
                <input name="unidades_total" type="number" value={form.unidades_total} onChange={handleChange} className="input-base w-full" min="0" placeholder="—" />
              </div>
              <div>
                <label className="label-sm">Classificação ABC</label>
                <select name="abc_class" value={form.abc_class} onChange={handleChange} className="input-base w-full">
                  <option value="">—</option>
                  <option>A</option><option>B</option><option>C</option>
                </select>
              </div>
              <div>
                <label className="label-sm">CSM Responsável</label>
                <select name="csm_id" value={form.csm_id} onChange={handleChange} className="input-base w-full">
                  <option value="">Sem CSM</option>
                  {csms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Site</label>
                <input name="site" value={form.site} onChange={handleChange} className="input-base w-full" placeholder="https://" />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <button
                  type="button"
                  onClick={() => set('contract_active', !form.contract_active)}
                  className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.contract_active ? 'bg-donc-lime' : 'bg-border-secondary'}`}
                >
                  <span className={`block w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${form.contract_active ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-text-secondary">Contrato ativo</span>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA 2: Contrato ── */}
        {activeTab === 1 && (
          <div className="space-y-4">
            <div>
              <label className="label-sm block mb-2">Tipo de cobrança</label>
              <div className="flex gap-4">
                {[{ v: 'por_licenca', l: 'Por licença ativa (usuários)' }, { v: 'por_os', l: 'Por OS criada' }].map(opt => (
                  <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="billing_type" value={opt.v} checked={form.billing_type === opt.v} onChange={handleChange} />
                    <span className="text-sm text-text-secondary">{opt.l}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Valor base (R$ / {form.billing_type === 'por_os' ? 'OS' : 'licença'})</label>
                <input name="billing_base_value" type="number" value={form.billing_base_value} onChange={handleChange} className="input-base w-full" min="0" step="0.01" placeholder="—" />
              </div>
              <div>
                <label className="label-sm">Piso contratual (unidades mínimas)</label>
                <input name="billing_floor" type="number" value={form.billing_floor} onChange={handleChange} className="input-base w-full" min="0" placeholder="—" />
              </div>
              <div>
                <label className="label-sm">Data de assinatura</label>
                <input name="contract_signed_date" type="date" value={form.contract_signed_date} onChange={handleChange} className="input-base w-full" />
              </div>
              <div>
                <label className="label-sm">Início do contrato</label>
                <input name="contract_start" type="date" value={form.contract_start} onChange={handleChange} className="input-base w-full" />
              </div>
              <div>
                <label className="label-sm">Renovação</label>
                <input name="contract_renewal" type="date" value={form.contract_renewal} onChange={handleChange} className="input-base w-full" />
              </div>
              <div>
                <label className="label-sm">Índice de correção</label>
                <input name="correction_index" value={form.correction_index} onChange={handleChange} className="input-base w-full" placeholder="Ex: IPCA, IGP-M" />
              </div>
            </div>

            <div className="bg-bg-secondary rounded-lg p-3 border border-border-tertiary">
              <p className="text-xs text-text-tertiary mb-0.5">MRR mínimo garantido (piso × valor unitário)</p>
              <p className="text-lg font-bold text-donc-navy">{fmtBRL(mrrMinimo)}</p>
            </div>

            {/* Modificadores por módulo */}
            {solucoes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label-sm">Modificadores por módulo (R$ adicional / unidade)</label>
                  {/* Toggle habilitar todos */}
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <span className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${allActive ? 'bg-donc-lime' : 'bg-border-secondary'}`}>
                      <span className={`block w-2.5 h-2.5 bg-white rounded-full shadow mt-0.75 mx-0.75 transition-transform ${allActive ? 'translate-x-4' : ''}`} style={{ marginTop: '3px' }} />
                    </span>
                    <span>{allActive ? 'Desabilitar todos' : 'Habilitar todos'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {solucoes.map(sol => {
                    const mp = modPricing[sol.id] || { active: false, value: '' }
                    return (
                      <div key={sol.id} className="py-2 border-b border-border-tertiary last:border-0">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleMod(sol.id)}
                            className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${mp.active ? 'bg-donc-lime' : 'bg-border-secondary'}`}
                          >
                            <span className={`block w-3 h-3 bg-white rounded-full shadow mx-1 transition-transform ${mp.active ? 'translate-x-4' : ''}`} />
                          </button>
                          <span className="flex items-center gap-1.5 flex-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sol.color }} />
                            <span className="text-sm text-text-primary">{sol.name}</span>
                          </span>
                          {mp.active && (
                            <select
                              value={mp.status || 'implantado'}
                              onChange={e => setModStatus(sol.id, e.target.value)}
                              className="input-base text-xs py-0.5 px-2 h-7"
                            >
                              <option value="implantado">Implantado</option>
                              <option value="em_implantacao">Em implantação</option>
                              <option value="pausado">Pausado</option>
                              <option value="abandonado">Abandonado</option>
                              <option value="descontinuado">Descontinuado</option>
                            </select>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-text-tertiary">R$</span>
                            <input
                              type="number"
                              value={mp.value}
                              onChange={e => setModValue(sol.id, e.target.value)}
                              disabled={!mp.active}
                              placeholder={mp.active ? 'Valor' : '—'}
                              className={`input-base w-24 text-right disabled:opacity-40 ${modErrors[sol.id] ? 'border-red-400' : ''}`}
                              min="0" step="0.01"
                            />
                          </div>
                        </div>
                        {modErrors[sol.id] && (
                          <p className="text-xs text-red-500 mt-1 ml-12">{modErrors[sol.id]}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-donc-navy/5 rounded-lg p-3 border border-donc-navy/20">
              <p className="text-xs text-text-tertiary mb-0.5">Valor unitário com módulos</p>
              <p className="text-sm font-semibold text-text-primary">
                {fmtBRL(unitValue)} / {form.billing_type === 'por_os' ? 'OS' : 'licença'}
                {floor > 0 && <span className="text-text-tertiary font-normal"> · MRR total: {fmtBRL(mrrMinimo)}</span>}
              </p>
            </div>
          </div>
        )}

        {/* ── ABA 3: Operacional ── */}
        {activeTab === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Estágio</label>
                <select name="stage_id" value={form.stage_id} onChange={handleChange} className="input-base w-full">
                  <option value="">Sem estágio</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">App Code</label>
                <input name="app_code" value={form.app_code} onChange={handleChange} className="input-base w-full" />
              </div>
              <div className="col-span-2">
                <label className="label-sm">URL Donc</label>
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
              {/* Unidades na Donc — movido para cá */}
              <div>
                <label className="label-sm">Unidades na Donc</label>
                <input
                  name="unidades_donc"
                  type="number"
                  value={form.unidades_donc}
                  onChange={handleChange}
                  className="input-base w-full"
                  min="0"
                  placeholder="—"
                />
              </div>
            </div>

            {/* Catálogo chips */}
            {(servicos.length > 0 || solucoes.length > 0) && (
              <div>
                <label className="label-sm block mb-2">Serviços e Soluções</label>

                {/* Serviços — editáveis */}
                {servicos.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-text-tertiary mb-1">Serviços</p>
                    <div className="flex flex-wrap gap-1.5">
                      {servicos.map(item => (
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
                )}

                {/* Soluções — read-only, derivadas da aba Contrato */}
                {solucoes.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-text-tertiary mb-1">
                      Soluções <span className="text-text-tertiary/60">(gerenciadas na aba Contrato)</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {solucoes.map(item => {
                        const active = modPricing[item.id]?.active
                        return (
                          <span
                            key={item.id}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                              active
                                ? 'text-white border-transparent'
                                : 'text-text-tertiary border-border-tertiary opacity-40'
                            }`}
                            style={active ? { backgroundColor: item.color, borderColor: item.color } : {}}
                          >
                            {item.name}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label-sm">Descrição do Projeto</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="input-base w-full resize-none"
                placeholder="Contexto, objetivos, observações..."
              />
            </div>
          </div>
        )}

        {/* ── ABA 4: Endereço ── */}
        {activeTab === 3 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label-sm">CEP</label>
              <input
                name="address_cep"
                value={form.address_cep}
                onChange={handleChange}
                onBlur={e => fetchCEP(e.target.value)}
                className="input-base w-48"
                placeholder="00000-000"
              />
            </div>
            <div className="col-span-2">
              <label className="label-sm">Logradouro</label>
              <input name="address_street" value={form.address_street} onChange={handleChange} className="input-base w-full" />
            </div>
            <div>
              <label className="label-sm">Número</label>
              <input name="address_number" value={form.address_number} onChange={handleChange} className="input-base w-full" />
            </div>
            <div>
              <label className="label-sm">Complemento</label>
              <input name="address_complement" value={form.address_complement} onChange={handleChange} className="input-base w-full" />
            </div>
            <div>
              <label className="label-sm">Bairro</label>
              <input name="address_neighborhood" value={form.address_neighborhood} onChange={handleChange} className="input-base w-full" />
            </div>
            <div>
              <label className="label-sm">Cidade</label>
              <input name="address_city" value={form.address_city} onChange={handleChange} className="input-base w-full" />
            </div>
            <div>
              <label className="label-sm">UF</label>
              <input name="address_state" value={form.address_state} onChange={handleChange} className="input-base w-24" maxLength={2} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border-tertiary mt-4">
          <div className="flex gap-1">
            {TABS.map((_, i) => (
              <button key={i} type="button" onClick={() => setActiveTab(i)}
                className={`w-2 h-2 rounded-full transition-colors ${activeTab === i ? 'bg-donc-navy' : 'bg-border-secondary'}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            {activeTab > 0 && (
              <Button type="button" variant="secondary" onClick={() => setActiveTab(t => t - 1)}>← Anterior</Button>
            )}
            {activeTab < TABS.length - 1 && (
              <Button type="button" onClick={() => {
                if (activeTab === 1) {
                  const errs = validateMods()
                  if (Object.keys(errs).length > 0) {
                    setModErrors(errs)
                    return
                  }
                }
                setActiveTab(t => t + 1)
              }}>Próximo →</Button>
            )}
            <Button type="submit" disabled={isMutating || uploadingLogo}>
              {isMutating || uploadingLogo ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Empresa'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
