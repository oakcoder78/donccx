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

// ─── Definição das seções ────────────────────────────────────
const SECTIONS = [
  { key: 'escala',          label: 'Escala da Operação',  icon: '📈', auto: true  },
  { key: 'suporte',         label: 'Suporte',             icon: '🎫', auto: true  },
  { key: 'projetos',        label: 'Projetos',            icon: '🗂️', auto: true  },
  { key: 'destaques',       label: 'Destaques do Período',icon: '⭐', auto: false },
  { key: 'contexto',        label: 'Contexto Externo',    icon: '🌐', auto: false },
  { key: 'proximos_passos', label: 'Próximos Passos',     icon: '🎯', auto: false },
]

// ─── Monta texto automático de Escala (client_usage) ────────
function buildEscalaText(usage, prevUsage) {
  if (!usage) return ''
  const lines = []
  if (usage.active_users != null) {
    let line = `• Usuários ativos: ${usage.active_users}`
    if (prevUsage?.active_users != null) {
      const diff = usage.active_users - prevUsage.active_users
      const pct  = prevUsage.active_users > 0
        ? Math.round((diff / prevUsage.active_users) * 100)
        : null
      if (pct !== null) {
        line += ` (${diff >= 0 ? '+' : ''}${pct}% vs mês anterior)`
      }
    }
    lines.push(line)
  }
  if (usage.os_created != null) {
    lines.push(`• O.S. criadas no mês: ${usage.os_created}`)
  }
  return lines.join('\n')
}

// ─── Monta texto automático de Suporte (client_support) ─────
function buildSuporteText(sup) {
  if (!sup) return ''
  const lines = []
  if (sup.tickets_opened  != null) lines.push(`• Tickets abertos: ${sup.tickets_opened}`)
  if (sup.tickets_resolved!= null) lines.push(`• Tickets resolvidos: ${sup.tickets_resolved}`)
  if (sup.sla_first_response!= null && sup.sla_first_response > 0)
    lines.push(`• SLA primeira resposta: ${sup.sla_first_response}%`)
  if (sup.n3_pct != null && sup.n3_pct > 0)
    lines.push(`• Tickets N3 (escalados): ${sup.n3_pct}%`)
  return lines.join('\n')
}

// ─── Monta texto automático de Projetos ─────────────────────
function buildProjetosText(projects) {
  if (!projects || projects.length === 0) return ''
  const ativos = projects.filter(p => p.status !== 'concluido' && p.status !== 'suspenso')
  if (ativos.length === 0) return '• Nenhum projeto ativo no momento.'
  const lines = ativos.map(p => {
    const ms    = p.milestones ?? []
    const total = ms.length
    const done  = ms.filter(m => m.status === 'done').length
    const pct   = total ? Math.round((done / total) * 100) : null
    let line    = `• ${p.title}`
    if (pct !== null) line += ` — ${done}/${total} milestones (${pct}%)`
    if (p.end_date) {
      const dt = new Date(p.end_date + 'T00:00:00')
      line += ` · até ${dt.toLocaleDateString('pt-BR')}`
    }
    return line
  })
  return lines.join('\n')
}

// ─── Calcula mês anterior ────────────────────────────────────
function prevMonth(period) {
  const [y, m] = period.split('-').map(Number)
  const dt = new Date(y, m - 2, 1) // m-2 porque month é 0-indexed
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

// ────────────────────────────────────────────────────────────
export default function ReportEditorPage() {
  const { clientId, reportId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const { data: report,   isLoading: loadingReport } = useReport(reportId)
  const { data: client,   isLoading: loadingClient } = useClient(clientId)
  const { data: profiles = [] }                       = useProfiles()
  const { data: projects = [] }                       = useProjects(parseInt(clientId, 10))
  const { updateReport, publishReport }               = useReportMutations(parseInt(clientId, 10))

  const [sections,        setSections]        = useState({})
  const [activeSection,   setActiveSection]   = useState('escala')
  const [saving,          setSaving]          = useState(false)
  const [publishing,      setPublishing]      = useState(false)
  const [publishBanner,   setPublishBanner]   = useState(false)
  const [populated,       setPopulated]       = useState(false)

  // ── Carrega seções do relatório ──────────────────────────
  useEffect(() => {
    if (report) setSections(report.sections ?? {})
  }, [report?.id])

  // ── Auto-popula seções automáticas se o relatório é novo ─
  useEffect(() => {
    if (!report || populated) return
    const isEmpty = Object.keys(report.sections ?? {}).length === 0
    if (!isEmpty) { setPopulated(true); return }

    ;(async () => {
      const period = report.period
      const prev   = prevMonth(period)

      const [{ data: usage }, { data: usagePrev }, { data: suporte }] = await Promise.all([
        supabase.from('client_usage').select('*')
          .eq('client_id', clientId).eq('ref_month', period).maybeSingle(),
        supabase.from('client_usage').select('*')
          .eq('client_id', clientId).eq('ref_month', prev).maybeSingle(),
        supabase.from('client_support').select('*')
          .eq('client_id', clientId).eq('ref_month', period).maybeSingle(),
      ])

      const auto = {
        escala:   buildEscalaText(usage, usagePrev),
        suporte:  buildSuporteText(suporte),
        projetos: buildProjetosText(projects),
      }

      setSections(prev => ({ ...auto, ...prev }))
      setPopulated(true)
    })()
  }, [report?.id, projects.length, populated])

  // ── CSM do cliente ───────────────────────────────────────
  const csm = useMemo(() => {
    if (!client?.csm_id) return null
    return profiles.find(p => p.id === client.csm_id) ?? null
  }, [client, profiles])

  // ── Geração do HTML em tempo real ───────────────────────
  const html = useMemo(() => {
    if (!client || !report) return ''
    return generateReportHTML(client, { ...report, sections }, csm)
  }, [client, report, sections, csm])

  function updateSection(key, value) {
    setSections(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateReport.mutateAsync({ id: reportId, sections, html_content: html })
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      // Salva primeiro, depois publica
      await updateReport.mutateAsync({ id: reportId, sections, html_content: html })
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

  // ─────────────────────────────────────────────────────────
  if (loadingReport || loadingClient) return <PageSpinner />
  if (!report || !client) {
    return (
      <div className="p-6 text-text-tertiary">
        Relatório não encontrado.
      </div>
    )
  }

  const clientName = client.fantasy_name || client.name
  const isPublished = report.status === 'published'

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
          <Badge variant={isPublished ? 'green' : 'slate'} >
            {isPublished ? 'Publicado' : 'Rascunho'}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isPublished && (
            <Button variant="secondary" size="sm" onClick={copyLink}>
              🔗 Copiar Link
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSave}
            disabled={saving || updateReport.isPending}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {!isPublished && (
            <Button size="sm" onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publicando…' : '🚀 Publicar'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Corpo: duas colunas ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Coluna esquerda: editor de seções */}
        <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-border-tertiary bg-bg-primary overflow-hidden">

          {/* Tabs de seção */}
          <div className="p-3 border-b border-border-tertiary bg-bg-secondary">
            <div className="flex flex-wrap gap-1">
              {SECTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeSection === s.key
                      ? 'bg-donc-navy text-white'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editor da seção ativa */}
          <div className="flex-1 overflow-y-auto p-4">
            {SECTIONS.filter(s => s.key === activeSection).map(s => (
              <div key={s.key} className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-text-primary">
                    {s.icon} {s.label}
                  </label>
                  <button
                    disabled
                    title="Sugerir com IA — Em breve (Fase 2)"
                    className="text-xs text-text-tertiary border border-border-secondary rounded-md px-2.5 py-1 opacity-40 cursor-not-allowed transition-colors"
                  >
                    ✨ Sugerir com IA
                  </button>
                </div>

                {s.auto && (
                  <div className="text-xs text-text-tertiary mb-3 p-2.5 bg-bg-secondary rounded-md border border-border-tertiary">
                    💡 Pré-populada automaticamente com dados do período. Edite à vontade.
                  </div>
                )}

                <textarea
                  value={sections[s.key] ?? ''}
                  onChange={e => updateSection(s.key, e.target.value)}
                  rows={18}
                  placeholder={`Escreva o conteúdo de "${s.label}" aqui…`}
                  className="input-base w-full flex-1 resize-none text-sm leading-relaxed"
                  style={{ minHeight: 320 }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita: preview HTML */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border-tertiary bg-bg-primary flex items-center justify-between">
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
          <button
            onClick={copyLink}
            className="text-xs font-semibold underline underline-offset-2 hover:no-underline"
          >
            Copiar link
          </button>
          <button
            onClick={() => setPublishBanner(false)}
            className="text-white/70 hover:text-white text-lg leading-none ml-2"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
