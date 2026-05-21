import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReport, useReportMutations } from '../hooks/useClientReports'
import { useClient } from '../hooks/useClient'
import { useProfiles } from '../hooks/useProfiles'
import { useProjects } from '../hooks/useProjects'
import { generateReportHTML, periodLabel, normalizeSections, defaultSections } from '../lib/reportGenerator'
import { supabase } from '../lib/supabaseClient'
import { useDonkie } from '../hooks/useDonkie'
import { EmailComposerModal } from '../components/email/EmailComposerModal'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icons } from '../lib/icons'

const SECTION_ICONS = {
  capa: Icons.FileText,
  escala: Icons.BarChart3,
  suporte: Icons.Target,
  projetos: Icons.Rocket,
  health_score: Icons.BarChart3,
  destaques: Icons.Star,
  contexto: Icons.Globe,
  proximos_passos: Icons.Target,
  'custom-text': Icons.FileText,
  'custom-image': Icons.Image,
  'custom-metrics': Icons.BarChart3,
  'custom-bars': Icons.BarChart3,
}

// ── Helpers ──────────────────────────────────────────────────
const PT_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
function formatPeriodPT(period) {
  const [y, m] = period.split('-').map(Number)
  return `${PT_MONTHS[m - 1]} ${y}`
}

function getLast12Months(period) {
  const [y, m] = period.split('-').map(Number)
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function uid() { return `c${Date.now()}${Math.random().toString(36).slice(2, 6)}` }

function SecIcon({ type, className = 'w-3.5 h-3.5' }) {
  const Icon = SECTION_ICONS[type] ?? Icons.FileText
  return <Icon className={className} />
}

const TAG_COLORS = {
  'Donc':         'bg-blue-100 text-blue-700',
  'Cliente':      'bg-green-100 text-green-700',
  'Conjunto':     'bg-purple-100 text-purple-700',
  'Oportunidade': 'bg-yellow-100 text-yellow-800',
  'A discutir':   'bg-orange-100 text-orange-700',
  'Em espera':    'bg-slate-100 text-slate-600',
}

const TAGS = ['Donc', 'Cliente', 'Conjunto', 'Oportunidade', 'A discutir', 'Em espera']

// ────────────────────────────────────────────────────────────
export default function ReportEditorPage() {
  const { clientId, reportId } = useParams()
  const navigate = useNavigate()

  const { data: report,   isLoading: loadingReport } = useReport(reportId)
  const { data: client,   isLoading: loadingClient } = useClient(clientId)
  const { data: profiles = [] }                       = useProfiles()
  const { data: projects = [] }                       = useProjects(parseInt(clientId, 10))
  const { setReportExtra }                            = useDonkie()
  const { updateReport, publishReport }               = useReportMutations(parseInt(clientId, 10))

  // ── Sections (array) ────────────────────────────────────
  const [sections, setSections] = useState([])
  const [activeId, setActiveId] = useState('capa')

  // ── Dados externos ──────────────────────────────────────
  const [usageHistory, setUsageHistory] = useState([])
  const [supportRaw,   setSupportRaw]   = useState(null)
  const [dataLoaded,   setDataLoaded]   = useState(false)

  // ── Modais / UI ──────────────────────────────────────────
  const [showNewModal,  setShowNewModal]  = useState(false)
  const [newTitle,      setNewTitle]      = useState('')
  const [newType,       setNewType]       = useState('custom-text')
  const [uploadingImg,  setUploadingImg]  = useState(null) // section id
  const [saving,        setSaving]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishBanner, setPublishBanner] = useState(false)
  const [populated,     setPopulated]     = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)

  // ── Extra inline add form ────────────────────────────────
  const [addingExtra,   setAddingExtra]   = useState(null) // section id
  const [extraDraft,    setExtraDraft]    = useState(blankExtra())

  function blankExtra() {
    return { label: '', value: '', sublabel: '', delta: '', deltaType: 'neutral', deltaColor: 'auto', accentColor: 'sky', highlighted: false }
  }

  // ── Effect: load sections ────────────────────────────────
  useEffect(() => {
    if (!report) return
    const secs = normalizeSections(report.sections ?? [])
    setSections(secs)
    setActiveId(secs[0]?.id ?? 'capa')
  }, [report?.id])

  // ── Effect: fetch usage/support data ────────────────────
  useEffect(() => {
    if (!clientId || !report?.period) return
    const period = report.period
    const months = getLast12Months(period)
    ;(async () => {
      const [{ data: hist }, { data: sup }] = await Promise.all([
        supabase.from('client_usage')
          .select('ref_month,os_created,active_users')
          .eq('client_id', clientId)
          .in('ref_month', months),
        supabase.from('client_support')
          .select('*')
          .eq('client_id', clientId)
          .eq('ref_month', period)
          .maybeSingle(),
      ])
      setUsageHistory(hist ?? [])
      setSupportRaw(sup ?? null)
      setDataLoaded(true)
    })()
  }, [clientId, report?.period])

  // ── Effect: auto-populate new reports ───────────────────
  useEffect(() => {
    if (!dataLoaded || !report || populated) return
    const isEmpty = !Array.isArray(report.sections) && Object.keys(report.sections ?? {}).length === 0
    if (!isEmpty && Array.isArray(report.sections) && report.sections.length > 0) {
      setPopulated(true); return
    }
    const period = report.period
    const cur  = usageHistory.find(u => u.ref_month === period)
    if (cur || supportRaw || projects.length) {
      // Data is ready — sections already initialized via normalizeSections
      setPopulated(true)
    }
  }, [dataLoaded, report?.id, projects.length, populated])

  // ── Push report data to Donkie ──────────────────────────
  useEffect(() => {
    if (!report) return
    setReportExtra({ sections, title: report.title, period: report.period, status: report.status })
    return () => setReportExtra(null)
  }, [sections, report?.title, report?.period, report?.status])

  // ── CSM ─────────────────────────────────────────────────
  const csm = useMemo(() => {
    if (!client?.csm_id) return null
    return profiles.find(p => p.id === client.csm_id) ?? null
  }, [client, profiles])

  // ── Health data from client ──────────────────────────────
  const healthData = useMemo(() => {
    if (!client) return null
    const fields = ['health_total','health_uso','health_suporte','health_relacionamento','health_financeiro','health_projeto']
    const h = {}
    let ok = false
    for (const f of fields) { if (client[f] != null) { h[f] = client[f]; ok = true } }
    return ok ? h : null
  }, [client])

  // ── HTML preview ─────────────────────────────────────────
  const html = useMemo(() => {
    if (!client || !report) return ''
    return generateReportHTML(
      client,
      { ...report, sections },
      csm,
      { usageHistory, supportRaw, healthData, projects }
    )
  }, [client, report, sections, csm, usageHistory, supportRaw, healthData, projects])

  // ── Section helpers ──────────────────────────────────────
  function updateSection(id, changes) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s))
  }
  function updateContent(id, key, value) {
    setSections(prev => prev.map(s => s.id === id
      ? { ...s, content: { ...s.content, [key]: value } }
      : s))
  }
  function toggleEnabled(id) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  // ── Extra helpers ────────────────────────────────────────
  function confirmExtra(sectionId) {
    if (!extraDraft.label || !extraDraft.value) return
    setSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, extras: [...(s.extras ?? []), { ...extraDraft, id: uid() }] }
      : s))
    setAddingExtra(null)
    setExtraDraft(blankExtra())
  }
  function removeExtra(sectionId, extraId) {
    setSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, extras: (s.extras ?? []).filter(e => e.id !== extraId) }
      : s))
  }
  function editExtra(sectionId, extraId, changes) {
    setSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, extras: (s.extras ?? []).map(e => e.id === extraId ? { ...e, ...changes } : e) }
      : s))
  }

  // ── Timeline (Destaques) helpers ─────────────────────────
  function addDestaque(id) {
    updateContent(id, 'items', [...(getSec(id)?.content?.items ?? []), { id: uid(), emoji: '⭐', title: '', description: '' }])
  }
  function updateDestaque(id, itemId, changes) {
    const items = (getSec(id)?.content?.items ?? []).map(it => it.id === itemId ? { ...it, ...changes } : it)
    updateContent(id, 'items', items)
  }
  function removeDestaque(id, itemId) {
    updateContent(id, 'items', (getSec(id)?.content?.items ?? []).filter(it => it.id !== itemId))
  }

  // ── Next-steps helpers ───────────────────────────────────
  function addPasso(id) {
    updateContent(id, 'items', [...(getSec(id)?.content?.items ?? []), { id: uid(), title: '', description: '', tag: 'Donc' }])
  }
  function updatePasso(id, itemId, changes) {
    const items = (getSec(id)?.content?.items ?? []).map(it => it.id === itemId ? { ...it, ...changes } : it)
    updateContent(id, 'items', items)
  }
  function removePasso(id, itemId) {
    updateContent(id, 'items', (getSec(id)?.content?.items ?? []).filter(it => it.id !== itemId))
  }

  // ── Custom bars helpers ───────────────────────────────────
  function addBarsItem(sectionId) {
    const sec = getSec(sectionId)
    const items = sec?.content?.items ?? []
    updateContent(sectionId, 'items', [...items, { id: uid(), label: '', value: '', color: 'sky' }])
  }
  function updateBarsItem(sectionId, itemId, changes) {
    const sec = getSec(sectionId)
    const items = (sec?.content?.items ?? []).map(it => it.id === itemId ? { ...it, ...changes } : it)
    updateContent(sectionId, 'items', items)
  }
  function removeBarsItem(sectionId, itemId) {
    const sec = getSec(sectionId)
    updateContent(sectionId, 'items', (sec?.content?.items ?? []).filter(it => it.id !== itemId))
  }

  function getSec(id) { return sections.find(s => s.id === id) }

  // ── Drag-and-drop reorder ────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSections(prev => {
      const oldIndex = prev.findIndex(s => s.id === active.id)
      const newIndex = prev.findIndex(s => s.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      updateReport.mutate({ id: reportId, sections: next })
      return next
    })
  }

  // ── Add custom section ───────────────────────────────────
  function addCustomSection() {
    if (!newTitle.trim()) return
    const id  = uid()
    let content = { text: '', callout: '' }
    if (newType === 'custom-image') content = { imageUrl: '', caption: '' }
    if (newType === 'custom-bars') content = { items: [], callout: '' }
    const sec = {
      id, type: newType, title: newTitle.trim(), enabled: true,
      content,
      extras: [],
    }
    setSections(prev => [...prev, sec])
    setActiveId(id)
    setShowNewModal(false)
    setNewTitle('')
    setNewType('custom-text')
  }

  function deleteSection(id) {
    setSections(prev => prev.filter(s => s.id !== id))
    if (activeId === id) setActiveId(sections.find(s => s.id !== id)?.id ?? 'capa')
  }

  // ── Image upload ─────────────────────────────────────────
  async function handleImageUpload(file, sectionId) {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowed.includes(file.type)) { toast.error('Use PNG, JPG ou SVG.'); return }
    setUploadingImg(sectionId)
    try {
      const ext    = file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg')
      const rnd    = Math.random().toString(36).slice(2, 8)
      const path   = `${clientId}/${Date.now()}_${rnd}.${ext}`
      const { error } = await supabase.storage
        .from('report-images')
        .upload(path, file, { upsert: false, contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('report-images').getPublicUrl(path)
      updateContent(sectionId, 'imageUrl', data.publicUrl)
      toast.success('Imagem enviada!')
    } catch (e) {
      toast.error('Erro no upload: ' + e.message)
    } finally {
      setUploadingImg(null)
    }
  }

  // ── Save / Publish ───────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try { await updateReport.mutateAsync({ id: reportId, sections, html_content: html }) }
    finally { setSaving(false) }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      await updateReport.mutateAsync({ id: reportId, sections, html_content: html })
      await publishReport.mutateAsync({ id: reportId, html_content: html })
      setPublishBanner(true)
      // Register activity for this publish (fire-and-forget)
      ;(async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          await supabase.from('activities').insert({
            type:           'relatorio',
            title:          `RMC — ${formatPeriodPT(report.period)}`,
            client_id:      report.client_id,
            responsible_id: user?.id ?? null,
            activity_date:  new Date().toISOString().slice(0, 10),
            status:         'concluida',
            description:    'Relatório Mensal do Cliente gerado e publicado.',
            contact_id:     null,
          })
        } catch (err) {
          console.error('Activity insert failed:', err)
        }
      })()
    } finally { setPublishing(false) }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/r/${report.public_token}`)
    toast.success('Link copiado!')
  }

  // ── Guards ───────────────────────────────────────────────
  if (loadingReport || loadingClient) return <PageSpinner />
  if (!report || !client) return <div className="p-6 text-text-tertiary">Relatório não encontrado.</div>

  const isPublished = report.status === 'published'
  const clientName  = client.fantasy_name || client.name
  const activeSec   = getSec(activeId)
  // capa nunca é deletável; custom types são deletáveis
  const isCustom    = activeSec && ['custom-text','custom-image','custom-metrics','custom-bars'].includes(activeSec.type)

  // Seções arrastáveis = todas exceto capa
  const draggableSections = sections.filter(s => s.type !== 'capa')
  const capaSection = sections.find(s => s.type === 'capa')

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-secondary">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-tertiary bg-bg-primary flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
        >← Voltar</button>
        <div className="w-px h-4 bg-border-tertiary flex-shrink-0" />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-text-primary truncate">{report.title}</span>
          <span className="text-xs text-text-tertiary flex-shrink-0">{periodLabel(report.period)}</span>
          <Badge variant={isPublished ? 'green' : 'slate'}>{isPublished ? 'Publicado' : 'Rascunho'}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isPublished && <Button variant="secondary" size="sm" onClick={copyLink} className="flex items-center gap-1.5"><Icons.Link className="w-3 h-3" /> Copiar Link</Button>}
          {isPublished && (
            <Button variant="secondary" size="sm" onClick={() => setShowEmailModal(true)} className="flex items-center gap-1.5">
              <Icons.Send className="w-3 h-3" /> Enviar por E-mail
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {!isPublished && (
            <Button size="sm" onClick={handlePublish} disabled={publishing} className="flex items-center gap-1.5">
              {publishing ? 'Publicando…' : <><Icons.Rocket className="w-3 h-3" /> Publicar</>}
            </Button>
          )}
        </div>
      </div>

      <EmailComposerModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        mode="individual"
        preselectedClientId={Number(clientId)}
        preselectedTemplateName="relatorio_mensal"
        initialSubject={`Relatório Operacional Mensal — ${formatPeriodPT(report.period)} — ${clientName}`}
        initialBody={
          `<p>Prezados,</p>
<p>O Relatório Operacional Mensal — Projeto DONC já está disponível para consulta.</p>
<p>Para acessar o relatório, utilize o link abaixo e informe o seu e-mail no momento do acesso:</p>
<p><a href="${window.location.origin}/r/${report.public_token}">${window.location.origin}/r/${report.public_token}</a></p>
<p>Em caso de dúvidas ou necessidade de suporte, nossa equipe permanece à disposição através do portal de atendimento:</p>
<p><a href="https://donc.freshdesk.com/">https://donc.freshdesk.com/</a></p>
<p>Atenciosamente,<br>${csm?.name || 'Equipe Donc'}<br>Donc</p>`.trim()
        }
      />

      {/* Corpo */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar de seções (160px) ── */}
        <div className="w-[160px] flex-shrink-0 border-r border-border-tertiary bg-bg-secondary flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold text-text-tertiary uppercase tracking-wider border-b border-border-tertiary flex items-center justify-between">
            <span>Seções</span>
            <button
              onClick={() => setShowNewModal(true)}
              className="text-donc-navy hover:text-donc-navy/70 font-bold text-sm leading-none"
              title="Nova seção"
            >+</button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {/* Seção capa: fixa no topo, não arrastável */}
            {capaSection && (
              <div className="group relative">
                <button
                  onClick={() => setActiveId(capaSection.id)}
                  className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors ${
                    activeId === capaSection.id ? 'bg-donc-navy text-white' : 'text-text-secondary hover:bg-bg-tertiary'
                  }`}
                >
                  <SecIcon type="capa" />
                  <span className="text-[11px] leading-tight truncate flex-1">{capaSection.title}</span>
                </button>
              </div>
            )}

            {/* Seções arrastáveis */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={draggableSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {draggableSections.map(s => (
                  <SortableSidebarItem
                    key={s.id}
                    sec={s}
                    isActive={activeId === s.id}
                    showDelete={isCustom && s.id === activeId}
                    onSelect={() => setActiveId(s.id)}
                    onDelete={() => deleteSection(s.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* ── Editor (320px) ── */}
        <div className="w-[320px] flex-shrink-0 border-r border-border-tertiary bg-bg-primary flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {activeSec && (
              <SectionEditor
                sec={activeSec}
                client={client}
                healthData={healthData}
                uploadingImg={uploadingImg}
                addingExtra={addingExtra}
                extraDraft={extraDraft}
                onToggle={() => toggleEnabled(activeSec.id)}
                onContent={(k, v) => updateContent(activeSec.id, k, v)}
                onSubtitle={v => updateSection(activeSec.id, { subtitle: v })}
                onAddExtra={() => { setAddingExtra(activeSec.id); setExtraDraft(blankExtra()) }}
                onExtraDraft={setExtraDraft}
                onConfirmExtra={() => confirmExtra(activeSec.id)}
                onCancelExtra={() => setAddingExtra(null)}
                onRemoveExtra={extraId => removeExtra(activeSec.id, extraId)}
                onEditExtra={(extraId, changes) => editExtra(activeSec.id, extraId, changes)}
                onAddDestaque={() => addDestaque(activeSec.id)}
                onUpdateDestaque={(itemId, ch) => updateDestaque(activeSec.id, itemId, ch)}
                onRemoveDestaque={itemId => removeDestaque(activeSec.id, itemId)}
                onAddPasso={() => addPasso(activeSec.id)}
                onUpdatePasso={(itemId, ch) => updatePasso(activeSec.id, itemId, ch)}
                onRemovePasso={itemId => removePasso(activeSec.id, itemId)}
                onImageUpload={file => handleImageUpload(file, activeSec.id)}
                onAddBarsItem={() => addBarsItem(activeSec.id)}
                onUpdateBarsItem={(itemId, ch) => updateBarsItem(activeSec.id, itemId, ch)}
                onRemoveBarsItem={itemId => removeBarsItem(activeSec.id, itemId)}
                onUpdateSection={changes => updateSection(activeSec.id, changes)}
              />
            )}
          </div>
        </div>

        {/* ── Preview ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border-tertiary bg-bg-primary">
            <span className="text-xs text-text-tertiary">Preview em tempo real</span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <iframe
              srcDoc={html}
              title="Preview"
              className="w-full rounded-lg shadow border border-border-tertiary"
              style={{ height: 'calc(100vh - 120px)', minHeight: 500 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      </div>

      {/* Banner publicação */}
      {publishBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-donc-verde text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50">
          <span className="text-sm font-semibold">✅ Relatório publicado!</span>
          <button onClick={copyLink} className="text-xs font-semibold underline">Copiar link</button>
          <button onClick={() => setPublishBanner(false)} className="text-white/70 hover:text-white ml-2"><Icons.X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Modal nova seção */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}>
          <div className="bg-bg-primary rounded-xl p-6 w-80 shadow-2xl border border-border-tertiary">
            <h3 className="text-sm font-bold text-text-primary mb-4">+ Nova Seção</h3>
            <div className="mb-3">
              <label className="text-xs text-text-tertiary block mb-1">Título</label>
              <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomSection()}
                placeholder="Nome da seção…" className="input-base w-full text-sm" autoFocus />
            </div>
            <div className="mb-5">
              <label className="text-xs text-text-tertiary block mb-1">Tipo</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} className="input-base w-full text-sm">
                <option value="custom-text">Texto</option>
                <option value="custom-image">Imagem</option>
                <option value="custom-metrics">Métricas</option>
                <option value="custom-bars">Categorias</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowNewModal(false)}>Cancelar</Button>
              <Button size="sm" className="flex-1" onClick={addCustomSection} disabled={!newTitle.trim()}>Adicionar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SortableSidebarItem ───────────────────────────────────────
function SortableSidebarItem({ sec, isActive, showDelete, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sec.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        onClick={onSelect}
        className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors ${
          isActive ? 'bg-donc-navy text-white' : 'text-text-secondary hover:bg-bg-tertiary'
        } ${!sec.enabled ? 'opacity-40' : ''}`}
      >
        <span
          {...attributes} {...listeners}
          className="flex-shrink-0 text-[10px] leading-none cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100 select-none"
          onClick={e => e.stopPropagation()}
        >⋮⋮</span>
        <SecIcon type={sec.type} />
        <span className="text-[11px] leading-tight truncate flex-1">{sec.title}</span>
      </button>
      {showDelete && (
        <button
          onClick={onDelete}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-red-500 opacity-0 group-hover:opacity-100"
          title="Remover"
        ><Icons.X className="w-3 h-3" /></button>
      )}
    </div>
  )
}

// ── SectionEditor ─────────────────────────────────────────────
function SectionEditor({
  sec, client, healthData, uploadingImg,
  addingExtra, extraDraft,
  onToggle, onContent, onSubtitle,
  onAddExtra, onExtraDraft, onConfirmExtra, onCancelExtra, onRemoveExtra, onEditExtra,
  onAddDestaque, onUpdateDestaque, onRemoveDestaque,
  onAddPasso, onUpdatePasso, onRemovePasso,
  onImageUpload,
  onAddBarsItem, onUpdateBarsItem, onRemoveBarsItem,
  onUpdateSection,
}) {
  const showExtras  = ['escala','suporte','projetos','contexto','custom-metrics'].includes(sec.type)
  const showCallout = ['escala','suporte','projetos','destaques','contexto','custom-text','custom-metrics','custom-bars','health_score'].includes(sec.type)
  const isAdding    = addingExtra === sec.id
  const isCapa      = sec.type === 'capa'

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle + título (não mostrar para capa) */}
      {!isCapa && (
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-sm font-semibold ${sec.enabled ? 'text-text-primary' : 'text-text-tertiary'}`}>
            <SecIcon type={sec.type} />
            <span>{sec.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-tertiary">{sec.enabled ? 'Incluída' : 'Excluída'}</span>
            <Toggle enabled={sec.enabled} onToggle={onToggle} />
          </div>
        </div>
      )}

      {/* Título da seção capa */}
      {isCapa && (
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <SecIcon type="capa" />
          <span>Capa</span>
        </div>
      )}

      {/* Subtítulo por seção (para todas exceto capa — capa tem seu próprio campo) */}
      {!isCapa && (
        <div>
          <label className="text-xs text-text-tertiary block mb-1">Subtítulo da seção</label>
          <input
            type="text"
            value={sec.subtitle ?? ''}
            onChange={e => onSubtitle(e.target.value)}
            placeholder="Subtítulo opcional…"
            className="input-base w-full text-sm"
          />
        </div>
      )}

      <div className={!isCapa && !sec.enabled ? 'opacity-40 pointer-events-none' : ''}>

        {/* ── Editor da capa ── */}
        {isCapa && (
          <CapaEditor
            content={sec.content ?? { subtitle: '', clientTeam: [] }}
            client={client}
            onContent={onContent}
            onUpdateSection={onUpdateSection}
          />
        )}

        {/* ── Corpo por tipo ── */}
        {sec.type === 'health_score' && <HealthPreview healthData={healthData} />}

        {sec.type === 'destaques' && (
          <TimelineEditor
            items={sec.content?.items ?? []}
            onAdd={onAddDestaque}
            onUpdate={onUpdateDestaque}
            onRemove={onRemoveDestaque}
          />
        )}

        {sec.type === 'proximos_passos' && (
          <PassosEditor
            items={sec.content?.items ?? []}
            onAdd={onAddPasso}
            onUpdate={onUpdatePasso}
            onRemove={onRemovePasso}
          />
        )}

        {sec.type === 'contexto' && (
          <>
            <textarea
              value={sec.content?.text ?? ''}
              onChange={e => onContent('text', e.target.value)}
              rows={8}
              placeholder="Texto do contexto externo…"
              className="input-base w-full resize-none text-sm leading-relaxed"
            />
            <p className="text-[10px] text-text-tertiary mt-1">Use **texto** para negrito, *texto* para itálico. Quebras de linha são respeitadas.</p>
          </>
        )}

        {sec.type === 'custom-text' && (
          <>
            <textarea
              value={sec.content?.text ?? ''}
              onChange={e => onContent('text', e.target.value)}
              rows={10}
              placeholder="Texto da seção…"
              className="input-base w-full resize-none text-sm leading-relaxed"
            />
            <p className="text-[10px] text-text-tertiary mt-1">Use **texto** para negrito, *texto* para itálico. Quebras de linha são respeitadas.</p>
          </>
        )}

        {sec.type === 'custom-image' && (
          <ImageUploader
            imageUrl={sec.content?.imageUrl ?? ''}
            caption={sec.content?.caption ?? ''}
            uploading={uploadingImg === sec.id}
            onFile={onImageUpload}
            onCaption={v => onContent('caption', v)}
          />
        )}

        {sec.type === 'custom-bars' && (
          <BarsEditor
            items={sec.content?.items ?? []}
            onAdd={onAddBarsItem}
            onUpdate={onUpdateBarsItem}
            onRemove={onRemoveBarsItem}
          />
        )}

        {/* ── Override de métricas automáticas ── */}
        {sec.type === 'escala' && (
          <div className="border-t border-border-tertiary pt-4">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider block mb-2">Ajustar métricas automáticas</span>
            <p className="text-[10px] text-text-tertiary mb-3">Deixe em branco para usar o valor do sistema.</p>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-text-tertiary block mb-1">O.S. Criadas</label>
                <input type="number" value={sec.content?.overrideOs ?? ''}
                  onChange={e => onContent('overrideOs', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Automático" className="input-base w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-tertiary block mb-1">Usuários Ativos</label>
                <input type="number" value={sec.content?.overrideUsers ?? ''}
                  onChange={e => onContent('overrideUsers', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Automático" className="input-base w-full text-sm" />
              </div>
            </div>
          </div>
        )}

        {sec.type === 'suporte' && (
          <div className="border-t border-border-tertiary pt-4">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider block mb-2">Ajustar métricas automáticas</span>
            <p className="text-[10px] text-text-tertiary mb-3">Deixe em branco para usar o valor do sistema.</p>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-text-tertiary block mb-1">Tickets Abertos</label>
                <input type="number" value={sec.content?.overrideTicketsAbertos ?? ''}
                  onChange={e => onContent('overrideTicketsAbertos', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Automático" className="input-base w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-tertiary block mb-1">Tickets Resolvidos</label>
                <input type="number" value={sec.content?.overrideTicketsResolvidos ?? ''}
                  onChange={e => onContent('overrideTicketsResolvidos', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Automático" className="input-base w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-tertiary block mb-1">SLA 1ª Resposta (min)</label>
                <input type="number" value={sec.content?.overrideSla ?? ''}
                  onChange={e => onContent('overrideSla', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Automático" className="input-base w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-tertiary block mb-1">Taxa de Resolução (%)</label>
                <input type="number" value={sec.content?.overrideTaxaResolucao ?? ''}
                  onChange={e => onContent('overrideTaxaResolucao', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Automático" min="0" max="100" className="input-base w-full text-sm" />
              </div>
            </div>
          </div>
        )}

        {/* Callout analítico */}
        {showCallout && sec.type !== 'custom-image' && sec.type !== 'capa' && (
          <div>
            <label className="text-xs text-text-tertiary block mb-1">Análise / Nota</label>
            <textarea
              value={sec.content?.callout ?? ''}
              onChange={e => onContent('callout', e.target.value)}
              rows={4}
              placeholder="Texto analítico que aparece em destaque no relatório…"
              className="input-base w-full resize-none text-sm leading-relaxed"
            />
            <p className="text-[10px] text-text-tertiary mt-1">Use **texto** para negrito, *texto* para itálico. Quebras de linha são respeitadas.</p>
          </div>
        )}

        {/* KPI Extras */}
        {showExtras && (
          <ExtrasEditor
            extras={sec.extras ?? []}
            isAdding={isAdding}
            draft={extraDraft}
            onStartAdd={onAddExtra}
            onDraftChange={onExtraDraft}
            onConfirm={onConfirmExtra}
            onCancel={onCancelExtra}
            onRemove={onRemoveExtra}
            onEditExtra={onEditExtra}
          />
        )}
      </div>
    </div>
  )
}

// ── Capa Editor ───────────────────────────────────────────────
function CapaEditor({ content, client, onContent, onUpdateSection }) {
  const [teamSelect, setTeamSelect] = useState('')
  const [freeContact, setFreeContact] = useState({ name: '', email: '' })

  const clientTeam = content.clientTeam ?? []
  const subtitle   = content.subtitle ?? ''

  // Contatos do cliente que são Decisor ou champion
  const contactOptions = (client?.contact_links ?? []).filter(
    l => l.papel === 'Decisor' || l.champion === true
  )

  function handleAdd() {
    if (teamSelect) {
      // Prioridade: contato selecionado no select
      const link = contactOptions.find(l => String(l.id) === String(teamSelect))
      if (!link) return
      const name  = link.contacts?.name  || '—'
      const email = link.contacts?.email || link.contacts?.contact_emails?.[0]?.email || ''
      onContent('clientTeam', [...clientTeam, { name, email }])
      setTeamSelect('')
    } else if (freeContact.name.trim()) {
      // Contato manual
      onContent('clientTeam', [...clientTeam, {
        name:  freeContact.name.trim(),
        email: freeContact.email.trim(),
      }])
      setFreeContact({ name: '', email: '' })
    }
  }

  function handleRemoveMember(idx) {
    onContent('clientTeam', clientTeam.filter((_, i) => i !== idx))
  }

  const canAdd = !!teamSelect || !!freeContact.name.trim()

  return (
    <div className="flex flex-col gap-4">
      {/* Subtítulo da capa */}
      <div>
        <label className="text-xs text-text-tertiary block mb-1">Subtítulo da capa</label>
        <input
          type="text"
          value={subtitle}
          onChange={e => onContent('subtitle', e.target.value)}
          placeholder="Ex: Apresentação mensal de resultados…"
          className="input-base w-full text-sm"
        />
      </div>

      {/* Equipe do cliente */}
      <div>
        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider block mb-2">Equipe do Cliente</span>

        {/* Lista existente */}
        {clientTeam.map((tc, idx) => (
          <div key={idx} className="flex items-center justify-between bg-bg-secondary rounded-md px-3 py-2 mb-1.5 border border-border-tertiary">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-text-primary truncate block">{tc.name}</span>
              {tc.email && <span className="text-xs text-text-tertiary">{tc.email}</span>}
            </div>
            <button onClick={() => handleRemoveMember(idx)} className="text-text-tertiary hover:text-red-500 text-sm ml-2 flex-shrink-0">×</button>
          </div>
        ))}

        {/* Selecionar da lista */}
        {contactOptions.length > 0 && (
          <div className="mb-2">
            <label className="text-xs text-text-tertiary block mb-1">Da lista de contatos</label>
            <select
              value={teamSelect}
              onChange={e => setTeamSelect(e.target.value)}
              className="input-base text-xs w-full"
            >
              <option value="">Selecionar contato…</option>
              {contactOptions.map(l => (
                <option key={l.id} value={l.id}>
                  {l.contacts?.name || '—'} · {l.papel || 'Champion'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Campos manuais */}
        <div className="mb-2">
          <label className="text-xs text-text-tertiary block mb-1">Ou adicionar manualmente</label>
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              placeholder="Nome"
              value={freeContact.name}
              onChange={e => setFreeContact(f => ({ ...f, name: e.target.value }))}
              className="input-base text-xs"
            />
            <input
              type="email"
              placeholder="E-mail"
              value={freeContact.email}
              onChange={e => setFreeContact(f => ({ ...f, email: e.target.value }))}
              className="input-base text-xs"
            />
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="w-full text-xs py-1.5 rounded-md bg-donc-navy text-white font-semibold disabled:opacity-40"
        >+ Adicionar à equipe</button>
      </div>
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────
function Toggle({ enabled, onToggle }) {
  return (
    <button onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-donc-navy' : 'bg-border-secondary'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ── Health Score Preview (read-only) ──────────────────────────
function HealthPreview({ healthData }) {
  if (!healthData) return (
    <div className="text-xs text-text-tertiary p-3 bg-bg-secondary rounded-md border border-border-tertiary flex items-center gap-1.5">
      <Icons.BarChart3 className="w-3.5 h-3.5" /> Dados de Health Score não encontrados para este cliente.
    </div>
  )
  const total = healthData.health_total
  const status = total >= 75 ? { l: 'Saudável', c: 'text-green-600' }
    : total >= 50 ? { l: 'Atenção', c: 'text-yellow-600' }
    : { l: 'Risco', c: 'text-red-600' }
  const dims = [
    { label: 'Uso',            key: 'health_uso'            },
    { label: 'Suporte',        key: 'health_suporte'        },
    { label: 'Relacionamento', key: 'health_relacionamento' },
    { label: 'Financeiro',     key: 'health_financeiro'     },
    { label: 'Projeto',        key: 'health_projeto'        },
  ]
  return (
    <div className="p-3 bg-bg-secondary rounded-md border border-border-tertiary text-xs">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl font-bold text-text-primary">{total ?? '—'}</span>
        <span className={`font-semibold ${status.c}`}>{status.l}</span>
        <span className="text-text-tertiary">/ 100</span>
      </div>
      {dims.map(d => (
        <div key={d.key} className="flex items-center gap-2 mb-1.5">
          <span className="w-24 text-text-tertiary truncate">{d.label}</span>
          <div className="flex-1 bg-border-tertiary rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-donc-navy/60 rounded-full"
              style={{ width: `${Math.min((healthData[d.key] ?? 0) * 5, 100)}%` }} />
          </div>
          <span className="w-8 text-right text-text-secondary font-semibold">
            {healthData[d.key] != null ? `${healthData[d.key]}/20` : '—'}
          </span>
        </div>
      ))}
      <p className="mt-2 text-text-tertiary">Slide gerado automaticamente com esses dados.</p>
    </div>
  )
}

// ── Extras editor ─────────────────────────────────────────────
function ExtrasEditor({ extras, isAdding, draft, onStartAdd, onDraftChange, onConfirm, onCancel, onRemove, onEditExtra }) {
  const [editingExtraId, setEditingExtraId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const accentOpts = [
    { v: 'sky', l: 'Sky' }, { v: 'lime', l: 'Lime' },
    { v: 'navy', l: 'Navy' }, { v: 'green', l: 'Green' },
  ]
  const deltaOpts = [
    { v: 'neutral', l: '≈ Neutro' }, { v: 'up', l: '▲ Alta' }, { v: 'down', l: '▼ Baixa' }, { v: 'none', l: '— Sem seta' },
  ]
  const deltaColorOpts = [
    { v: 'auto', l: 'Auto' }, { v: 'green', l: 'Verde' }, { v: 'red', l: 'Vermelho' }, { v: 'gray', l: 'Cinza' },
  ]

  function startEdit(e) {
    setEditingExtraId(e.id)
    setEditDraft({ ...e })
  }
  function saveEdit() {
    onEditExtra(editingExtraId, editDraft)
    setEditingExtraId(null)
    setEditDraft({})
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">KPIs extras</span>
        {!isAdding && (
          <button onClick={onStartAdd}
            className="text-xs font-semibold text-donc-navy hover:underline">
            + Adicionar métrica
          </button>
        )}
      </div>

      {/* Existing extras */}
      {extras.map(e => (
        <div key={e.id} className="bg-bg-secondary rounded-md px-3 py-2 mb-1.5 border border-border-tertiary">
          {editingExtraId === e.id ? (
            <div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <input placeholder="Label *" value={editDraft.label ?? ''}
                  onChange={ev => setEditDraft(d => ({ ...d, label: ev.target.value }))}
                  className="input-base text-xs col-span-2" />
                <input placeholder="Valor *" value={editDraft.value ?? ''}
                  onChange={ev => setEditDraft(d => ({ ...d, value: ev.target.value }))}
                  className="input-base text-xs" />
                <input placeholder="Sublabel" value={editDraft.sublabel ?? ''}
                  onChange={ev => setEditDraft(d => ({ ...d, sublabel: ev.target.value }))}
                  className="input-base text-xs" />
                <input placeholder="Delta" value={editDraft.delta ?? ''}
                  onChange={ev => setEditDraft(d => ({ ...d, delta: ev.target.value }))}
                  className="input-base text-xs" />
                <select value={editDraft.deltaType ?? 'neutral'}
                  onChange={ev => setEditDraft(d => ({ ...d, deltaType: ev.target.value }))}
                  className="input-base text-xs">
                  {deltaOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <select value={editDraft.deltaColor ?? 'auto'}
                  onChange={ev => setEditDraft(d => ({ ...d, deltaColor: ev.target.value }))}
                  className="input-base text-xs">
                  {deltaColorOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <select value={editDraft.accentColor ?? 'sky'}
                  onChange={ev => setEditDraft(d => ({ ...d, accentColor: ev.target.value }))}
                  className="input-base text-xs col-span-2">
                  {accentOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={editDraft.highlighted ?? false}
                    onChange={ev => setEditDraft(d => ({ ...d, highlighted: ev.target.checked }))}
                    className="rounded" />
                  Destaque navy
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingExtraId(null)}
                  className="flex-1 text-xs py-1.5 rounded-md border border-border-secondary text-text-tertiary hover:bg-bg-tertiary">Cancelar</button>
                <button onClick={saveEdit}
                  className="flex-1 text-xs py-1.5 rounded-md bg-donc-navy text-white font-semibold">Salvar</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-text-primary truncate block">{e.label}</span>
                <span className="text-xs text-text-tertiary">{e.value}{e.sublabel ? ` · ${e.sublabel}` : ''}</span>
                {e.highlighted && <span className="text-[10px] text-donc-navy font-semibold">★ Destaque</span>}
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button onClick={() => startEdit(e)} className="text-text-tertiary hover:text-donc-navy" title="Editar"><Icons.Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => onRemove(e.id)} className="text-text-tertiary hover:text-red-500 text-sm">×</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add form */}
      {isAdding && (
        <div className="bg-bg-secondary rounded-lg p-3 border border-border-tertiary mt-2">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input placeholder="Label *" value={draft.label}
              onChange={e => onDraftChange({ ...draft, label: e.target.value })}
              className="input-base text-xs col-span-2" />
            <input placeholder="Valor *" value={draft.value}
              onChange={e => onDraftChange({ ...draft, value: e.target.value })}
              className="input-base text-xs" />
            <input placeholder="Sublabel" value={draft.sublabel}
              onChange={e => onDraftChange({ ...draft, sublabel: e.target.value })}
              className="input-base text-xs" />
            <input placeholder="Delta (ex: +12%)" value={draft.delta}
              onChange={e => onDraftChange({ ...draft, delta: e.target.value })}
              className="input-base text-xs" />
            <select value={draft.deltaType}
              onChange={e => onDraftChange({ ...draft, deltaType: e.target.value })}
              className="input-base text-xs">
              {deltaOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={draft.deltaColor}
              onChange={e => onDraftChange({ ...draft, deltaColor: e.target.value })}
              className="input-base text-xs">
              {deltaColorOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={draft.accentColor}
              onChange={e => onDraftChange({ ...draft, accentColor: e.target.value })}
              className="input-base text-xs col-span-2">
              {accentOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" checked={draft.highlighted ?? false}
                onChange={e => onDraftChange({ ...draft, highlighted: e.target.checked })}
                className="rounded" />
              Destaque navy
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 text-xs py-1.5 rounded-md border border-border-secondary text-text-tertiary hover:bg-bg-tertiary">Cancelar</button>
            <button onClick={onConfirm} disabled={!draft.label || !draft.value}
              className="flex-1 text-xs py-1.5 rounded-md bg-donc-navy text-white font-semibold disabled:opacity-40">
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Timeline editor (Destaques) ───────────────────────────────
function TimelineEditor({ items, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Itens do Timeline</span>
        <button onClick={onAdd} className="text-xs font-semibold text-donc-navy hover:underline">+ Adicionar</button>
      </div>
      {items.map(item => (
        <div key={item.id} className="bg-bg-secondary rounded-lg p-3 border border-border-tertiary mb-2">
          <div className="flex gap-2 mb-2">
            <input value={item.emoji} onChange={e => onUpdate(item.id, { emoji: e.target.value })}
              placeholder="⭐" className="input-base text-sm w-12 text-center" maxLength={2} />
            <input value={item.title} onChange={e => onUpdate(item.id, { title: e.target.value })}
              placeholder="Título do destaque" className="input-base text-sm flex-1" />
            <button onClick={() => onRemove(item.id)} className="text-text-tertiary hover:text-red-500 text-sm">×</button>
          </div>
          <textarea value={item.description} onChange={e => onUpdate(item.id, { description: e.target.value })}
            rows={2} placeholder="Descrição (opcional)" className="input-base text-sm w-full resize-none" />
          <p className="text-[10px] text-text-tertiary mt-1">Use **texto** para negrito, *texto* para itálico.</p>
        </div>
      ))}
      {!items.length && (
        <p className="text-xs text-text-tertiary text-center py-3">Nenhum destaque adicionado.</p>
      )}
    </div>
  )
}

// ── Próximos Passos editor ────────────────────────────────────
function PassosEditor({ items, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Próximos Passos</span>
        <button onClick={onAdd} className="text-xs font-semibold text-donc-navy hover:underline">+ Adicionar</button>
      </div>
      {items.map((item, i) => (
        <div key={item.id} className="bg-bg-secondary rounded-lg border border-border-tertiary mb-2 overflow-hidden">
          {/* Cabeçalho do item */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-tertiary bg-bg-tertiary/40">
            <span className="w-5 h-5 rounded-full bg-donc-navy text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <input
              value={item.title ?? ''}
              onChange={e => onUpdate(item.id, { title: e.target.value })}
              placeholder="Título do passo…"
              className="input-base text-xs flex-1 min-w-0"
            />
            <button
              onClick={() => onRemove(item.id)}
              className="text-text-tertiary hover:text-red-500 text-base leading-none flex-shrink-0 ml-1"
            >×</button>
          </div>
          {/* Corpo do item */}
          <div className="px-3 py-2 flex flex-col gap-2">
            <select
              value={item.tag ?? 'Donc'}
              onChange={e => onUpdate(item.id, { tag: e.target.value })}
              className="input-base text-xs w-full"
            >
              {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea
              value={item.description ?? ''}
              onChange={e => onUpdate(item.id, { description: e.target.value })}
              rows={2}
              placeholder="Descrição (opcional)…"
              className="input-base text-xs w-full resize-none"
            />
          </div>
        </div>
      ))}
      {!items.length && (
        <p className="text-xs text-text-tertiary text-center py-4 border border-dashed border-border-tertiary rounded-lg">
          Nenhum passo adicionado.
        </p>
      )}
    </div>
  )
}

// ── Bars editor (custom-bars) ─────────────────────────────────
function BarsEditor({ items, onAdd, onUpdate, onRemove }) {
  const colorOptions = [
    { v: 'sky', l: 'Sky' }, { v: 'navy', l: 'Navy' }, { v: 'lime', l: 'Lime' },
    { v: 'green', l: 'Green' }, { v: 'yellow', l: 'Yellow' }, { v: 'red', l: 'Red' },
  ]
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Categorias</span>
        <button onClick={onAdd} className="text-xs font-semibold text-donc-navy hover:underline">+ Adicionar categoria</button>
      </div>
      {items.map(item => (
        <div key={item.id} className="bg-bg-secondary rounded-lg p-3 border border-border-tertiary mb-2">
          <div className="flex gap-2 mb-2">
            <input value={item.label} onChange={e => onUpdate(item.id, { label: e.target.value })}
              placeholder="Categoria" className="input-base text-xs flex-1" />
            <input type="number" value={item.value} onChange={e => onUpdate(item.id, { value: e.target.value })}
              placeholder="Valor" className="input-base text-xs w-20" />
            <button onClick={() => onRemove(item.id)} className="text-text-tertiary hover:text-red-500 text-sm">×</button>
          </div>
          <select value={item.color ?? 'sky'} onChange={e => onUpdate(item.id, { color: e.target.value })}
            className="input-base text-xs w-full">
            {colorOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
      ))}
      {!items.length && (
        <p className="text-xs text-text-tertiary text-center py-3">Nenhuma categoria adicionada.</p>
      )}
    </div>
  )
}

// ── Image uploader ────────────────────────────────────────────
function ImageUploader({ imageUrl, caption, uploading, onFile, onCaption }) {
  return (
    <div className="flex flex-col gap-3">
      <label
        className={`block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
          uploading ? 'border-donc-navy/30 bg-bg-secondary' : 'border-border-tertiary hover:border-donc-navy/40 hover:bg-bg-tertiary'
        }`}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        onDragOver={e => e.preventDefault()}
      >
        <input type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" className="hidden"
          disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        {uploading ? (
          <p className="text-xs text-text-tertiary">Enviando…</p>
        ) : imageUrl ? (
          <div>
            <img src={imageUrl} alt="preview" className="max-w-full rounded-lg mx-auto mb-2" style={{ maxHeight: 160 }} />
            <p className="text-xs text-text-tertiary">Clique ou arraste para substituir</p>
          </div>
        ) : (
          <div>
            <SecIcon type="custom-image" className="w-8 h-8 mx-auto mb-2 text-text-tertiary" />
            <p className="text-xs font-medium text-text-secondary mb-1">Arraste ou clique</p>
            <p className="text-xs text-text-tertiary">PNG, JPG ou SVG</p>
          </div>
        )}
      </label>
      <div>
        <label className="text-xs text-text-tertiary block mb-1">Legenda (opcional)</label>
        <input type="text" value={caption} onChange={e => onCaption(e.target.value)}
          placeholder="Legenda da imagem…" className="input-base w-full text-sm" />
      </div>
    </div>
  )
}
