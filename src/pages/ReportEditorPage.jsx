import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReport, useReportMutations } from '../hooks/useClientReports'
import { useClient } from '../hooks/useClient'
import { useProfiles } from '../hooks/useProfiles'
import { useProjects } from '../hooks/useProjects'
import { generateReportHTML, periodLabel } from '../lib/reportGenerator'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

// ─── Seções padrão ───────────────────────────────────────────
const STANDARD_SECTIONS = [
  { key: 'escala',          label: 'Escala da Operação',       icon: '📈', kind: 'auto_text'  },
  { key: 'suporte',         label: 'Suporte',                  icon: '🎫', kind: 'auto_text'  },
  { key: 'projetos',        label: 'Projetos',                 icon: '🗂️', kind: 'auto_text'  },
  { key: 'destaques',       label: 'Destaques do Período',     icon: '⭐', kind: 'manual'     },
  { key: 'contexto',        label: 'Contexto Externo',         icon: '🌐', kind: 'manual'     },
  { key: 'proximos_passos', label: 'Próximos Passos',          icon: '🎯', kind: 'manual'     },
  { key: 'health_score',    label: 'Health Score',             icon: '💚', kind: 'auto_chart' },
  { key: 'health_evolucao', label: 'Evolução Health Score',    icon: '📊', kind: 'auto_chart' },
]

// ─── Helpers ────────────────────────────────────────────────
function normalizeSections(raw = {}) {
  const { _custom, ...rest } = raw
  const out = {}
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'string') out[k] = { content: v, enabled: true }
    else if (v && typeof v === 'object') out[k] = { content: v.content ?? '', enabled: v.enabled !== false }
  }
  for (const s of STANDARD_SECTIONS) {
    if (!out[s.key]) out[s.key] = { content: '', enabled: true }
  }
  return out
}

function getLast4Months(period) {
  const [y, m] = period.split('-').map(Number)
  const months = []
  for (let i = 3; i >= 0; i--) {
    const dt = new Date(y, m - 1 - i, 1)
    months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function prevMonth(period) {
  const [y, m] = period.split('-').map(Number)
  const dt = new Date(y, m - 2, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function buildEscalaText(usage, prevUsage) {
  if (!usage) return ''
  const lines = []
  if (usage.active_users != null) {
    let line = `• Usuários ativos: ${usage.active_users}`
    if (prevUsage?.active_users != null && prevUsage.active_users > 0) {
      const diff = usage.active_users - prevUsage.active_users
      const pct  = Math.round((diff / prevUsage.active_users) * 100)
      line += ` (${diff >= 0 ? '+' : ''}${pct}% vs mês anterior)`
    }
    lines.push(line)
  }
  if (usage.os_created != null) lines.push(`• O.S. criadas no mês: ${usage.os_created}`)
  return lines.join('\n')
}

function buildSuporteText(sup) {
  if (!sup) return ''
  const lines = []
  if (sup.tickets_opened   != null) lines.push(`• Tickets abertos: ${sup.tickets_opened}`)
  if (sup.tickets_resolved != null) lines.push(`• Tickets resolvidos: ${sup.tickets_resolved}`)
  if (sup.sla_first_response != null && sup.sla_first_response > 0)
    lines.push(`• SLA primeira resposta: ${sup.sla_first_response} min`)
  if (sup.n3_pct != null && sup.n3_pct > 0)
    lines.push(`• Tickets N3 (escalados): ${sup.n3_pct}%`)
  return lines.join('\n')
}

function buildProjetosText(projects) {
  if (!projects || projects.length === 0) return ''
  const ativos = projects.filter(p => p.status !== 'concluido' && p.status !== 'suspenso')
  if (ativos.length === 0) return '• Nenhum projeto ativo no momento.'
  return ativos.map(p => {
    const ms = p.milestones ?? []
    const done = ms.filter(m => m.status === 'done').length
    const pct  = ms.length ? Math.round((done / ms.length) * 100) : null
    let line = `• ${p.title}`
    if (pct !== null) line += ` — ${done}/${ms.length} milestones (${pct}%)`
    if (p.end_date) {
      const dt = new Date(p.end_date + 'T00:00:00')
      line += ` · até ${dt.toLocaleDateString('pt-BR')}`
    }
    return line
  }).join('\n')
}

function getHealthStatus(total) {
  if (total == null) return null
  if (total >= 75) return { label: 'Saudável', color: 'text-green-500' }
  if (total >= 50) return { label: 'Atenção',  color: 'text-yellow-500' }
  return { label: 'Risco', color: 'text-red-500' }
}

// ────────────────────────────────────────────────────────────
export default function ReportEditorPage() {
  const { clientId, reportId } = useParams()
  const navigate = useNavigate()

  const { data: report,   isLoading: loadingReport } = useReport(reportId)
  const { data: client,   isLoading: loadingClient } = useClient(clientId)
  const { data: profiles = [] }                       = useProfiles()
  const { data: projects = [] }                       = useProjects(parseInt(clientId, 10))
  const { updateReport, publishReport }               = useReportMutations(parseInt(clientId, 10))

  // ── Core state ──────────────────────────────────────────
  const [sections,      setSections]      = useState({})
  const [customSections, setCustomSections] = useState([])
  const [activeSection, setActiveSection] = useState('escala')

  // ── Modal nova seção ────────────────────────────────────
  const [showNewModal, setShowNewModal] = useState(false)
  const [newLabel,     setNewLabel]     = useState('')
  const [newType,      setNewType]      = useState('text')

  // ── Dados para gráficos / health ────────────────────────
  const [usageHistory,  setUsageHistory]  = useState([])
  const [supportRaw,    setSupportRaw]    = useState(null)
  const [healthHistory, setHealthHistory] = useState([])
  const [dataLoaded,    setDataLoaded]    = useState(false)

  // ── Controles ───────────────────────────────────────────
  const [populated,     setPopulated]     = useState(false)
  const [dragIdx,       setDragIdx]       = useState(null)
  const [dragOverIdx,   setDragOverIdx]   = useState(null)
  const [uploadingImg,  setUploadingImg]  = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishBanner, setPublishBanner] = useState(false)

  // ── Effect 1: Carrega seções do relatório ───────────────
  useEffect(() => {
    if (!report) return
    const { _custom = [], ...rest } = report.sections ?? {}
    setSections(normalizeSections({ ...rest }))
    setCustomSections(Array.isArray(_custom) ? _custom : [])
  }, [report?.id])

  // ── Effect 2: Busca dados de gráficos / suporte ─────────
  useEffect(() => {
    if (!clientId || !report?.period) return
    const period = report.period
    const months = getLast4Months(period)

    ;(async () => {
      const [{ data: hist }, { data: sup }, healthHist] = await Promise.all([
        supabase.from('client_usage')
          .select('ref_month,os_created,active_users')
          .eq('client_id', clientId)
          .in('ref_month', months),
        supabase.from('client_support')
          .select('*')
          .eq('client_id', clientId)
          .eq('ref_month', period)
          .maybeSingle(),
        supabase.from('client_health_history')
          .select('ref_month,health_total')
          .eq('client_id', clientId)
          .order('ref_month', { ascending: true })
          .limit(12)
          .then(r => r.data ?? [])
          .catch(() => []),
      ])
      setUsageHistory(hist ?? [])
      setSupportRaw(sup ?? null)
      setHealthHistory(healthHist)
      setDataLoaded(true)
    })()
  }, [clientId, report?.period])

  // ── Effect 3: Auto-popula seções em relatórios novos ────
  useEffect(() => {
    if (!dataLoaded || !report || populated) return
    const isEmpty = Object.keys(report.sections ?? {}).length === 0
    if (!isEmpty) { setPopulated(true); return }

    const period = report.period
    const prev   = prevMonth(period)
    const current = usageHistory.find(u => u.ref_month === period) ?? null
    const prevU   = usageHistory.find(u => u.ref_month === prev)   ?? null

    setSections(prev => {
      const updated = { ...prev }
      if (!updated.escala?.content)
        updated.escala   = { content: buildEscalaText(current, prevU), enabled: true }
      if (!updated.suporte?.content)
        updated.suporte  = { content: buildSuporteText(supportRaw), enabled: true }
      if (!updated.projetos?.content)
        updated.projetos = { content: buildProjetosText(projects), enabled: true }
      return updated
    })
    setPopulated(true)
  }, [dataLoaded, report?.id, projects.length, populated])

  // ── CSM ─────────────────────────────────────────────────
  const csm = useMemo(() => {
    if (!client?.csm_id) return null
    return profiles.find(p => p.id === client.csm_id) ?? null
  }, [client, profiles])

  // ── Health data (vem do objeto client) ──────────────────
  const healthData = useMemo(() => {
    if (!client) return null
    const fields = ['health_total','health_uso','health_suporte','health_relacionamento','health_financeiro','health_projeto']
    const h = {}
    let hasAny = false
    for (const f of fields) {
      if (client[f] != null) { h[f] = client[f]; hasAny = true }
    }
    return hasAny ? h : null
  }, [client])

  // ── Sections combinadas (standard + custom) ─────────────
  const allSections = useMemo(
    () => ({ ...sections, _custom: customSections }),
    [sections, customSections]
  )

  // ── HTML em tempo real ──────────────────────────────────
  const html = useMemo(() => {
    if (!client || !report) return ''
    return generateReportHTML(
      client,
      { ...report, sections: allSections },
      csm,
      { usageHistory, supportRaw, healthData, healthHistory }
    )
  }, [client, report, allSections, csm, usageHistory, supportRaw, healthData, healthHistory])

  // ── Helpers de seção padrão ─────────────────────────────
  function getSec(key) { return sections[key] ?? { content: '', enabled: true } }
  function setSec(key, changes) {
    setSections(prev => ({ ...prev, [key]: { ...getSec(key), ...changes } }))
  }
  function toggleEnabled(key)        { setSec(key, { enabled: !getSec(key).enabled }) }
  function updateContent(key, value) { setSec(key, { content: value }) }

  // ── Helpers de seção customizada ────────────────────────
  function updateCustom(id, changes) {
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s))
  }
  function deleteCustom(id) {
    setCustomSections(prev => prev.filter(s => s.id !== id))
    if (activeSection === id) setActiveSection('escala')
  }

  function handleDrop(toIdx) {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setDragOverIdx(null); return }
    const next = [...customSections]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(toIdx, 0, moved)
    setCustomSections(next)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  // ── Adicionar nova seção ────────────────────────────────
  function addSection() {
    if (!newLabel.trim()) return
    const id = `custom_${Date.now()}`
    setCustomSections(prev => [
      ...prev,
      { id, label: newLabel.trim(), type: newType, content: '', enabled: true, chartTitle: '' },
    ])
    setActiveSection(id)
    setShowNewModal(false)
    setNewLabel('')
    setNewType('text')
  }

  // ── Upload de imagem ─────────────────────────────────────
  async function handleImageUpload(file, sectionId) {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG ou SVG.')
      return
    }
    setUploadingImg(sectionId)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${clientId}/${sectionId}.${ext}`
      const { error } = await supabase.storage
        .from('report-images')
        .upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('report-images').getPublicUrl(path)
      updateCustom(sectionId, { content: data.publicUrl })
      toast.success('Imagem enviada!')
    } catch (e) {
      toast.error('Erro no upload: ' + e.message)
    } finally {
      setUploadingImg(null)
    }
  }

  // ── Salvar / Publicar ───────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      await updateReport.mutateAsync({ id: reportId, sections: allSections, html_content: html })
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      await updateReport.mutateAsync({ id: reportId, sections: allSections, html_content: html })
      await publishReport.mutateAsync({ id: reportId, html_content: html })
      setPublishBanner(true)
    } finally {
      setPublishing(false)
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/r/${report.public_token}`
    navigator.clipboard.writeText(url)
    toast.success('Link copiado!')
  }

  // ── Render guard ────────────────────────────────────────
  if (loadingReport || loadingClient) return <PageSpinner />
  if (!report || !client) {
    return <div className="p-6 text-text-tertiary">Relatório não encontrado.</div>
  }

  const clientName = client.fantasy_name || client.name
  const isPublished = report.status === 'published'

  // Seção ativa
  const activeStd    = STANDARD_SECTIONS.find(s => s.key === activeSection)
  const activeCustom = customSections.find(s => s.id === activeSection)

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-secondary">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-tertiary bg-bg-primary flex-shrink-0">
        <button
          onClick={() => navigate(`/empresas/${clientId}?tab=operacional&sub=relatorios`)}
          className="text-xs text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
        >
          ← {clientName}
        </button>
        <div className="w-px h-4 bg-border-tertiary flex-shrink-0" />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-text-primary truncate">{report.title}</span>
          <span className="text-xs text-text-tertiary flex-shrink-0">{periodLabel(report.period)}</span>
          <Badge variant={isPublished ? 'green' : 'slate'}>
            {isPublished ? 'Publicado' : 'Rascunho'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isPublished && (
            <Button variant="secondary" size="sm" onClick={copyLink}>🔗 Copiar Link</Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving || updateReport.isPending}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {!isPublished && (
            <Button size="sm" onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando…' : '🚀 Publicar'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Coluna esquerda */}
        <div className="w-[480px] flex-shrink-0 flex border-r border-border-tertiary bg-bg-primary overflow-hidden">

          {/* Lista de seções (sidebar vertical) */}
          <div className="w-[160px] flex-shrink-0 border-r border-border-tertiary flex flex-col overflow-hidden bg-bg-secondary">
            <div className="px-3 py-2 text-[10px] font-bold text-text-tertiary uppercase tracking-wider border-b border-border-tertiary">
              Seções
            </div>
            <div className="flex-1 overflow-y-auto py-1">

              {/* Seções padrão */}
              {STANDARD_SECTIONS.map(s => {
                const sec = getSec(s.key)
                const isActive = activeSection === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors ${
                      isActive
                        ? 'bg-donc-navy text-white'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    } ${!sec.enabled ? 'opacity-40' : ''}`}
                  >
                    <span className="text-xs flex-shrink-0">{s.icon}</span>
                    <span className="text-[11px] leading-tight truncate">{s.label}</span>
                  </button>
                )
              })}

              {/* Divisor customizadas */}
              <div className="px-2.5 pt-3 pb-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                Customizadas
              </div>

              {/* Seções customizadas (draggable) */}
              {customSections.map((sec, i) => (
                <div
                  key={sec.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i) }}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className={`group flex items-center gap-1 px-1 py-1 transition-colors ${
                    activeSection === sec.id ? 'bg-donc-navy/10' : 'hover:bg-bg-tertiary'
                  } ${dragOverIdx === i && dragIdx !== i ? 'border-t-2 border-donc-navy' : ''}`}
                >
                  <span className="text-text-tertiary cursor-grab text-xs pl-1 flex-shrink-0">⠿</span>
                  <button
                    onClick={() => setActiveSection(sec.id)}
                    className={`flex-1 text-[11px] text-left truncate min-w-0 ${
                      !sec.enabled ? 'opacity-40 line-through' : ''
                    } ${activeSection === sec.id ? 'text-donc-navy font-semibold' : 'text-text-secondary'}`}
                    title={sec.label}
                  >
                    📌 {sec.label}
                  </button>
                  <button
                    onClick={() => deleteCustom(sec.id)}
                    className="text-text-tertiary hover:text-red-500 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pr-1"
                    title="Remover seção"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* + Nova Seção */}
            <div className="p-2 border-t border-border-tertiary">
              <button
                onClick={() => setShowNewModal(true)}
                className="w-full text-[11px] font-semibold text-donc-navy hover:bg-bg-tertiary rounded px-2 py-1.5 transition-colors text-left"
              >
                + Nova Seção
              </button>
            </div>
          </div>

          {/* Editor da seção ativa */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4">
              {activeStd && <StandardSectionEditor
                section={activeStd}
                sec={getSec(activeStd.key)}
                onToggle={() => toggleEnabled(activeStd.key)}
                onContent={v => updateContent(activeStd.key, v)}
                healthData={healthData}
              />}
              {activeCustom && <CustomSectionEditor
                sec={activeCustom}
                onToggle={() => updateCustom(activeCustom.id, { enabled: !activeCustom.enabled })}
                onContent={v => updateCustom(activeCustom.id, { content: v })}
                onChartTitle={v => updateCustom(activeCustom.id, { chartTitle: v })}
                onImageUpload={file => handleImageUpload(file, activeCustom.id)}
                uploading={uploadingImg === activeCustom.id}
              />}
            </div>
          </div>
        </div>

        {/* Preview HTML */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border-tertiary bg-bg-primary">
            <span className="text-xs text-text-tertiary">Preview em tempo real</span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <iframe
              srcDoc={html}
              title="Preview do relatório"
              className="w-full rounded-lg shadow border border-border-tertiary"
              style={{ height: 'calc(100vh - 120px)', minHeight: 500 }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>

      {/* ── Banner de publicação ── */}
      {publishBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-donc-verde text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50">
          <span className="text-sm font-semibold">✅ Relatório publicado!</span>
          <button onClick={copyLink} className="text-xs font-semibold underline underline-offset-2 hover:no-underline">
            Copiar link
          </button>
          <button onClick={() => setPublishBanner(false)} className="text-white/70 hover:text-white text-lg leading-none ml-2">×</button>
        </div>
      )}

      {/* ── Modal Nova Seção ── */}
      {showNewModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}
        >
          <div className="bg-bg-primary rounded-xl p-6 w-80 shadow-2xl border border-border-tertiary">
            <h3 className="text-sm font-bold text-text-primary mb-4">+ Nova Seção</h3>

            <div className="mb-3">
              <label className="text-xs text-text-tertiary block mb-1">Título</label>
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSection()}
                placeholder="Nome da seção…"
                className="input-base w-full text-sm"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="text-xs text-text-tertiary block mb-1">Tipo</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                className="input-base w-full text-sm"
              >
                <option value="text">Texto</option>
                <option value="image">Imagem</option>
                <option value="chart">Gráfico de Barras</option>
              </select>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowNewModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="flex-1" onClick={addSection} disabled={!newLabel.trim()}>
                Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Editor de seção padrão ──────────────────────────────────
function StandardSectionEditor({ section, sec, onToggle, onContent, healthData }) {
  const isAutoChart = section.kind === 'auto_chart'
  const isAutoText  = section.kind === 'auto_text'

  return (
    <div className="flex flex-col gap-3">
      {/* Header: título + toggle */}
      <div className="flex items-center justify-between">
        <label className={`text-sm font-semibold ${sec.enabled ? 'text-text-primary' : 'text-text-tertiary'}`}>
          {section.icon} {section.label}
        </label>
        <ToggleSwitch enabled={sec.enabled} onToggle={onToggle} />
      </div>

      {/* Conteúdo cinzento se desabilitado */}
      <div className={sec.enabled ? '' : 'opacity-40 pointer-events-none'}>

        {isAutoText && (
          <div className="text-xs text-text-tertiary mb-3 p-2.5 bg-bg-secondary rounded-md border border-border-tertiary">
            💡 Pré-populada automaticamente com dados do período. Edite à vontade.
          </div>
        )}

        {isAutoChart && section.key === 'health_score' && (
          <HealthScorePreview healthData={healthData} />
        )}

        {isAutoChart && section.key === 'health_evolucao' && (
          <div className="text-xs text-text-tertiary p-3 bg-bg-secondary rounded-md border border-border-tertiary">
            📊 Gráfico de linha gerado automaticamente com o histórico de Health Score do cliente.
          </div>
        )}

        {!isAutoChart && (
          <>
            <textarea
              value={sec.content}
              onChange={e => onContent(e.target.value)}
              rows={16}
              placeholder={`Conteúdo de "${section.label}"…`}
              className="input-base w-full resize-none text-sm leading-relaxed"
              style={{ minHeight: 280 }}
            />
            <button
              disabled
              title="Sugerir com IA — Em breve"
              className="mt-2 text-xs text-text-tertiary border border-border-secondary rounded-md px-2.5 py-1 opacity-40 cursor-not-allowed"
            >
              ✨ Sugerir com IA
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Editor de seção customizada ─────────────────────────────
function CustomSectionEditor({ sec, onToggle, onContent, onChartTitle, onImageUpload, uploading }) {
  function handleFileDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) onImageUpload(file)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className={`text-sm font-semibold ${sec.enabled ? 'text-text-primary' : 'text-text-tertiary'}`}>
          📌 {sec.label}
          <span className="ml-2 text-xs font-normal text-text-tertiary capitalize">({sec.type})</span>
        </label>
        <ToggleSwitch enabled={sec.enabled} onToggle={onToggle} />
      </div>

      <div className={sec.enabled ? '' : 'opacity-40 pointer-events-none'}>

        {sec.type === 'text' && (
          <>
            <textarea
              value={sec.content}
              onChange={e => onContent(e.target.value)}
              rows={16}
              placeholder={`Conteúdo de "${sec.label}"…`}
              className="input-base w-full resize-none text-sm leading-relaxed"
              style={{ minHeight: 280 }}
            />
            <button
              disabled
              title="Sugerir com IA — Em breve"
              className="mt-2 text-xs text-text-tertiary border border-border-secondary rounded-md px-2.5 py-1 opacity-40 cursor-not-allowed"
            >
              ✨ Sugerir com IA
            </button>
          </>
        )}

        {sec.type === 'image' && (
          <div>
            <label
              className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                uploading ? 'border-donc-navy/40 bg-bg-secondary' : 'border-border-tertiary hover:border-donc-navy/50 hover:bg-bg-tertiary'
              }`}
              onDrop={handleFileDrop}
              onDragOver={e => e.preventDefault()}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                className="hidden"
                disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) onImageUpload(f) }}
              />
              {uploading ? (
                <p className="text-xs text-text-tertiary">Enviando…</p>
              ) : sec.content ? (
                <div>
                  <img src={sec.content} alt="preview" className="max-w-full rounded-lg mx-auto mb-2" style={{ maxHeight: 180 }} />
                  <p className="text-xs text-text-tertiary">Clique ou arraste para substituir</p>
                </div>
              ) : (
                <div>
                  <div className="text-2xl mb-2">🖼️</div>
                  <p className="text-xs font-medium text-text-secondary mb-1">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-text-tertiary">PNG, JPG ou SVG</p>
                </div>
              )}
            </label>
          </div>
        )}

        {sec.type === 'chart' && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-text-tertiary block mb-1">Título do gráfico (opcional)</label>
              <input
                type="text"
                value={sec.chartTitle ?? ''}
                onChange={e => onChartTitle(e.target.value)}
                placeholder="Ex: Crescimento mensal"
                className="input-base w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-tertiary block mb-1">Dados (CSV: Label,Valor por linha)</label>
              <textarea
                value={sec.content}
                onChange={e => onContent(e.target.value)}
                rows={10}
                placeholder={'Jan,45\nFev,52\nMar,38\nAbr,61'}
                className="input-base w-full resize-none text-sm font-mono leading-relaxed"
                style={{ minHeight: 200 }}
              />
            </div>
            <p className="text-xs text-text-tertiary">
              Gráfico de barras gerado automaticamente no relatório.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Toggle switch ───────────────────────────────────────────
function ToggleSwitch({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={enabled ? 'Incluído no relatório' : 'Excluído do relatório'}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        enabled ? 'bg-donc-navy' : 'bg-border-secondary'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

// ─── Preview rápido do Health Score no editor ─────────────────
function HealthScorePreview({ healthData }) {
  if (!healthData) {
    return (
      <div className="text-xs text-text-tertiary p-3 bg-bg-secondary rounded-md border border-border-tertiary">
        💚 Dados de Health Score não encontrados para este cliente.
      </div>
    )
  }
  const total  = healthData.health_total
  const status = getHealthStatus(total)
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
        {status && <span className={`font-semibold ${status.color}`}>{status.label}</span>}
        <span className="text-text-tertiary">Health Score atual</span>
      </div>
      <div className="flex flex-col gap-1">
        {dims.map(d => (
          <div key={d.key} className="flex items-center gap-2">
            <span className="w-24 text-text-tertiary truncate">{d.label}</span>
            <div className="flex-1 bg-border-tertiary rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-donc-navy/60 rounded-full"
                style={{ width: `${Math.min(healthData[d.key] ?? 0, 100)}%` }}
              />
            </div>
            <span className="w-6 text-right text-text-secondary font-semibold">{healthData[d.key] ?? '—'}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-text-tertiary">Card visual gerado automaticamente no relatório.</p>
    </div>
  )
}
