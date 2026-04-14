/**
 * freshdeskConfig.js
 *
 * Busca configurações do Freshdesk (grupos, agentes, campos de ticket)
 * via freshdesk-proxy e persiste em freshdesk_config no Supabase.
 */

import { supabase } from './supabaseClient'

// ── Helper: GET via freshdesk-proxy ──────────────────────────────────────────
async function fdGet(path, token) {
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/freshdesk-proxy`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Freshdesk error ${res.status} em ${path}`)
  }
  return res.json()
}

/**
 * Busca grupos, agentes e campos de ticket do Freshdesk em paralelo
 * e salva cada resultado em freshdesk_config com upsert por key.
 *
 * @throws {Error} se a sessão estiver expirada ou qualquer chamada falhar
 */
export async function fetchAndSaveFreshdeskConfig() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const token = session.access_token

  const [groups, agents, ticket_fields] = await Promise.all([
    fdGet('/groups', token),
    fdGet('/agents', token),
    fdGet('/ticket_fields', token),
  ])

  const items = [
    { key: 'groups',        data: groups },
    { key: 'agents',        data: agents },
    { key: 'ticket_fields', data: ticket_fields },
    { key: 'last_sync',     data: { synced_at: new Date().toISOString() } },
  ]

  for (const item of items) {
    const { error } = await supabase
      .from('freshdesk_config')
      .upsert(
        { key: item.key, data: item.data, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) throw new Error(`Erro ao salvar configuração '${item.key}': ${error.message}`)
  }
}

/**
 * Lê uma configuração do Freshdesk pelo key.
 *
 * @param {string} key — ex: 'groups', 'agents', 'ticket_fields', 'last_sync'
 * @returns {Promise<any|null>} o objeto data ou null se não encontrado
 */
export async function getFreshdeskConfig(key) {
  const { data, error } = await supabase
    .from('freshdesk_config')
    .select('data')
    .eq('key', key)
    .maybeSingle()

  if (error) throw new Error(`Erro ao ler freshdesk_config['${key}']: ${error.message}`)
  return data?.data ?? null
}
