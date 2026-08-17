import { useState, useEffect } from 'react'
import { Icons } from '@/lib/icons'
import { supabase } from '@/lib/supabaseClient'
import {
  getAsanaConfig,
  saveAsanaConfig,
  listAsanaWorkspaces,
  listAsanaProjects,
  listAsanaSections,
} from '@/lib/asanaConfig'
import { Button } from '../ui/Button'
import { PageSpinner } from '../ui/Spinner'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import toast from 'react-hot-toast'

// ── Painel de configuração da integração Asana ───────────────────────────────
export function SettingsAsana() {
  const AsanaIcon = Icons.FolderKanban

  const [loading,      setLoading]     = useState(true)
  const [enabled,      setEnabled]     = useState(false)
  const [workspaces,   setWorkspaces]  = useState([])
  const [projects,     setProjects]    = useState([])
  const [sections,     setSections]    = useState([])
  const [workspaceGid, setWorkspaceGid] = useState('')
  const [projectGid,   setProjectGid]   = useState('')
  const [sectionGid,   setSectionGid]   = useState('')
  const [projectName,  setProjectName]  = useState('')
  const [sectionName,  setSectionName]  = useState('')
  const [saving,       setSaving]       = useState(false)

  // Carrega config + workspaces em paralelo
  useEffect(() => {
    ;(async () => {
      try {
        const [config, ws] = await Promise.all([getAsanaConfig(), listAsanaWorkspaces()])
        setWorkspaces(ws)
        if (config) {
          setEnabled(config.enabled ?? false)
          setWorkspaceGid(config.workspace_gid ?? '')
          setProjectGid(config.project_gid ?? '')
          setSectionGid(config.section_gid ?? '')
          setProjectName(config.project_name ?? '')
          setSectionName(config.section_name ?? '')
          if (config.workspace_gid) {
            const projs = await listAsanaProjects(config.workspace_gid)
            setProjects(projs)
            if (config.project_gid) {
              const secs = await listAsanaSections(config.project_gid)
              setSections(secs)
            }
          }
        }
      } catch (e) {
        toast.error(e.message || 'Erro ao carregar configuração do Asana')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleWorkspaceChange(gid) {
    setWorkspaceGid(gid)
    setProjectGid('')
    setSectionGid('')
    setProjectName('')
    setSectionName('')
    setProjects([])
    setSections([])
    if (!gid) return
    try {
      const projs = await listAsanaProjects(gid)
      setProjects(projs)
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar projetos')
    }
  }

  async function handleProjectChange(gid) {
    setProjectGid(gid)
    setSectionGid('')
    setSectionName('')
    setSections([])
    const proj = projects.find(p => p.gid === gid)
    setProjectName(proj?.name ?? '')
    if (!gid) return
    try {
      const secs = await listAsanaSections(gid)
      setSections(secs)
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar seções')
    }
  }

  function handleSectionChange(gid) {
    setSectionGid(gid)
    const sec = sections.find(s => s.gid === gid)
    setSectionName(sec?.name ?? '')
  }

  async function handleSave() {
    if (!workspaceGid || !projectGid) {
      toast.error('Selecione workspace e projeto antes de salvar')
      return
    }
    setSaving(true)
    try {
      const config = {
        enabled,
        workspace_gid: workspaceGid,
        project_gid:   projectGid,
        project_name:  projectName,
        section_gid:   sectionGid || null,
        section_name:  sectionName || null,
      }
      await saveAsanaConfig(config)
      toast.success('Configuração do Asana salva')
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar configuração')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="max-w-6xl space-y-4">

      <SettingsSectionHeader
        icon={AsanaIcon}
        title="Integração Asana"
        subtitle="Registre tickets de atendimento como tarefas no Asana, no projeto e na seção escolhidos."
      />

      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Ativar integração</p>
            <p className="text-sm text-text-tertiary">
              Exibe a opção de registrar no Asana após criar um ticket no Freshdesk.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 rounded-full bg-bg-tertiary peer-checked:bg-donc-verde relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-sm">Workspace</label>
            <select
              value={workspaceGid}
              onChange={e => handleWorkspaceChange(e.target.value)}
              className="input-base"
            >
              <option value="">Selecione…</option>
              {workspaces.map(w => (
                <option key={w.gid} value={w.gid}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-sm">Projeto</label>
            <select
              value={projectGid}
              onChange={e => handleProjectChange(e.target.value)}
              className="input-base"
              disabled={!workspaceGid}
            >
              <option value="">{workspaceGid ? 'Selecione…' : 'Escolha o workspace primeiro'}</option>
              {projects.map(p => (
                <option key={p.gid} value={p.gid}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-sm">Seção (quadro)</label>
            <select
              value={sectionGid}
              onChange={e => handleSectionChange(e.target.value)}
              className="input-base"
              disabled={!projectGid}
            >
              <option value="">{projectGid ? 'Sem seção específica' : 'Escolha o projeto primeiro'}</option>
              {sections.map(s => (
                <option key={s.gid} value={s.gid}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </Button>
      </div>
    </div>
  )
}