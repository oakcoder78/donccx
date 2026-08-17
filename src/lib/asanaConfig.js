/**
 * asanaConfig.js
 *
 * Acesso à API do Asana via asana-proxy (edge function) e persistência da
 * configuração da integração em freshdesk_config (key='asana_config').
 */

import { supabase } from './supabaseClient'

// ── Helper: chamada ao asana-proxy ───────────────────────────────────────────
async function asanaCall({ path, method = 'GET', body, params }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asana-proxy`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, method, body, params }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data?.errors?.[0]?.message || data?.error || `Asana error ${res.status} em ${path}`
    throw new Error(msg)
  }
  return data
}

// ── Lê a configuração da integração ──────────────────────────────────────────
export async function getAsanaConfig() {
  const { data, error } = await supabase
    .from('freshdesk_config')
    .select('data')
    .eq('key', 'asana_config')
    .maybeSingle()
  if (error) throw new Error(`Erro ao ler asana_config: ${error.message}`)
  return data?.data ?? null
}

// ── Salva a configuração da integração ───────────────────────────────────────
export async function saveAsanaConfig(config) {
  const { error } = await supabase
    .from('freshdesk_config')
    .upsert(
      { key: 'asana_config', data: config, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) throw new Error(`Erro ao salvar asana_config: ${error.message}`)
}

// ── Lista workspaces do Asana ────────────────────────────────────────────────
export async function listAsanaWorkspaces() {
  const data = await asanaCall({ path: '/workspaces', params: { opt_fields: 'name', limit: '100' } })
  return data?.data ?? []
}

// ── Lista projetos de um workspace ───────────────────────────────────────────
export async function listAsanaProjects(workspaceGid) {
  if (!workspaceGid) return []
  const data = await asanaCall({
    path: `/workspaces/${workspaceGid}/projects`,
    params: { opt_fields: 'name,archived', limit: '100' },
  })
  return (data?.data ?? []).filter(p => !p.archived)
}

// ── Lista seções de um projeto ───────────────────────────────────────────────
export async function listAsanaSections(projectGid) {
  if (!projectGid) return []
  const data = await asanaCall({
    path: `/projects/${projectGid}/sections`,
    params: { opt_fields: 'name', limit: '100' },
  })
  return data?.data ?? []
}

// ── Cria tarefa no Asana ─────────────────────────────────────────────────────
// payload: { name, notes, projects: [gid], section_gid?, assignee?, due_on? }
export async function createAsanaTask(payload) {
  const data = await asanaCall({
    path: '/tasks',
    method: 'POST',
    body: { data: payload },
    params: { opt_fields: 'name,permalink_url' },
  })
  return data?.data ?? null
}