import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icons } from '@/lib/icons'
import { supabase } from '@/lib/supabaseClient'
import { fetchCompaniesFreshdesk, syncAllCompanies } from '@/lib/freshdeskSync'
import { fetchAndSaveFreshdeskConfig, getFreshdeskConfig } from '@/lib/freshdeskConfig'
import { Button } from '../ui/Button'
import { PageSpinner } from '../ui/Spinner'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import toast from 'react-hot-toast'

// ── Normalização para matching ────────────────────────────────────────────────
function normalize(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltda|s\.?a\.?|eireli|me|epp|inc|corp|group|grupo)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDateTimeBR(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} às ${hours}:${minutes}`
}

function computeSuggestion(client, fdCompanies) {
  const cNames = [client.name, client.fantasy_name].filter(Boolean).map(normalize).filter(n => n.length > 2)
  const cSite  = client.site
    ? client.site.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase()
    : null

  let best = null; let bestScore = 0

  for (const fd of fdCompanies) {
    const fdName    = normalize(fd.name)
    const fdDomains = (fd.domains ?? []).map(d => d.toLowerCase())
    let score = 0

    if (cNames.some(n => n === fdName && n.length > 2)) score = 100
    else if (cSite && fdDomains.some(d =>
      d === cSite || (cSite.length > 4 && cSite.includes(d)) || (d.length > 4 && d.includes(cSite))
    )) score = 90
    else if (cNames.some(n => n.length > 4 && fdName.length > 4 && (fdName.includes(n) || n.includes(fdName)))) score = 70

    if (score > bestScore) { bestScore = score; best = { fdId: fd.id, fdName: fd.name, score } }
  }
  return best && bestScore >= 70 ? best : null
}

// ── Seção Mapeamento ──────────────────────────────────────────────────────────
function MappingSection() {
  const SearchIcon = Icons.Search
  const [clients, setClients]         = useState([])
  const [edits, setEdits]             = useState({})         // { clientId: string }
  const [suggestions, setSuggestions] = useState({})         // { clientId: { fdId, fdName } }
  const [loading, setLoading]         = useState(true)
  const [fetching, setFetching]       = useState(false)
  const [saving, setSaving]           = useState({})

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, fantasy_name, site, freshdesk_company_id')
      .order('name')
      .then(({ data }) => { setClients(data ?? []); setLoading(false) })
  }, [])

  async function handleFetchSuggestions() {
    setFetching(true)
    try {
      const fdCompanies = await fetchCompaniesFreshdesk()
      const map = {}
      for (const c of clients) {
        if (c.freshdesk_company_id) continue
        const s = computeSuggestion(c, fdCompanies)
        if (s) map[c.id] = s
      }
      setSuggestions(map)
      const found = Object.keys(map).length
      toast.success(found
        ? `${found} sugestão${found !== 1 ? 'ões' : ''} encontrada${found !== 1 ? 's' : ''}`
        : 'Nenhuma sugestão automática encontrada')
    } catch (e) {
      toast.error(e.message || 'Erro ao buscar empresas do Freshdesk')
    } finally {
      setFetching(false)
    }
  }

  function applySuggestion(clientId, fdId) {
    setEdits(p => ({ ...p, [clientId]: String(fdId) }))
  }

  async function saveClientMapping(clientId) {
    const raw = edits[clientId]
    const value = raw === '' ? null : Number(raw)
    if (raw !== '' && raw !== undefined && isNaN(value)) {
      toast.error('ID inválido — deve ser número')
      return
    }
    setSaving(p => ({ ...p, [clientId]: true }))
    const { error } = await supabase
      .from('clients')
      .update({ freshdesk_company_id: value })
      .eq('id', clientId)
    if (error) {
      toast.error(error.message)
    } else {
      setClients(p => p.map(c => c.id === clientId ? { ...c, freshdesk_company_id: value } : c))
      setEdits(p => { const n = { ...p }; delete n[clientId]; return n })
      setSuggestions(p => { const n = { ...p }; delete n[clientId]; return n })
      toast.success('Mapeamento salvo')
    }
    setSaving(p => { const n = { ...p }; delete n[clientId]; return n })
  }

  if (loading) return <PageSpinner />

  const mapped   = clients.filter(c => c.freshdesk_company_id || edits[c.id] !== undefined)
  const unmapped = clients.filter(c => !c.freshdesk_company_id && edits[c.id] === undefined)

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-tertiary">
        {clients.filter(c => c.freshdesk_company_id).length} de {clients.length} clientes mapeados
      </p>

      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-tertiary bg-donc-navy text-white">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Freshdesk ID</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Sugestão</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-white uppercase tracking-wider">Ação</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => {
              const currentId = c.freshdesk_company_id
              const editVal   = edits[c.id]
              const isDirty   = editVal !== undefined
              const sug       = suggestions[c.id]
              const displayVal = isDirty ? editVal : (currentId ?? '')

              return (
                <tr key={c.id} className="border-t border-border-tertiary hover:bg-bg-secondary">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-text-primary">{c.name}</span>
                    {currentId && (
                      <span className="ml-2 text-xs text-donc-verde">✓ mapeado</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      value={displayVal}
                      onChange={e => setEdits(p => ({ ...p, [c.id]: e.target.value }))}
                      placeholder="ID numérico"
                      className="input-base w-40 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-text-tertiary text-xs">
                    {sug ? (
                      <button
                        onClick={() => applySuggestion(c.id, sug.fdId)}
                        className="text-donc-sky hover:underline text-left"
                        title={`ID ${sug.fdId}`}
                      >
                        {sug.fdName} (ID {sug.fdId})
                      </button>
                    ) : currentId ? '—' : (
                      <span className="text-text-tertiary/50">nenhuma</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isDirty && (
                      <button
                        onClick={() => saveClientMapping(c.id)}
                        disabled={saving[c.id]}
                        className="p-1.5 text-donc-navy hover:text-donc-navy/80 rounded disabled:opacity-40"
                        title={saving[c.id] ? 'Salvando...' : 'Salvar'}
                      >
                        {saving[c.id] ? (
                          <span className="text-xs">…</span>
                        ) : (
                          <Icons.Save size={14} />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="p-4 border-t border-border-tertiary">
          <Button onClick={handleFetchSuggestions} disabled={fetching}>
            {fetching ? 'Buscando…' : <span className="flex items-center gap-1.5"><SearchIcon className="w-3.5 h-3.5" /> Buscar sugestões do Freshdesk</span>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Seção Sincronização ───────────────────────────────────────────────────────
function SyncSection() {
  const navigate = useNavigate()
  const SyncIcon = Icons.RefreshCw
  const LogsIcon = Icons.ClipboardList
  const RefreshCwIcon = Icons.RefreshCw
  const now          = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth]         = useState(defaultMonth)
  const [syncing, setSyncing]     = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [updatingConfig, setUpdatingConfig] = useState(false)
  const [lastDataSync, setLastDataSync] = useState(null)
  const [lastConfigSync, setLastConfigSync] = useState(null)

  useEffect(() => {
    async function loadLastDataSync() {
      try {
        const { data } = await supabase
          .from('freshdesk_config')
          .select('data')
          .eq('key', 'last_data_sync')
          .maybeSingle()
        if (data?.data?.synced_at) {
          setLastDataSync(data.data.synced_at)
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadLastDataSync()
  }, [])

  useEffect(() => {
    async function loadLastConfigSync() {
      try {
        const data = await getFreshdeskConfig('last_sync')
        if (data?.synced_at) {
          setLastConfigSync(data.synced_at)
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadLastConfigSync()
  }, [])

  async function handleUpdateConfig() {
    setUpdatingConfig(true)
    try {
      await fetchAndSaveFreshdeskConfig()
      toast.success('Configurações do Freshdesk atualizadas (grupos, agentes e campos de ticket)')
    } catch (e) {
      toast.error(e.message || 'Erro ao atualizar configurações do Freshdesk')
    } finally {
      setUpdatingConfig(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setLastResult(null)
    try {
      const result = await syncAllCompanies(month)
      setLastResult(result)
      try {
        const timestamp = new Date().toISOString()
        const { error } = await supabase
          .from('freshdesk_config')
          .upsert({
            key: 'last_data_sync',
            data: { synced_at: timestamp },
            updated_at: timestamp
          }, {
            onConflict: 'key'
          })
        if (error) {
          console.error('Error saving last_data_sync:', error)
        } else {
          setLastDataSync(timestamp)
        }
      } catch (err) {
        console.error('Unexpected error saving last_data_sync:', err)
      }
      if (result.errors.length === 0) {
        toast.success(`${result.synced} empresa${result.synced !== 1 ? 's' : ''} sincronizada${result.synced !== 1 ? 's' : ''}`)
      } else {
        toast(`${result.synced} sincronizadas, ${result.errors.length} com erro`, { icon: '⚠️' })
      }
    } catch (e) {
      toast.error(e.message || 'Erro na sincronização')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Card 1: Sincronização de Dados */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <SyncIcon className="w-4 h-4 text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Sincronização de Dados</p>
        </div>
        <p className="text-sm text-text-secondary">
          Busca tickets e contatos do Freshdesk para todas as empresas mapeadas e salva como pendentes para revisão.
        </p>
        <div>
          <label className="label-sm">Mês de referência</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="input-base"
          />
        </div>
        {lastDataSync && (
          <div>
            <p className="text-xs text-text-tertiary">Última sincronização</p>
            <p className="text-xs text-text-secondary">{formatDateTimeBR(lastDataSync)}</p>
          </div>
        )}
        <Button onClick={handleSync} disabled={syncing || !month}>
          {syncing ? 'Sincronizando…' : <span className="flex items-center gap-1.5"><SyncIcon className="w-3.5 h-3.5" /> Sincronizar todos</span>}
        </Button>
        {lastResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <Icons.CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800">
              {lastResult.synced} empresa{lastResult.synced !== 1 ? 's' : ''} sincronizada{lastResult.synced !== 1 ? 's' : ''} com sucesso
            </p>
          </div>
        )}
        {lastResult && lastResult.errors.length > 0 && (
          <div className="text-sm space-y-1">
            <p className="text-donc-red font-medium">❌ Erros:</p>
            <ul className="space-y-0.5 text-text-tertiary">
              {lastResult.errors.map((e, i) => (
                <li key={i}>{e.name}: {e.error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Card 2: Revisão de Importações */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <LogsIcon className="w-4 h-4 text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Revisão de Importações</p>
        </div>
        <p className="text-sm text-text-secondary">
          Revise os dados importados antes de confirmar a atualização dos indicadores.
        </p>
        <Button onClick={() => navigate('/config/freshdesk/pendentes')}>
          Revisar importações pendentes
        </Button>
      </div>

      {/* Card 3: Configurações do Freshdesk */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <SyncIcon className="w-4 h-4 text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Configurações do Freshdesk</p>
        </div>
        <p className="text-sm text-text-secondary">
          Sincroniza grupos, agentes e campos de ticket do Freshdesk para uso interno.
        </p>
        {lastConfigSync && (
          <div>
            <p className="text-xs text-text-tertiary">Última atualização</p>
            <p className="text-xs text-text-secondary">{formatDateTimeBR(lastConfigSync)}</p>
          </div>
        )}
        <Button
          onClick={handleUpdateConfig}
          disabled={updatingConfig}
        >
          {updatingConfig ? '⏳ Atualizando…' : <span className="flex items-center gap-1.5"><RefreshCwIcon className="w-3.5 h-3.5" /> Atualizar Configurações</span>}
        </Button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function SettingsFreshdesk() {
  const FreshdeskIcon = Icons.Headphones
  const MappingIcon = Icons.Link

  return (
    <div className="max-w-6xl space-y-4">

      <SettingsSectionHeader
        icon={FreshdeskIcon}
        title="Integração Freshdesk"
        subtitle="Mapeie empresas do Freshdesk para clientes do doncCX e sincronize dados de suporte mensalmente."
      />

      <SyncSection />

      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MappingIcon className="w-4 h-4 text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">
            Mapeamento de Empresas
          </p>
        </div>

        <p className="text-sm text-text-secondary">
          Relaciona empresas do doncCX Hub com empresas do Freshdesk.
        </p>

        <MappingSection />

      </div>

    </div>
  )
}
