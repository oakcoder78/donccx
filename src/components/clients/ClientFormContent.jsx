import { useState, useEffect, useRef } from 'react'
import { Button } from '../ui/Button'
import { useClientMutations } from '@/hooks/useClients'
import { useStages } from '@/hooks/useStages'
import { useCatalog } from '@/hooks/useCatalog'
import { useProfiles } from '@/hooks/useProfiles'
import { useSegments, useSegmentsMutations } from '@/hooks/useSegments'
import { useModulePricing, useModulePricingMutations } from '@/hooks/useModulePricing'
import { supabase } from '@/lib/supabaseClient'
import { calculateUnitValue } from '@/lib/billing'
import { useContractCharges, useContractChargesMutations } from '@/hooks/useContractCharges'
import { useBillingOsTiers, useBillingOsTiersMutations } from '@/hooks/useBillingOsTiers'
import { ContractChargesSection } from './sections/ContractChargesSection'
import { OsTiersSection } from './sections/OsTiersSection'
import { EventuaisSection } from './sections/EventuaisSection'
import { validateRulesContiguous, validateOsTiers, expandRulesToCharges, getBaseTotal, calculateRuleTotal, formatBRL4 } from '@/lib/contractRules'
import { Icons } from '@/lib/icons'
import toast from 'react-hot-toast'

// New tab order: Dados → Endereço → Contrato → Operacional
export const TABS_V2 = ['Dados da Empresa', 'Endereço', 'Contrato', 'Operacional']

const EMPTY = {
  name: '', fantasy_name: '', cnpj: '', segment_id: '',
  unidades_total: '', unidades_donc: '',
  abc_class: '', csm_id: '', comercial_id: '', site: '', contract_active: true,
  logo_url: '',
  billing_type: 'por_licenca', billing_base_value: '',
  billing_floor: '', contract_signed_date: '', contract_start: '',
  contract_renewal: '', correction_index: '',
  stage_id: '',
  onb_start: '', golive: '', description: '',
  // labs additive fields (not persisted until migration; kept for UI preview)
  erp: '', ti_tipo: '',
  handover_contexto: '', handover_como_trabalha: '', handover_problemas: '',
  handover_impactos: '', handover_necessidades: '', handover_resultados: '',
  handover_criterios: '', handover_pessoas: '', handover_expectativas: '',
  handover_riscos: '', handover_motivo: '',
  billing_status: 'ativo', billing_suspended_until: '',
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

export function ClientFormContent({ client, onSuccess, onCancel }) {
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
          comercial_id: client.comercial_id || '',
          stage_id: client.stage_id || '',
          contract_active: client.contract_active !== false,
          lifecycle_stage: client.lifecycle_stage || 'lead',
          // map billing_status fallback to contract_active for legacy records
          billing_status: client.billing_status || (client.contract_active === false ? 'nao_bilhetavel' : 'ativo'),
          billing_suspended_until: client.billing_suspended_until || '',
          erp: client.erp || '',
          ti_tipo: client.ti_tipo || '',
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

  const [modPricing, setModPricing] = useState({})
  const [modErrors, setModErrors] = useState({})

  const { create, update } = useClientMutations()
  const { data: stages = [] } = useStages()
  const { data: catalog = [] } = useCatalog()
  const { data: profiles = [] } = useProfiles()
  const { data: segments = [] } = useSegments()
  const { create: createSegment } = useSegmentsMutations()
  const { data: existingModPricing = [] } = useModulePricing(client?.id)
  const { saveAll: saveModPricing } = useModulePricingMutations()
  const { data: existingCharges = [] } = useContractCharges(client?.id)
  const { mutateAsync: saveCharges } = useContractChargesMutations(client?.id)
  const { data: existingTiers = [] } = useBillingOsTiers(client?.id)
  const { mutateAsync: saveTiers } = useBillingOsTiersMutations(client?.id)

  const [contractN, setContractN] = useState(36)
  const [contractRules, setContractRules] = useState([])
  const [osTiers, setOsTiers] = useState([])
  const [eventuais, setEventuais] = useState([])
  const [motorOpen, setMotorOpen] = useState(true)
  const [modOpen, setModOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

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

  // Initialize contract rules from existingCharges (group consecutive same mode/value)
  useEffect(() => {
    if (existingCharges.length > 0 && contractRules.length === 0) {
      const sorted = [...existingCharges].filter(c => c.kind === 'recorrencia').sort((a,b) => a.month_index - b.month_index)
      if (sorted.length > 0) {
        const rules = []
        let cur = { from: sorted[0].month_index, to: sorted[0].month_index, mode: sorted[0].mode, value: String(sorted[0].mode === 'percent' ? sorted[0].percent : sorted[0].amount) }
        for (let i = 1; i < sorted.length; i++) {
          const c = sorted[i]
          const val = String(c.mode === 'percent' ? c.percent : c.amount)
          if (c.mode === cur.mode && val === cur.value && c.month_index === cur.to + 1) {
            cur.to = c.month_index
          } else {
            rules.push(cur)
            cur = { from: c.month_index, to: c.month_index, mode: c.mode, value: val }
          }
        }
        rules.push(cur)
        setContractRules(rules)
        const maxM = Math.max(...sorted.map(c => c.month_index))
        if (maxM > contractN) setContractN(maxM)
      }
    }
  }, [existingCharges])

  useEffect(() => {
    if (existingTiers.length > 0 && osTiers.length === 0) {
      setOsTiers(existingTiers.map(t => ({ tier_order: t.tier_order, limit_to: t.limit_to, fixed_value: Number(t.fixed_value), excess_unit_price: Number(t.excess_unit_price) })))
    }
  }, [existingTiers])

  useEffect(() => {
    if (existingCharges.length > 0 && eventuais.length === 0) {
      // group implantacao charges by installment_group
      const impl = existingCharges.filter(c => c.kind === 'implantacao')
      if (impl.length > 0) {
        const groups = {}
        impl.forEach(c => {
          const g = c.installment_group || c.id
          if (!groups[g]) groups[g] = { label: c.label || 'Implantação', total: 0, installments: 0, group: g }
          groups[g].total += Number(c.amount) || 0
          groups[g].installments += 1
        })
        setEventuais(Object.values(groups).map(g => ({ label: g.label, total: String(g.total), installments: g.installments, _group: g.group })))
      }
    }
  }, [existingCharges])

  const csms = profiles.filter(p => p.role === 'csm' || p.role === 'manager')
  const comercials = profiles.filter(p => (p.role === 'sales' || p.role === 'manager' || p.role === 'admin') && p.status === 'active')
  const servicos = catalog.filter(c => c.type === 'servico')
  const solucoes = catalog.filter(c => c.type === 'solucao')
  const isMutating = create.isPending || update.isPending

  const activeModList = Object.entries(modPricing)
    .filter(([, v]) => v.active)
    .map(([, v]) => ({ additional_value: Number(v.value) || 0 }))
  // Rateio mode: base * floor = total, mods are distribution of total (not additive)
  const basePerLic = Number(form.billing_base_value) || 0
  const floor = Number(form.billing_floor) || 0
  const baseTotal = floor > 0 ? basePerLic * floor : basePerLic
  const unitValue = calculateUnitValue(basePerLic, activeModList, { mode: 'rateio' })
  const mrrMinimo = baseTotal
  const sumMods = activeModList.reduce((s, m) => s + (m.additional_value || 0), 0)
  const rateioOk = activeModList.length === 0 ? true : Math.abs(sumMods - baseTotal) <= 0.01
  const rateioDiff = Math.abs(sumMods - baseTotal)

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

    if (form.lifecycle_stage === 'cliente') {
      const hasActiveSolutions = Object.values(modPricing).some(v => v.active)
      if (selectedCatalog.length === 0 && !hasActiveSolutions) {
        toast.error('Clientes devem possuir ao menos um serviço ou solução selecionado.')
        return
      }
    }

    if (form.billing_status === 'suspenso' && !form.billing_suspended_until) {
      toast.error('Informe a data "Suspenso até" quando o status for Suspenso.')
      setActiveTab(2)
      return
    }

    if (contractRules.length > 0) {
      const v = validateRulesContiguous(contractRules, contractN)
      if (!v.ok) { toast.error(v.error); setActiveTab(2); return }
      // confirm values outside contract (total > base)
      const baseTotal = getBaseTotal(form.billing_base_value, form.billing_floor)
      if (baseTotal > 0) {
        const exceeding = contractRules.filter(r => {
          const calc = calculateRuleTotal(r, baseTotal)
          return calc != null && calc > baseTotal
        })
        if (exceeding.length > 0) {
          const details = exceeding.map(r => {
            const calc = calculateRuleTotal(r, baseTotal)
            const shown = r.mode === 'percent' ? `${r.value}% → ${formatBRL4(calc)}` : formatBRL4(calc)
            return `${r.from}..${r.to}: ${shown} > base ${formatBRL4(baseTotal)}`
          }).join('; ')
          if (!window.confirm(`Valores fora do contrato (maior que base total): ${details}. Confirmar lançamento?`)) return
        }
      }
    }
    if (form.billing_type === 'por_os' && osTiers.length > 0) {
      const v2 = validateOsTiers(osTiers)
      if (!v2.ok) { toast.error(v2.error); setActiveTab(2); return }
    }

    let logoUrl = form.logo_url
    if (logoFile) {
      setUploadingLogo(true)
      try { logoUrl = await uploadLogo(logoFile) }
      catch { toast.error('Erro ao fazer upload do logo'); setUploadingLogo(false); return }
      setUploadingLogo(false)
    }

    const solucaoIdSet = new Set(solucoes.map(s => s.id))
    const servicesInCatalog = selectedCatalog
      .filter(id => !solucaoIdSet.has(id))
      .map(id => ({ catalog_item_id: id, status: 'implantado' }))
    const activeModItems = Object.entries(modPricing)
      .filter(([, v]) => v.active)
      .map(([id, v]) => ({ catalog_item_id: Number(id), status: v.status || 'implantado' }))
    const catalogItems = [...new Map(
      [...servicesInCatalog, ...activeModItems].map(i => [i.catalog_item_id, i])
    ).values()]

    // Labs additive fields (erp, ti_tipo, billing_status) are included only if columns exist.
    // We attempt to persist them; if DB rejects unknown column, fallback without them.
    const basePayload = {
      name: form.name,
      fantasy_name: form.fantasy_name || null,
      cnpj: form.cnpj || null,
      segment_id: form.segment_id ? Number(form.segment_id) : null,
      logo_url: logoUrl || null,
      unidades_total: form.unidades_total !== '' ? Number(form.unidades_total) : 0,
      unidades_donc: form.unidades_donc !== '' ? Number(form.unidades_donc) : 0,
      abc_class: form.abc_class || null,
      csm_id: form.csm_id || null,
      comercial_id: form.comercial_id || null,
      site: form.site || null,
      contract_active: form.billing_status === 'ativo',
      billing_type: form.billing_type,
      billing_base_value: form.billing_base_value !== '' ? Number(form.billing_base_value) : 0,
      billing_floor: form.billing_floor !== '' ? Number(form.billing_floor) : 0,
      contract_signed_date: form.contract_signed_date || null,
      contract_start: form.contract_start || null,
      contract_renewal: form.contract_renewal || null,
      correction_index: form.correction_index || null,
      mrr: mrrMinimo,
      stage_id: form.stage_id ? Number(form.stage_id) : null,
      onb_start: form.onb_start || null,
      golive: form.golive || null,
      description: form.description || form.handover_contexto || null,
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

    // Try with labs columns (billing_status, erp, ti_tipo) if migration already applied
    const labsPayload = {
      ...basePayload,
      billing_status: form.billing_status || 'ativo',
      billing_suspended_until: form.billing_suspended_until || null,
      erp: form.erp || null,
      ti_tipo: form.ti_tipo || null,
    }

    let clientId
    let usedLabsCols = true
    try {
      if (isEdit) {
        await update.mutateAsync({ id: client.id, ...labsPayload })
        clientId = client.id
      } else {
        const created = await create.mutateAsync(labsPayload)
        clientId = created.id
      }
    } catch (err) {
      const msg = String(err?.message || '')
      // fallback: column does not exist yet (migration not pushed) → retry without labs cols
      if (msg.includes('billing_status') || msg.includes('billing_suspended_until') || msg.includes('erp') || msg.includes('ti_tipo')) {
        usedLabsCols = false
        if (isEdit) {
          await update.mutateAsync({ id: client.id, ...basePayload })
          clientId = client.id
        } else {
          const created = await create.mutateAsync(basePayload)
          clientId = created.id
        }
        toast('Campos labs (billing_status/ERP/TI) ainda não migrados — salvos no modo compatibilidade.', { icon: '⚠️' })
      } else {
        throw err
      }
    }

    const items = Object.entries(modPricing)
      .filter(([, v]) => v.active)
      .map(([id, v]) => ({
        client_id: clientId,
        catalog_item_id: Number(id),
        additional_value: Number(v.value) || 0,
      }))
    await saveModPricing.mutateAsync({ clientId, items })

    // Persist contract motor (best-effort, non-blocking if tables not yet migrated)
    // Build combined charges: recorrencia (expand rules) + implantacao (expand eventuais)
    const recorrenciaCharges = contractRules.length > 0 ? (() => { try { return expandRulesToCharges(contractRules, contractN) } catch { return [] } })() : []
    const implantacaoCharges = []
    eventuais.forEach(ev => {
      const total = Number(ev.total) || 0
      const inst = Math.max(1, Number(ev.installments) || 1)
      const per = total / inst
      const group = ev._group || crypto.randomUUID()
      for (let i = 0; i < inst; i++) {
        implantacaoCharges.push({ month_index: i + 1, kind: 'implantacao', mode: 'absolute', amount: Number(per.toFixed(2)), label: ev.label || 'Implantação', installment_group: group, installments_total: inst })
      }
    })
    const allCharges = [...recorrenciaCharges, ...implantacaoCharges]
    if (allCharges.length > 0) {
      try { await saveCharges({ charges: allCharges }) } catch (e) { toast.error(`Contrato: ${e.message}`) }
    } else if (existingCharges.length > 0) {
      try { await saveCharges({ charges: [] }) } catch (_) {}
    }
    if (form.billing_type === 'por_os' && osTiers.length > 0) {
      try { await saveTiers({ tiers: osTiers }) } catch (e) { toast.error(e.message) }
    } else if (existingTiers.length > 0 && osTiers.length === 0) {
      try { await saveTiers({ tiers: [] }) } catch (_) {}
    }

    // Persist handover to client_handovers table if migration exists (best-effort, non-blocking)
    if (form.handover_contexto || form.handover_problemas || form.handover_pessoas) {
      try {
        const answers = {
          contexto: form.handover_contexto || '',
          como_trabalha: form.handover_como_trabalha || '',
          problemas: form.handover_problemas || '',
          impactos: form.handover_impactos || '',
          necessidades: form.handover_necessidades || '',
          resultados_esperados: form.handover_resultados || '',
          criterios_sucesso: form.handover_criterios || '',
          pessoas: form.handover_pessoas || '',
          expectativas: form.handover_expectativas || '',
          riscos: form.handover_riscos || '',
          motivo_compra: form.handover_motivo || '',
        }
        // Only persist if any field filled
        const hasAny = Object.values(answers).some(v => v.trim())
        if (hasAny) {
          const { error: handoverErr } = await supabase
            .from('client_handovers')
            .upsert({ client_id: clientId, answers, template_version: 'v1', updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
          if (handoverErr && !String(handoverErr.message).includes('does not exist')) throw handoverErr
        }
      } catch (_) {
        // silent: handover table may not exist yet in labs without migration
      }
    }

    if (!usedLabsCols) {
      // keep behavior: still consider success
    }

    onSuccess?.(clientId)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-border-tertiary mb-5 -mt-1 overflow-x-auto">
        {TABS_V2.map((t, i) => (
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

      {/* ── ABA 0: Dados da Empresa ── */}
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
              <label className="label-sm">CSM Responsável</label>
              <select name="csm_id" value={form.csm_id} onChange={handleChange} className="input-base w-full">
                <option value="">Sem CSM</option>
                {csms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-sm">Comercial responsável</label>
              <select name="comercial_id" value={form.comercial_id} onChange={handleChange} className="input-base w-full">
                <option value="">Sem Comercial</option>
                {comercials.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-[11px] text-text-tertiary mt-0.5">Titularidade comercial (dual ownership)</p>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <button
                type="button"
                onClick={() => set('contract_active', !form.contract_active)}
                className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.contract_active ? 'bg-donc-lime' : 'bg-border-secondary'}`}
              >
                <span className={`block w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${form.contract_active ? 'translate-x-4' : ''}`} />
              </button>
              <span className="text-sm text-text-secondary">Contrato ativo <span className="text-[11px] text-text-tertiary">(legado — espelha billing_status)</span></span>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 1: Endereço (nova posição 2) ── */}
      {activeTab === 1 && (
        <div className="space-y-4">
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
            <div className="col-span-2">
              <label className="label-sm">Site</label>
              <input name="site" value={form.site} onChange={handleChange} className="input-base w-full" placeholder="https://" />
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 2: Contrato (nova posição 3) ── */}
      {activeTab === 2 && (
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
              <input name="billing_base_value" type="number" value={form.billing_base_value} onChange={handleChange} className="input-base w-full" min="0" step="0.0001" placeholder="—" />
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

          {/* Billing status 3 states — labs preview */}
          <div className="border border-border-tertiary rounded-lg p-3 space-y-2">
            <label className="label-sm block">Status de bilhetagem</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: 'ativo', l: 'Ativo', c: 'bg-donc-verde text-white border-donc-verde' },
                { v: 'suspenso', l: 'Suspenso', c: 'bg-amber-500 text-white border-amber-500' },
                { v: 'nao_bilhetavel', l: 'Não bilhetável', c: 'bg-border-secondary text-text-tertiary border-border-secondary' },
              ].map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => set('billing_status', opt.v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.billing_status === opt.v ? opt.c : 'bg-white text-text-secondary border-border-tertiary hover:bg-bg-secondary'}`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            {form.billing_status === 'suspenso' && (
              <div>
                <label className="label-sm">Suspenso até *</label>
                <input name="billing_suspended_until" type="date" value={form.billing_suspended_until} onChange={handleChange} className="input-base w-48" />
                <p className="text-[11px] text-text-tertiary mt-1">MRR zerado até esta data; reativa automaticamente após.</p>
              </div>
            )}
          </div>

          <div className="bg-donc-navy rounded-lg p-4 text-white flex items-center justify-between">
            <div>
              <p className="text-xs text-white/60 mb-0.5">MRR Total do contrato</p>
              <p className="text-xl font-bold">{fmtBRL(baseTotal)}</p>
              <p className="text-xs text-white/70">{floor > 0 ? `${floor} × ${fmtBRL(basePerLic)} / licença` : `${fmtBRL(basePerLic)} / licença`}</p>
            </div>
            <div className="flex items-center gap-2">
              {!rateioOk && activeModList.length > 0 && (
                <span className="text-xs bg-donc-red/20 border border-donc-red/30 rounded px-2 py-1 text-white">
                  Rateio diverge {fmtBRL(sumMods)} vs {fmtBRL(baseTotal)} (Δ {fmtBRL(rateioDiff)})
                </span>
              )}
              <button type="button" onClick={() => setHelpOpen(!helpOpen)} className="p-1.5 rounded hover:bg-white/10 border border-white/20" title="Ajuda contrato">
                <Icons.HelpCircle size={16} className="text-white/80" />
              </button>
            </div>
          </div>
          {helpOpen && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 space-y-1">
              <p><b>Base total:</b> piso × valor base (ex: 40 × R$100 = R$4.000).</p>
              <p><b>Regras:</b> valor <b>total no mês</b> (absoluto) ou <b>% do base total</b>. Ex: 1..5 R$2.500, 6..10 80% → R$3.200.</p>
              <p><b>Eventuais:</b> implantação parcelada (ex: R$15.000 em 3×) gera 3 parcelas em <code>contract_charges</code>.</p>
              <p><b>Fora do contrato:</b> regra &gt; base total pede confirmação.</p>
              <p><b>Modificadores:</b> distribuição do total entre módulos (rateio, não soma). Ex: 4000 = Mod A 2500 + Mod B 1500.</p>
            </div>
          )}

          {/* Motor de contrato colapsável — acima dos modificadores */}
          <div className="border border-border-tertiary rounded-lg overflow-hidden">
            <button type="button" onClick={() => setMotorOpen(!motorOpen)} className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-secondary hover:bg-bg-tertiary transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">Motor de contrato</span>
                <span className="text-xs text-text-tertiary hidden sm:inline">eventuais + recorrência + faixas OS</span>
                {!motorOpen && (
                  <span className="text-xs bg-white border border-border-tertiary rounded px-1.5 py-0.5">
                    {eventuais.length} eventuais · {contractRules.length} regras · {osTiers.length} tiers
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary">{motorOpen ? 'Recolher' : 'Expandir'}</span>
                <Icons.ChevronDown size={16} className={`transition-transform text-text-tertiary ${motorOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {motorOpen && (
              <div className="p-3 space-y-3 bg-white">
                <EventuaisSection eventuais={eventuais} setEventuais={setEventuais} />
                <ContractChargesSection N={contractN} setN={setContractN} rules={contractRules} setRules={setContractRules} billingBaseValue={form.billing_base_value} billingFloor={form.billing_floor} billingType={form.billing_type} />
                <OsTiersSection billingType={form.billing_type} tiers={osTiers} setTiers={setOsTiers} />
              </div>
            )}
          </div>

          {/* Modificadores por módulo — colapsável */}
          {solucoes.length > 0 && (
            <div className="border border-border-tertiary rounded-lg overflow-hidden">
              <button type="button" onClick={() => setModOpen(!modOpen)} className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-secondary hover:bg-bg-tertiary transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">Rateio por módulo</span>
                  <span className="text-xs text-text-tertiary hidden sm:inline">distribuição do total (ex: 4000 = 2500 + 1500)</span>
                  {!modOpen && Object.values(modPricing).filter(v=>v.active).length > 0 && (
                    <span className={`text-xs rounded px-1.5 py-0.5 border ${rateioOk ? 'bg-donc-verde/10 text-donc-verde border-donc-verde/20' : 'bg-donc-red/10 text-donc-red border-donc-red/20'}`}>
                      {Object.values(modPricing).filter(v=>v.active).length} ativos · {fmtBRL(sumMods)} {rateioOk ? '✓' : `Δ ${fmtBRL(rateioDiff)}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span onClick={(e)=>{e.stopPropagation(); toggleAll()}} className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary">
                    <span className={`w-7 h-4 rounded-full transition-colors flex-shrink-0 ${allActive ? 'bg-donc-lime' : 'bg-border-secondary'}`}>
                      <span className={`block w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${allActive ? 'translate-x-3' : ''}`} style={{ marginTop: '3px', marginLeft: '3px' }} />
                    </span>
                    {allActive ? 'Desabilitar' : 'Habilitar todos'}
                  </span>
                  <Icons.ChevronDown size={16} className={`transition-transform text-text-tertiary ${modOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {modOpen && (
                <div className="p-3 space-y-2 bg-white">
                  <p className="text-xs text-text-tertiary">Distribua o total <b>{fmtBRL(baseTotal)}</b> entre os módulos. Ex: 4000 = 2500 + 1500. Soma deve fechar no total (rateio).</p>
                  {solucoes.map(sol => {
                    const mp = modPricing[sol.id] || { active: false, value: '' }
                    const pct = baseTotal > 0 && mp.value ? ((Number(mp.value) / baseTotal) * 100).toFixed(1) : null
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-text-tertiary">R$</span>
                            <input
                              type="number"
                              value={mp.value}
                              onChange={e => setModValue(sol.id, e.target.value)}
                              disabled={!mp.active}
                              placeholder={mp.active ? '2500' : '—'}
                              className={`input-base w-28 text-right disabled:opacity-40 ${modErrors[sol.id] ? 'border-red-400' : ''}`}
                              min="0" step="0.01"
                            />
                            {mp.active && pct && <span className="text-xs text-text-tertiary whitespace-nowrap">{pct}%</span>}
                          </div>
                        </div>
                        {modErrors[sol.id] && (
                          <p className="text-xs text-red-500 mt-1 ml-12">{modErrors[sol.id]}</p>
                        )}
                      </div>
                    )
                  })}
                  <div className={`text-xs rounded px-2 py-1.5 border ${rateioOk ? 'bg-donc-verde/10 border-donc-verde/20 text-donc-verde' : 'bg-donc-red/10 border-donc-red/20 text-donc-red'}`}>
                    Soma rateio: <b>{fmtBRL(sumMods)}</b> {rateioOk ? '✓ fecha em ' : '≠ divergente de '} {fmtBRL(baseTotal)} {rateioOk ? '' : ` (Δ ${fmtBRL(rateioDiff)})`}
                    {!rateioOk && activeModList.length > 0 && <span className="ml-2">Ajuste os valores para fechar no total.</span>}
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
      )}

      {/* ── ABA 3: Operacional (nova posição 4) ── */}
      {activeTab === 3 && (
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
              <label className="label-sm">Total de unidades/lojas da rede <span className="text-text-tertiary font-normal">(potencial expansão)</span></label>
              <input name="unidades_total" type="number" value={form.unidades_total} onChange={handleChange} className="input-base w-full" min="0" placeholder="—" />
            </div>
            <div>
              <label className="label-sm">Unidades previstas para início do projeto</label>
              <input name="unidades_donc" type="number" value={form.unidades_donc} onChange={handleChange} className="input-base w-full" min="0" placeholder="—" />
            </div>
            <div>
              <label className="label-sm">Classificação ABC</label>
              <select name="abc_class" value={form.abc_class} onChange={handleChange} className="input-base w-full">
                <option value="">—</option>
                <option>A</option><option>B</option><option>C</option>
              </select>
            </div>
            <div>
              <label className="label-sm">ERP (informativo)</label>
              <input name="erp" value={form.erp} onChange={handleChange} className="input-base w-full" placeholder="Ex: SAP, TOTVS, Senior" />
            </div>
            <div>
              <label className="label-sm">Equipe de TI</label>
              <select name="ti_tipo" value={form.ti_tipo} onChange={handleChange} className="input-base w-full">
                <option value="">— Selecionar —</option>
                <option value="interna">Interna</option>
                <option value="terceirizada">Terceirizada</option>
                <option value="hibrida">Híbrida</option>
                <option value="nao_possui">Não possui</option>
              </select>
            </div>

          </div>

          {(servicos.length > 0 || solucoes.length > 0) && (
            <div>
              <label className="label-sm block mb-2">Serviços e Soluções</label>
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

          {/* Handover 10 perguntas — labs preview */}
          <div className="border border-border-tertiary rounded-lg overflow-hidden">
            <div className="bg-bg-secondary px-3 py-2 border-b border-border-tertiary">
              <p className="text-sm font-medium text-text-primary">Handoff Comercial → Onboarding</p>
              <p className="text-xs text-text-tertiary">10 perguntas — template como brief. Obrigatório quando Tipo = Cliente. Migrará <code>description</code> → <code>contexto</code>.</p>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <label className="label-sm">Contexto</label>
                <textarea name="handover_contexto" value={form.handover_contexto} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Contexto geral..." />
              </div>
              <div>
                <label className="label-sm">Como o cliente trabalha hoje?</label>
                <textarea name="handover_como_trabalha" value={form.handover_como_trabalha} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Situação atual, processos, ferramentas, volume..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Problemas</label>
                  <textarea name="handover_problemas" value={form.handover_problemas} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Quais problemas quer resolver?" />
                </div>
                <div>
                  <label className="label-sm">Impactos</label>
                  <textarea name="handover_impactos" value={form.handover_impactos} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Consequências..." />
                </div>
                <div>
                  <label className="label-sm">Necessidades</label>
                  <textarea name="handover_necessidades" value={form.handover_necessidades} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="O que precisa que a solução resolva?" />
                </div>
                <div>
                  <label className="label-sm">Resultados esperados</label>
                  <textarea name="handover_resultados" value={form.handover_resultados} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Resultados concretos..." />
                </div>
                <div>
                  <label className="label-sm">Critérios de sucesso</label>
                  <textarea name="handover_criterios" value={form.handover_criterios} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Como saberemos que foi bem-sucedido?" />
                </div>
                <div>
                  <label className="label-sm">Pessoas</label>
                  <textarea name="handover_pessoas" value={form.handover_pessoas} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Envolvidos, usuários, decisores..." />
                </div>
                <div>
                  <label className="label-sm">Expectativas</label>
                  <textarea name="handover_expectativas" value={form.handover_expectativas} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Expectativas/compromissos da venda..." />
                </div>
                <div>
                  <label className="label-sm">Riscos</label>
                  <textarea name="handover_riscos" value={form.handover_riscos} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Riscos, resistências..." />
                </div>
              </div>
              <div>
                <label className="label-sm">Motivo da compra</label>
                <textarea name="handover_motivo" value={form.handover_motivo} onChange={handleChange} rows={2} className="input-base w-full resize-none" placeholder="Por que escolheu nossa solução?" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border-tertiary mt-4">
        <div className="flex gap-1">
          {TABS_V2.map((_, i) => (
            <button key={i} type="button" onClick={() => setActiveTab(i)}
              className={`w-2 h-2 rounded-full transition-colors ${activeTab === i ? 'bg-donc-navy' : 'bg-border-secondary'}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
          {activeTab > 0 && (
            <Button type="button" variant="secondary" onClick={() => setActiveTab(t => t - 1)}>← Anterior</Button>
          )}
          {activeTab < TABS_V2.length - 1 && (
            <Button type="button" onClick={() => {
              if (activeTab === 2) {
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
  )
}
