import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { SettingsMenuIcons, ActionIcons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import { fetchCompaniesFreshdesk, syncAllCompanies } from '../../lib/freshdeskSync'
import { fetchAndSaveFreshdeskConfig } from '../../lib/freshdeskConfig'
import { Button } from '../ui/Button'
import { PageSpinner } from '../ui/Spinner'
import SettingsTabs from './SettingsTabs'
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
  const SearchIcon = ActionIcons.search
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-tertiary">
          {clients.filter(c => c.freshdesk_company_id).length} de {clients.length} clientes mapeados
        </p>
        <Button size="sm" variant="secondary" onClick={handleFetchSuggestions} disabled={fetching}>
          {fetching ? 'Buscando…' : <span className="flex items-center gap-1.5"><SearchIcon className="w-3.5 h-3.5" /> Buscar sugestões do Freshdesk</span>}
        </Button>
      </div>

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
                          <Save size={14} />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Seção Sincronização ───────────────────────────────────────────────────────
function SyncSection() {
  const SyncIcon = ActionIcons.recalculate
  const LogsIcon = SettingsMenuIcons['logs']
  const now          = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth]         = useState(defaultMonth)
  const [syncing, setSyncing]     = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [updatingConfig, setUpdatingConfig] = useState(false)

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
        <Button onClick={handleSync} disabled={syncing || !month}>
          {syncing ? 'Sincronizando…' : <span className="flex items-center gap-1.5"><SyncIcon className="w-3.5 h-3.5" /> Sincronizar todos</span>}
        </Button>
        {lastResult && (
          <div className="bg-bg-secondary border border-border-tertiary rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium text-text-primary">Resultado da sincronização</p>
            <p className="text-text-secondary">
              ✅ {lastResult.synced} empresa{lastResult.synced !== 1 ? 's' : ''} sincronizada{lastResult.synced !== 1 ? 's' : ''} com sucesso
            </p>
            {lastResult.errors.length > 0 && (
              <div>
                <p className="text-donc-red font-medium">❌ Erros:</p>
                <ul className="mt-1 space-y-0.5 text-text-tertiary">
                  {lastResult.errors.map((e, i) => (
                    <li key={i}>{e.name}: {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
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
        <Link
          to="/config/freshdesk/pendentes"
          className="inline-flex items-center gap-1 text-sm text-donc-sky hover:underline"
        >
          Revisar importações pendentes →
        </Link>
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
        <Button
          variant="secondary"
          size="sm"
          onClick={handleUpdateConfig}
          disabled={updatingConfig}
        >
          {updatingConfig ? '⏳ Atualizando…' : <span className="flex items-center gap-1.5"><SyncIcon className="w-3.5 h-3.5" /> Atualizar Configurações</span>}
        </Button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function SettingsFreshdesk() {
  const FreshdeskIcon = SettingsMenuIcons['freshdesk']
  const [tab, setTab] = useState('mapping')

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-1 flex items-center gap-2"><FreshdeskIcon className="w-4 h-4" /> Integração Freshdesk</h2>
        <p className="text-xs text-text-tertiary mb-4">
          Mapeie empresas do Freshdesk para clientes do doncCX e sincronize dados de suporte mensalmente.
        </p>

        {/* Tabs internas */}
        <SettingsTabs
          tabs={[
            { key: 'mapping', label: 'Mapeamento de Empresas' },
            { key: 'sync',    label: 'Sincronização' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'mapping' && <MappingSection />}
        {tab === 'sync'    && <SyncSection />}
      </div>
    </div>
  )
}
