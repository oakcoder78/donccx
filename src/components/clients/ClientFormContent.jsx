import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/Button'
import { useClientMutations } from '@/hooks/useClients'
import { useStages } from '@/hooks/useStages'
import { useCatalog } from '@/hooks/useCatalog'
import { useProfiles } from '@/hooks/useProfiles'
import { useSegments, useSegmentsMutations } from '@/hooks/useSegments'
import { useModulePricing, useModulePricingMutations } from '@/hooks/useModulePricing'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { ClientSubAnexos } from './tabs/operacional/ClientSubAnexos'
import { saveActivityAttachments } from '@/services/activityAttachments/saveActivityAttachments'
import { calculateUnitValue } from '@/lib/billing'
import { useContractCharges, useContractChargesMutations, useContractSeries, useContractSeriesMutations } from '@/hooks/useContractCharges'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Modal } from '../ui/Modal'
import { useBillingOsTiers, useBillingOsTiersMutations } from '@/hooks/useBillingOsTiers'
import { ContractChargesSection } from './sections/ContractChargesSection'
import { OsTiersSection } from './sections/OsTiersSection'
import { EventuaisSection } from './sections/EventuaisSection'
import { FormSection } from './form/FormSection'
import { InfoHint } from './form/InfoHint'
import { validateRulesContiguous, validateOsTiers, expandRulesToCharges, expandEventuais, regroupRecorrencia, regroupEventuais, resolveMRR, renegWindows, billingEnd, getBaseTotal, formatBRL4 } from '@/lib/contractRules'
import toast from 'react-hot-toast'

// New tab order: Dados → Endereço → Contrato → Operacional → Anexos
export const TABS_V2 = ['Dados da Empresa', 'Endereço', 'Contrato', 'Operacional', 'Anexos']

const EMPTY = {
  name: '', fantasy_name: '', cnpj: '', segment_id: '',
  unidades_total: '', unidades_donc: '',
  abc_class: '', csm_id: '', comercial_id: '', site: '',
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
          // never feed null into a controlled input — coerce to '' (keeps booleans/numbers)
          ...Object.fromEntries(Object.entries(client).map(([k, v]) => [k, v == null ? '' : v])),
          unidades_total: client.unidades_total ?? '',
          unidades_donc: client.unidades_donc ?? '',
          billing_base_value: client.billing_base_value ?? '',
          billing_floor: client.billing_floor ?? '',
          segment_id: client.segment_id || '',
          csm_id: client.csm_id || '',
          comercial_id: client.comercial_id || '',
          stage_id: client.stage_id || '',
          lifecycle_stage: client.lifecycle_stage || 'lead',
          // legacy records without billing_status: derive from the deprecated contract_active flag
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

  const qc = useQueryClient()
  const { create, update } = useClientMutations()
  const { data: stages = [] } = useStages()
  const { data: catalog = [] } = useCatalog()
  const { data: profiles = [] } = useProfiles()
  const { data: segments = [] } = useSegments()
  const { create: createSegment } = useSegmentsMutations()
  const { data: existingModPricing = [] } = useModulePricing(client?.id)
  const { saveAll: saveModPricing } = useModulePricingMutations()
  const { data: existingCharges = [], isLoading: chargesLoading } = useContractCharges(client?.id)
  const { mutateAsync: saveCharges } = useContractChargesMutations(client?.id)
  const { data: existingSeries = [], isLoading: seriesLoading } = useContractSeries(client?.id)
  const { mutateAsync: saveSeries } = useContractSeriesMutations(client?.id)
  const { logAction } = useAuditLog()
  const { data: existingTiers = [] } = useBillingOsTiers(client?.id)
  const { mutateAsync: saveTiers } = useBillingOsTiersMutations(client?.id)

  // Buffer de edição da série ativa (regras/N/eventuais) — molde antigo preservado
  const [contractN, setContractN] = useState(36)
  const [contractRules, setContractRules] = useState([])
  const [osTiers, setOsTiers] = useState([])
  const [eventuais, setEventuais] = useState([])
  const [navError, setNavError] = useState('')
  // Séries contratuais: [{ id?, label, kind, billing_start, billing_end, due_day, auto_renew, status, reason, N, rules, eventuais }]
  const [seriesList, setSeriesList] = useState([])
  const [activeSeriesIdx, setActiveSeriesIdx] = useState(0)
  const [seriesReady, setSeriesReady] = useState(false)
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [encerrarReason, setEncerrarReason] = useState('')
  const { profile, effectiveRole } = useAuth()
  const [pendingFiles, setPendingFiles] = useState([])

  // Sales creating empresa: default comercial to self so RLS insert passes (carteira)
  useEffect(() => {
    if (!isEdit && profile?.id && effectiveRole === 'sales' && !form.comercial_id) {
      setForm(prev => (prev.comercial_id ? prev : { ...prev, comercial_id: profile.id }))
    }
  }, [profile?.id, effectiveRole, isEdit])

  // Initialize series (group charges by series_id) — buffer carrega a 1ª série
  useEffect(() => {
    if (seriesReady) return
    if (isEdit && (seriesLoading || chargesLoading)) return
    const bySeries = {}
    existingCharges.forEach(c => {
      const k = c.series_id || 'none'
      if (!bySeries[k]) bySeries[k] = []
      bySeries[k].push(c)
    })
    // mods: agrupa por série (linhas legadas sem série → original)
    const modsBySeries = {}
    existingModPricing.forEach(mp => {
      const k = mp.series_id || 'none'
      if (!modsBySeries[k]) modsBySeries[k] = []
      modsBySeries[k].push(mp)
    })
    const tiersBySeries = {}
    existingTiers.forEach(t => {
      const k = t.series_id || 'none'
      if (!tiersBySeries[k]) tiersBySeries[k] = []
      tiersBySeries[k].push(t)
    })
    const toMods = (list) => {
      const init = {}
      ;(list || []).forEach(mp => {
        const catalogEntry = client?.client_catalog?.find(cc => cc.catalog_item_id === mp.catalog_item_id)
        init[mp.catalog_item_id] = {
          active: true,
          value: mp.additional_value != null ? String(mp.additional_value) : '',
          status: catalogEntry?.status || 'implantado',
        }
      })
      return init
    }
    const toTiers = (list) => (list || []).map(t => ({
      tier_order: t.tier_order, limit_to: t.limit_to,
      fixed_value: Number(t.fixed_value), excess_unit_price: Number(t.excess_unit_price),
    }))
    let built = existingSeries.map(s => {
      const ch = bySeries[s.id] || []
      const { rules, N } = regroupRecorrencia(ch)
      const evs = regroupEventuais(ch)
      const maxEv = evs.reduce((m, e) => Math.max(m, (Number(e.startMonth) || 1) + (Number(e.installments) || 1) - 1), 0)
      return {
        ...s,
        billing_end: s.billing_end || '', reason: s.reason || '',
        endDirty: !!(s.billing_end || s.auto_renew),
        N: Math.max(N, maxEv, 1), rules, eventuais: evs,
        mods: toMods(modsBySeries[s.id] || []), tiers: toTiers(tiersBySeries[s.id] || []),
      }
    })
    // Órfãos (legado sem série) → série original
    const orphan = bySeries.none || []
    const orphanMods = modsBySeries.none || []
    const orphanTiers = tiersBySeries.none || []
    if ((orphan.length > 0 || orphanMods.length > 0 || orphanTiers.length > 0) && built.length > 0) {
      const oi = Math.max(0, built.findIndex(s => s.kind === 'original'))
      const { rules, N } = regroupRecorrencia(orphan.filter(c => c.kind === 'recorrencia'))
      const evs = regroupEventuais(orphan)
      built = built.map((s, i) => i === oi
        ? {
            ...s,
            rules: [...s.rules, ...rules], eventuais: [...s.eventuais, ...evs], N: Math.max(s.N, N),
            mods: { ...toMods(orphanMods), ...s.mods },
            tiers: [...s.tiers, ...toTiers(orphanTiers)],
          }
        : s)
    }
    if (built.length === 0) {
      const start = form.contract_start || new Date().toISOString().slice(0, 10)
      built = [{
        id: null, label: 'Contrato original', kind: 'original',
        billing_start: start, billing_end: '', endDirty: false,
        due_day: Number(String(start).slice(8, 10)) || 5,
        auto_renew: false, status: 'ativa', reason: '',
        billing_type: 'por_licenca', billing_base_value: '', billing_floor: '',
        contract_signed_date: '', contract_renewal: '', correction_index: '',
        billing_status: 'ativo', billing_suspended_until: '',
        N: 36, rules: [], eventuais: [], mods: {}, tiers: [],
      }]
    }
    // Original primeiro — buffer espelha a original (mirror de clients.*)
    built.sort((a, b) => (a.kind === 'original' ? -1 : b.kind === 'original' ? 1 : String(a.billing_start).localeCompare(String(b.billing_start))))
    setSeriesList(built)
    const first = built[0]
    setForm(prev => ({ ...prev, ...planFromForm(first) }))
    setContractN(first.N)
    setContractRules(first.rules || [])
    setEventuais(first.eventuais || [])
    setModPricing(first.mods || {})
    setOsTiers(first.tiers || [])
    setModErrors({})
    setActiveSeriesIdx(0)
    setSeriesReady(true)
  }, [seriesReady, isEdit, existingSeries, existingCharges, existingModPricing, existingTiers, seriesLoading, chargesLoading])



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

  const KIND_LABELS = { original: 'Contrato original', aditivo: 'Aditivo (novo módulo)', renegociacao: 'Renegociação (desconto temporário)' }
  // Campos do plano que vivem por série (buffer = form da série ativa)
  const PLAN_KEYS = ['billing_type', 'billing_base_value', 'billing_floor', 'contract_signed_date', 'contract_renewal', 'correction_index', 'billing_status', 'billing_suspended_until']
  const activeSeries = seriesList[activeSeriesIdx] || null
  const activeReadOnly = activeSeries?.status === 'encerrada'

  function planFromForm(f) {
    return Object.fromEntries(PLAN_KEYS.map(k => [k, f[k]]))
  }
  function seriesWithBuffer() {
    return seriesList.map((s, i) => (i === activeSeriesIdx
      ? { ...s, ...planFromForm(form), N: contractN, rules: contractRules, eventuais, mods: modPricing, tiers: osTiers }
      : s))
  }
  function switchSeries(next) {
    if (next === activeSeriesIdx || !seriesList[next]) return
    const flushed = seriesWithBuffer()
    setSeriesList(flushed)
    const t = flushed[next]
    setForm(prev => ({ ...prev, ...planFromForm(t) }))
    setContractN(t.N)
    setContractRules(t.rules || [])
    setEventuais(t.eventuais || [])
    setModPricing(t.mods || {})
    setOsTiers(t.tiers || [])
    setModErrors({})
    setNavError('')
    setActiveSeriesIdx(next)
  }
  function updateSeriesMeta(patch) {
    setSeriesList(prev => prev.map((s, i) => {
      if (i !== activeSeriesIdx) return s
      const next = { ...s, ...patch }
      if (patch.billing_start && !('due_day' in patch)) {
        const d = Number(String(patch.billing_start).slice(8, 10))
        if (d >= 1 && d <= 31) next.due_day = d
      }
      return next
    }))
  }
  function addSeries() {
    const hasOriginal = seriesList.some(s => s.kind === 'original')
    const today = new Date().toISOString().slice(0, 10)
    const draft = {
      id: null, label: '', kind: hasOriginal ? 'aditivo' : 'original',
      billing_start: today, billing_end: '', endDirty: false,
      due_day: Number(today.slice(8, 10)) || 5,
      auto_renew: false, status: 'ativa', reason: '',
      billing_type: form.billing_type || 'por_licenca',
      billing_base_value: form.billing_base_value || '',
      billing_floor: form.billing_floor || '',
      contract_signed_date: '', contract_renewal: '', correction_index: '',
      billing_status: 'ativo', billing_suspended_until: '',
      N: 12, rules: [], eventuais: [], mods: {}, tiers: [],
    }
    const next = [...seriesWithBuffer(), draft]
    setSeriesList(next)
    setForm(prev => ({ ...prev, ...planFromForm(draft) }))
    setContractN(draft.N)
    setContractRules([])
    setEventuais([])
    setModPricing({})
    setOsTiers([])
    setModErrors({})
    setNavError('')
    setActiveSeriesIdx(next.length - 1)
  }
  function validateSeriesList(list) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      const tag = list.length > 1 ? ` (${s.label || KIND_LABELS[s.kind] || `série ${i + 1}`})` : ''
      if (!s.billing_start) return `Informe o início da cobrança${tag}.`
      if (s.kind === 'renegociacao' && !(s.reason || '').trim()) return `Renegociação${tag} exige motivo.`
      if (s.kind === 'renegociacao' && String(s.reason || '').trim().length < 10) return `Motivo da renegociação${tag} precisa de ao menos 10 caracteres.`
      if (s.rules.length > 0) {
        const v = validateRulesContiguous(s.rules, s.N)
        if (!v.ok) return `Recorrência${tag}: ${v.error}`
      }
      if (s.billing_status === 'suspenso' && !s.billing_suspended_until) {
        return `Informe "Suspenso até"${tag} quando o status for Suspenso.`
      }
      for (const ev of s.eventuais) {
        if (!(Number(ev.total) > 0)) continue
        const start = Number(ev.startMonth) || 1
        const inst = Number(ev.installments) || 1
        if (start + inst - 1 > s.N) return `Cobrança "${ev.label || 'eventual'}"${tag} ultrapassa os ${s.N} meses da série.`
      }
      for (const [cid, v] of Object.entries(s.mods || {})) {
        if (v?.active && (v.value === '' || isNaN(Number(v.value)))) {
          const sol = solucoes.find(x => String(x.id) === String(cid))
          return `Produto "${sol?.name || cid}"${tag} sem valor válido.`
        }
      }
      if (s.billing_type === 'por_os' && (s.tiers || []).length > 0) {
        const vt = validateOsTiers(s.tiers)
        if (!vt.ok) return `Faixas de preço${tag}: ${vt.error}`
      }
    }
    // Renegociações ativas não podem se sobrepor (mês com 2 descontos é ambíguo)
    const wins = renegWindows(list.filter(s => !s.status || s.status === 'ativa'))
    for (let i = 0; i < wins.length; i++) {
      for (let j = i + 1; j < wins.length; j++) {
        if (wins[i].start <= wins[j].end && wins[j].start <= wins[i].end) {
          return `Renegociações "${wins[i].label || 'A'}" e "${wins[j].label || 'B'}" se sobrepõem — use uma por período.`
        }
      }
    }
    return null
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

    // Séries contratuais: valida todas (buffer da ativa + demais)
    const finalSeries = seriesWithBuffer()
    const seriesErr = validateSeriesList(finalSeries)
    if (seriesErr) { toast.error(seriesErr); setActiveTab(2); return }
    const origForMirror = finalSeries.find(s => s.kind === 'original') || finalSeries[0] || {}
    // Expansão por série (para MRR + persistência) — sem ids ainda
    const expandedBySeries = finalSeries.map(s => ({
      meta: s,
      base: getBaseTotal(s.billing_base_value, s.billing_floor),
      rec: s.rules.length > 0 ? expandRulesToCharges(s.rules, s.N, { billingStart: s.billing_start }) : [],
      ev: expandEventuais((s.eventuais || []).filter(ev => Number(ev.total) > 0), { billingStart: s.billing_start }),
    }))
    const mrrSubmit = resolveMRR({
      billingStatus: origForMirror.billing_status || 'ativo',
      baseTotal: getBaseTotal(origForMirror.billing_base_value, origForMirror.billing_floor),
      series: expandedBySeries.map(x => ({
        kind: x.meta.kind, status: x.meta.status,
        billingStatus: x.meta.billing_status || 'ativo',
        hasAnyRules: x.meta.rules.length > 0, charges: x.rec, baseTotal: x.base,
      })),
    })

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
    // client_catalog é por cliente: união das soluções ativas de todas as séries
    const allModItems = finalSeries.flatMap(s => Object.entries(s.mods || {})
      .filter(([, v]) => v.active)
      .map(([id, v]) => ({ catalog_item_id: Number(id), status: v.status || 'implantado' })))
    const catalogItems = [...new Map(
      [...servicesInCatalog, ...allModItems].map(i => [i.catalog_item_id, i])
    ).values()]

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
      comercial_id: form.comercial_id || null,
      site: form.site || null,
      // Espelho da série original (leitores legados: dados, dashboard, health, mapa)
      billing_type: origForMirror.billing_type || 'por_licenca',
      billing_base_value: origForMirror.billing_base_value !== '' ? Number(origForMirror.billing_base_value) : 0,
      billing_floor: origForMirror.billing_floor !== '' ? Number(origForMirror.billing_floor) : 0,
      contract_signed_date: origForMirror.contract_signed_date || null,
      contract_start: origForMirror.billing_start || null,
      contract_renewal: origForMirror.contract_renewal || null,
      correction_index: origForMirror.correction_index || null,
      // billing_status drives contract contribution: only 'ativo' bills
      billing_status: origForMirror.billing_status || 'ativo',
      billing_suspended_until: origForMirror.billing_suspended_until || null,
      contract_active: (origForMirror.billing_status || 'ativo') === 'ativo',
      mrr: mrrSubmit,
      erp: form.erp || null,
      ti_tipo: form.ti_tipo || null,
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

    let clientId
    if (isEdit) {
      await update.mutateAsync({ id: client.id, ...payload })
      clientId = client.id
    } else {
      const created = await create.mutateAsync(payload)
      clientId = created.id
    }

    // Upload pending anexos (nova empresa — salvar primeiro)
    if (pendingFiles.length > 0 && clientId && profile?.id) {
      try {
        const res = await saveActivityAttachments({ activityId: null, clientId, userId: profile.id, files: pendingFiles })
        if (!res.success) toast.error(`Anexos: ${res.error}`)
        else toast.success(`${pendingFiles.length} anexo(s) enviado(s)`)
      } catch (e) { toast.error(`Anexos: ${e.message}`) }
    }

    // Persist contract motor por série (scoped: outras séries intactas)
    const existingBySeries = {}
    existingCharges.forEach(c => {
      const k = c.series_id || 'none'
      if (!existingBySeries[k]) existingBySeries[k] = []
      existingBySeries[k].push(c)
    })
    const existingTiersBySeries = {}
    existingTiers.forEach(t => {
      const k = t.series_id || 'none'
      if (!existingTiersBySeries[k]) existingTiersBySeries[k] = []
      existingTiersBySeries[k].push(t)
    })
    for (let i = 0; i < finalSeries.length; i++) {
      const s = finalSeries[i]
      const end = s.auto_renew ? (s.billing_end || null) : (s.billing_end || billingEnd(s.billing_start, s.N) || null)
      let saved
      try {
        saved = await saveSeries({
          series: {
            id: s.id || undefined,
            label: s.label || KIND_LABELS[s.kind] || 'Série',
            kind: s.kind, billing_start: s.billing_start,
            billing_end: end,
            due_day: s.due_day, auto_renew: s.auto_renew,
            status: s.status, reason: s.reason || null,
            billing_type: s.billing_type || 'por_licenca',
            billing_base_value: s.billing_base_value !== '' ? Number(s.billing_base_value) : 0,
            billing_floor: s.billing_floor !== '' ? Number(s.billing_floor) : 0,
            billing_status: s.billing_status || 'ativo',
            billing_suspended_until: s.billing_suspended_until || null,
            correction_index: s.correction_index || null,
            contract_signed_date: s.contract_signed_date || null,
            contract_renewal: s.contract_renewal || null,
          },
          clientId, userId: profile?.id,
        })
      } catch (e) { toast.error(`Série "${s.label || KIND_LABELS[s.kind]}": ${e.message}`); continue }
      const rec = s.rules.length > 0 ? expandRulesToCharges(s.rules, s.N, { seriesId: saved.id, billingStart: saved.billing_start }) : []
      const ev = expandEventuais((s.eventuais || []).filter(x => Number(x.total) > 0), { seriesId: saved.id, billingStart: saved.billing_start })
      const all = [...rec, ...ev]
      const hadRows = (existingBySeries[s.id] || []).length > 0
      try {
        if (all.length > 0) {
          await saveCharges({ charges: all, clientId, seriesId: saved.id, userId: profile?.id })
        } else if (hadRows) {
          await saveCharges({ charges: [], clientId, seriesId: saved.id, userId: profile?.id })
        }
      } catch (e) { toast.error(`Contrato (${saved.label}): ${e.message}`) }
      // Tiers por série
      const tiers = (s.tiers || []).map((t, idx) => ({ ...t, tier_order: idx + 1 }))
      const hadTiers = (existingTiersBySeries[s.id] || []).length > 0
      try {
        if (s.billing_type === 'por_os' && tiers.length > 0) {
          await saveTiers({ tiers, clientId, seriesId: saved.id })
        } else if (hadTiers) {
          await saveTiers({ tiers: [], clientId, seriesId: saved.id })
        }
      } catch (e) { toast.error(`Faixas OS (${saved.label}): ${e.message}`) }
      // Mods (divisão MRR) por série; original também limpa linhas legadas sem série
      const modItems = Object.entries(s.mods || {})
        .filter(([, v]) => v.active)
        .map(([cid, v]) => ({
          client_id: clientId,
          catalog_item_id: Number(cid),
          additional_value: Number(v.value) || 0,
        }))
      try {
        await saveModPricing.mutateAsync({
          clientId, items: modItems, seriesId: saved.id,
          clearNulls: s.kind === 'original',
        })
      } catch (e) { toast.error(`Produtos (${saved.label}): ${e.message}`) }
      // Auditoria: série criada ou encerrada
      try {
        if (!s.id) await logAction('create_series', 'contract_series', saved.id, saved.label, null, { kind: saved.kind, billing_start: saved.billing_start })
        const wasActive = (existingSeries.find(x => x.id === s.id)?.status || 'ativa') === 'ativa'
        if (s.id && wasActive && s.status === 'encerrada') {
          await logAction('encerrar_serie', 'contract_series', saved.id, saved.label, { status: 'ativa' }, { status: 'encerrada', reason: s.reason })
        }
      } catch (_) {}
    }

    // Persist handover answers (client_handovers). Never blocks the save — the
    // handoff is informational and no field is required.
    {
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
      if (Object.values(answers).some(v => v.trim())) {
        const { error: handoverErr } = await supabase
          .from('client_handovers')
          .upsert(
            { client_id: clientId, answers, template_version: 'v1', updated_at: new Date().toISOString() },
            { onConflict: 'client_id' },
          )
        if (handoverErr) toast.error(`Handoff não salvo: ${handoverErr.message}`)
      }
    }

    // Drop cached copies so a subsequent edit remounts with fresh server data
    // (the form seeds its state from `client` once, at mount).
    qc.removeQueries({ queryKey: ['client', clientId] })
    qc.removeQueries({ queryKey: ['contract_charges', clientId] })
    qc.removeQueries({ queryKey: ['contract_series', clientId] })
    qc.removeQueries({ queryKey: ['billing_os_tiers', clientId] })
    qc.invalidateQueries({ queryKey: ['clients'] })

    onSuccess?.(clientId)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-border-tertiary mb-5 -mt-1 overflow-x-auto overflow-y-hidden">
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
        <div className="space-y-6">
          <FormSection title="Identificação">
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
            </div>
          </FormSection>

          <FormSection title="Responsáveis">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">CSM responsável</label>
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
                <p className="text-[11px] text-text-tertiary mt-0.5">Pode ter mais de um responsável comercial.</p>
              </div>
            </div>
          </FormSection>
        </div>
      )}

      {/* ── ABA 1: Endereço (nova posição 2) ── */}
      {activeTab === 1 && (
        <FormSection title="Endereço">
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
              <p className="text-[11px] text-text-tertiary mt-0.5">Preenche o endereço automaticamente.</p>
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
        </FormSection>
      )}

      {/* ── ABA 2: Contrato (nova posição 3) ── */}
      {activeTab === 2 && (
        <div className="space-y-6">
          <FormSection
            title="Séries contratuais"
            hint="Cada série tem régua e início de cobrança próprios e gera faturas separadas. Ex: contrato original, módulo adicional, renegociação."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={addSeries} disabled={activeReadOnly}>
                + Nova série
              </Button>
            }
          >
            {seriesList.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {seriesList.map((s, i) => (
                  <button
                    key={s.id || `draft-${i}`}
                    type="button"
                    onClick={() => switchSeries(i)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${i === activeSeriesIdx ? 'bg-donc-navy text-white border-donc-navy' : 'bg-white text-text-secondary border-border-tertiary hover:bg-bg-secondary'}`}
                  >
                    {s.label || KIND_LABELS[s.kind] || `Série ${i + 1}`}
                    {s.status === 'encerrada' && ' · encerrada'}
                  </button>
                ))}
              </div>
            )}
            {activeSeries && (
              <div className="space-y-3">
                {activeSeries.status === 'encerrada' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Série encerrada — somente leitura.
                    {activeSeries.reason ? ` Motivo: ${activeSeries.reason}` : ''}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-sm">Rótulo</label>
                    <input
                      value={activeSeries.label}
                      onChange={e => updateSeriesMeta({ label: e.target.value })}
                      disabled={activeReadOnly}
                      className="input-base w-full disabled:opacity-50"
                      placeholder={KIND_LABELS[activeSeries.kind] || 'Série'}
                    />
                  </div>
                  <div>
                    <label className="label-sm">Tipo</label>
                    <select
                      value={activeSeries.kind}
                      onChange={e => updateSeriesMeta({ kind: e.target.value })}
                      disabled={activeReadOnly || (activeSeries.id && activeSeries.kind === 'original')}
                      className="input-base w-full disabled:opacity-50"
                    >
                      <option value="original">Contrato original</option>
                      <option value="aditivo">Aditivo (novo módulo)</option>
                      <option value="renegociacao">Renegociação (desconto temporário)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label-sm">Início da cobrança *</label>
                    <input
                      type="date"
                      value={activeSeries.billing_start}
                      onChange={e => updateSeriesMeta({ billing_start: e.target.value })}
                      disabled={activeReadOnly}
                      className="input-base w-full disabled:opacity-50"
                    />
                    <p className="text-[11px] text-text-tertiary mt-0.5">O mês 1 desta série vence neste mês.</p>
                  </div>
                  <div>
                    <label className="label-sm">Dia do vencimento</label>
                    <input
                      type="number" min="1" max="31"
                      value={activeSeries.due_day}
                      onChange={e => updateSeriesMeta({ due_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                      disabled={activeReadOnly}
                      className="input-base w-24 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="label-sm">Data de assinatura</label>
                    <input
                      type="date"
                      value={activeSeries.contract_signed_date || ''}
                      onChange={e => updateSeriesMeta({ contract_signed_date: e.target.value })}
                      disabled={activeReadOnly}
                      className="input-base w-full disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="label-sm">Renovação</label>
                    <input
                      type="date"
                      value={activeSeries.contract_renewal || ''}
                      onChange={e => updateSeriesMeta({ contract_renewal: e.target.value })}
                      disabled={activeReadOnly}
                      className="input-base w-full disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="label-sm">Fim da cobrança</label>
                    <input
                      type="date"
                      value={activeSeries.auto_renew ? (activeSeries.billing_end || '') : (activeSeries.billing_end || billingEnd(activeSeries.billing_start, activeSeries.N) || '')}
                      onChange={e => updateSeriesMeta({ billing_end: e.target.value, endDirty: true })}
                      disabled={activeReadOnly || !!activeSeries.auto_renew}
                      className="input-base w-full disabled:opacity-50"
                    />
                    {!activeSeries.auto_renew && !activeSeries.endDirty && (
                      <p className="text-[11px] text-text-tertiary mt-0.5">Automático: fim dos {activeSeries.N} meses.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="label-sm invisible select-none" aria-hidden="true">·</span>
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer h-10">
                      <input
                        type="checkbox"
                        checked={!!activeSeries.auto_renew}
                        onChange={e => updateSeriesMeta({ auto_renew: e.target.checked })}
                        disabled={activeReadOnly}
                      />
                      Renovação automática mês a mês
                    </label>
                  </div>
                </div>
                {(activeSeries.kind === 'renegociacao' || activeSeries.reason) && (
                  <div>
                    <label className="label-sm">Motivo {activeSeries.kind === 'renegociacao' && '*'}</label>
                    <textarea
                      value={activeSeries.reason || ''}
                      onChange={e => updateSeriesMeta({ reason: e.target.value })}
                      disabled={activeReadOnly}
                      rows={2}
                      className="input-base w-full resize-none disabled:opacity-50"
                      placeholder="Ex: dificuldade financeira — redução por 3 meses"
                    />
                  </div>
                )}
                {activeSeries.id && activeSeries.status === 'ativa' && (
                  <div>
                    <Button
                      type="button" variant="secondary" size="sm"
                      onClick={() => { setEncerrarReason(activeSeries.reason || ''); setEncerrarOpen(true) }}
                      className="text-donc-red"
                    >
                      Encerrar série…
                    </Button>
                  </div>
                )}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Plano de cobrança"
            hint="A cobrança pode ser por licença de usuário ou por OS (ordem de serviço). O piso é a quantidade mínima cobrada mesmo que o cliente use menos."
          >
            <div className="flex gap-2">
              {[{ v: 'por_licenca', l: 'Por licença de usuário' }, { v: 'por_os', l: 'Por OS' }].map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => set('billing_type', opt.v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.billing_type === opt.v ? 'bg-donc-navy text-white border-donc-navy' : 'bg-white text-text-secondary border-border-tertiary hover:bg-bg-secondary'}`}
                >
                  {opt.l}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Valor por {form.billing_type === 'por_os' ? 'OS' : 'licença'} (R$)</label>
                <input name="billing_base_value" type="number" value={form.billing_base_value} onChange={handleChange} className="input-base w-full" min="0" step="0.0001" placeholder="—" />
              </div>
              <div>
                <label className="label-sm">Piso mínimo ({form.billing_type === 'por_os' ? 'OS/mês' : 'licenças'})</label>
                <input name="billing_floor" type="number" value={form.billing_floor} onChange={handleChange} className="input-base w-full" min="0" placeholder="—" />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Índice de reajuste</label>
                <input name="correction_index" value={form.correction_index} onChange={handleChange} className="input-base w-full" placeholder="Ex: IPCA, IGP-M" />
              </div>
            </div>
            <p className="text-[11px] text-text-tertiary">Datas (assinatura, início, renovação) ficam na série acima — esta seção é o plano da série selecionada.</p>

            <div className="bg-donc-navy rounded-lg p-4 text-white">
              <p className="text-xs text-white/60 mb-0.5">MRR base</p>
              <p className="text-xl font-bold">
                {fmtBRL(baseTotal)}<span className="text-sm font-normal text-white/70">/mês</span>
              </p>
              <p className="text-xs text-white/70">
                {floor > 0
                  ? `${floor} ${form.billing_type === 'por_os' ? 'OS' : 'licenças'} × ${fmtBRL(basePerLic)}`
                  : `${fmtBRL(basePerLic)} por ${form.billing_type === 'por_os' ? 'OS' : 'licença'}`}
              </p>
            </div>
          </FormSection>

          <FormSection
            title="Status de cobrança"
            hint="Ativo: gera mensalidade normalmente. Suspenso: a mensalidade zera até a data informada e volta sozinha depois. Não cobrar: nunca gera mensalidade."
          >
            <div className="flex gap-2 flex-wrap">
              {[
                { v: 'ativo', l: 'Ativo', c: 'bg-donc-verde text-white border-donc-verde' },
                { v: 'suspenso', l: 'Suspenso', c: 'bg-amber-500 text-white border-amber-500' },
                { v: 'nao_bilhetavel', l: 'Não cobrar', c: 'bg-border-secondary text-text-secondary border-border-secondary' },
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
              </div>
            )}
          </FormSection>

          <FormSection
            title="Evolução da recorrência (MRR)"
            hint={`Defina quanto o cliente paga em cada período da série selecionada${activeSeries ? ` (${activeSeries.label || KIND_LABELS[activeSeries.kind]})` : ''}. Ex: R$ 2.500 do mês 1 ao 5 e R$ 4.000 do mês 6 até o fim. Sem períodos, a recorrência é sempre o MRR base.`}
            valid={contractRules.length > 0 && validateRulesContiguous(contractRules, contractN).ok}
            action={
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                Contrato de
                <input
                  type="number" min="1" max="120" value={contractN}
                  onChange={e => setContractN(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                  className="input-base w-16 text-center"
                />
                meses
              </label>
            }
          >
            <ContractChargesSection
              N={contractN}
              rules={contractRules}
              setRules={setContractRules}
              billingBaseValue={form.billing_base_value}
              billingFloor={form.billing_floor}
              billingStart={activeSeries?.billing_start || null}
              dueDay={activeSeries?.due_day || 5}
              readOnly={activeReadOnly}
            />
          </FormSection>

          <FormSection
            title="Cobranças Eventuais"
            hint="Valores cobrados uma vez — implantação, setup, treinamento. Podem ser divididos em parcelas, a partir do início do contrato."
            collapsible
            defaultOpen={eventuais.length > 0}
            summary={eventuais.length > 0
              ? `${eventuais.length} ${eventuais.length > 1 ? 'cobranças' : 'cobrança'} · ${fmtBRL(eventuais.reduce((s, e) => s + (Number(e.total) || 0), 0))}`
              : 'Nenhuma'}
          >
            <EventuaisSection eventuais={eventuais} setEventuais={setEventuais} readOnly={activeReadOnly} billingStart={activeSeries?.billing_start || null} />
          </FormSection>

          {form.billing_type === 'por_os' && (
            <FormSection
              title="Faixas de preço por OS"
              hint="Preço fixo por faixa de volume de OS no mês. Acima da última faixa, cobra-se um valor por OS excedente. A franquia mínima é o limite da faixa 1."
              valid={osTiers.length > 0 && validateOsTiers(osTiers).ok}
              collapsible
              defaultOpen={osTiers.length > 0}
              summary={osTiers.length > 0 ? `${osTiers.length} ${osTiers.length > 1 ? 'faixas' : 'faixa'}` : 'Nenhuma'}
            >
              <OsTiersSection billingType={form.billing_type} tiers={osTiers} setTiers={setOsTiers} readOnly={activeReadOnly} />
            </FormSection>
          )}

          {solucoes.length > 0 && (
            <FormSection
              title="Divisão do MRR por produto"
              hint="Distribui o MRR entre os produtos contratados. Divide o total, não soma. Ex: R$ 4.000 = R$ 2.500 + R$ 1.500."
              valid={rateioOk && activeModList.length > 0}
              collapsible
              defaultOpen={activeModList.length > 0}
              summary={activeModList.length > 0
                ? `${activeModList.length} ${activeModList.length > 1 ? 'produtos' : 'produto'} · ${fmtBRL(sumMods)}`
                : 'Nenhum'}
              action={
                <button
                  type="button"
                  onClick={toggleAll}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
                >
                  <span className={`w-7 h-4 rounded-full transition-colors flex-shrink-0 ${allActive ? 'bg-donc-lime' : 'bg-border-secondary'}`}>
                    <span className={`block w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${allActive ? 'translate-x-3' : ''}`} style={{ marginTop: '3px', marginLeft: '3px' }} />
                  </span>
                  {allActive ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              }
            >
              {solucoes.map(sol => {
                const mp = modPricing[sol.id] || { active: false, value: '' }
                const pct = baseTotal > 0 && mp.value ? ((Number(mp.value) / baseTotal) * 100).toFixed(0) : null
                return (
                  <div key={sol.id}>
                    <div className="grid grid-cols-[2.5rem_1fr_10rem_9rem_2.5rem] items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMod(sol.id)}
                        className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${mp.active ? 'bg-donc-lime' : 'bg-border-secondary'}`}
                      >
                        <span className={`block w-3 h-3 bg-white rounded-full shadow mx-1 transition-transform ${mp.active ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sol.color }} />
                        <span className="text-sm text-text-primary truncate">{sol.name}</span>
                      </span>
                      {mp.active ? (
                        <select
                          value={mp.status || 'implantado'}
                          onChange={e => setModStatus(sol.id, e.target.value)}
                          className="input-base w-full text-xs h-8"
                        >
                          <option value="implantado">Implantado</option>
                          <option value="em_implantacao">Em implantação</option>
                          <option value="pausado">Pausado</option>
                          <option value="abandonado">Abandonado</option>
                          <option value="descontinuado">Descontinuado</option>
                        </select>
                      ) : <span />}
                      <div className="flex items-center gap-1">
                        <span className="w-4 text-xs text-text-tertiary">R$</span>
                        <input
                          type="number"
                          value={mp.value}
                          onChange={e => setModValue(sol.id, e.target.value)}
                          disabled={!mp.active}
                          placeholder={mp.active ? '2500' : '—'}
                          className={`input-base w-full text-right disabled:opacity-40 ${modErrors[sol.id] ? 'border-red-400' : ''}`}
                          min="0" step="0.01"
                        />
                      </div>
                      <span className="text-right text-xs text-text-tertiary">{mp.active && pct ? `${pct}%` : ''}</span>
                    </div>
                    {modErrors[sol.id] && (
                      <p className="text-xs text-red-500 mt-1 ml-[3.25rem]">{modErrors[sol.id]}</p>
                    )}
                  </div>
                )
              })}
              {!rateioOk && activeModList.length > 0 && (
                <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5">
                  A soma dos produtos ({fmtBRL(sumMods)}) precisa bater com o MRR base ({fmtBRL(baseTotal)}). Diferença de {fmtBRL(rateioDiff)}.
                </p>
              )}
            </FormSection>
          )}
        </div>
      )}

      {/* ── ABA 3: Operacional (nova posição 4) ── */}
      {activeTab === 3 && (
        <div className="space-y-6">
          <FormSection title="Operação">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Estágio</label>
                <select name="stage_id" value={form.stage_id} onChange={handleChange} className="input-base w-full">
                  <option value="">Sem estágio</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Total de unidades/lojas da rede <span className="text-text-tertiary font-normal">(potencial de expansão)</span></label>
                <input name="unidades_total" type="number" value={form.unidades_total} onChange={handleChange} className="input-base w-full" min="0" placeholder="—" />
              </div>
              <div>
                <label className="label-sm">Unidades previstas para o início do projeto</label>
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
                <span className="label-sm inline-flex items-center gap-1.5">
                  ERP
                  <InfoHint>Sistema de gestão que o cliente usa hoje. Informativo, não afeta a cobrança.</InfoHint>
                </span>
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
          </FormSection>

          {(servicos.length > 0 || solucoes.length > 0) && (
            <FormSection title="Produtos e serviços">
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
                    Soluções <span className="text-text-tertiary/60">(definidas na aba Contrato)</span>
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
            </FormSection>
          )}

          <FormSection
            title="Handoff comercial → onboarding"
            hint="Informações da venda que ajudam o time de onboarding a começar bem. Preencha o que já souber — nenhum campo é obrigatório."
          >
            <div className="space-y-3">
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
          </FormSection>
        </div>
      )}

      {/* ── ABA 4: Anexos ── */}
      {activeTab === 4 && (
        <div className="space-y-4">
          {isEdit ? (
            <ClientSubAnexos client={client} allowUpload />
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-secondary">Arquivos que serão enviados após salvar a empresa.</p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border-secondary rounded-md hover:bg-bg-secondary cursor-pointer text-text-secondary">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      if (files.length === 0) return
                      if (pendingFiles.length + files.length > 5) { toast.error('Máximo de 5 anexos'); return }
                      setPendingFiles(prev => [...prev, ...files])
                      e.target.value = ''
                    }}
                  />
                  + Adicionar anexo
                </label>
              </div>
              {pendingFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-tertiary border border-dashed border-border-secondary rounded-lg bg-bg-secondary/50">
                  <span className="text-sm">Nenhum anexo selecionado.</span>
                  <span className="text-xs">Máximo 5 arquivos — serão enviados ao salvar.</span>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pendingFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-secondary border border-border-tertiary rounded-md text-sm">
                      <span className="truncate text-text-primary">{f.name} <span className="text-text-tertiary">({(f.size / 1024).toFixed(1)} KB)</span></span>
                      <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:underline flex-shrink-0">Remover</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {navError && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5 mt-4">{navError}</p>
      )}
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
            <Button type="button" variant="secondary" onClick={() => { setNavError(''); setActiveTab(t => t - 1) }}>← Anterior</Button>
          )}
          {activeTab < TABS_V2.length - 1 && (
            <Button type="button" onClick={() => {
              if (activeTab === 2) {
                const errs = validateMods()
                if (Object.keys(errs).length > 0) {
                  setModErrors(errs)
                  setNavError('Ajuste os valores dos produtos antes de continuar.')
                  return
                }
                const seriesErr = validateSeriesList(seriesWithBuffer())
                if (seriesErr) {
                  setNavError(seriesErr)
                  return
                }
              }
              setNavError('')
              setActiveTab(t => t + 1)
            }}>Próximo →</Button>
          )}
          <Button type="submit" disabled={isMutating || uploadingLogo}>
            {isMutating || uploadingLogo ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Empresa'}
          </Button>
        </div>
      </div>

      <Modal isOpen={encerrarOpen} onClose={() => setEncerrarOpen(false)} title="Encerrar série" maxWidth="max-w-sm">
        <p className="text-sm text-text-secondary mb-3">
          A série <span className="font-medium text-text-primary">{activeSeries?.label || KIND_LABELS[activeSeries?.kind]}</span> ficará
          somente leitura e sairá do MRR. O histórico é preservado. Informe o motivo:
        </p>
        <textarea
          value={encerrarReason}
          onChange={e => setEncerrarReason(e.target.value)}
          rows={3}
          className="input-base w-full resize-none"
          placeholder="Ex: contrato finalizado em comum acordo"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="secondary" onClick={() => setEncerrarOpen(false)}>Cancelar</Button>
          <Button
            type="button"
            onClick={() => {
              if (encerrarReason.trim().length < 10) { toast.error('Motivo precisa de ao menos 10 caracteres'); return }
              updateSeriesMeta({ status: 'encerrada', reason: encerrarReason.trim() })
              setEncerrarOpen(false)
              toast.success('Série marcada como encerrada — salve para confirmar')
            }}
          >
            Encerrar
          </Button>
        </div>
      </Modal>
    </form>
  )
}
