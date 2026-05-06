import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsMenuIcons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import toast from 'react-hot-toast'

// ── Estilos base ───────────────────────────────────────────────────────────────
const S = {
  section: {
    backgroundColor: '#fff',
    border: '0.5px solid #e8e7e3',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a18', margin: '0 0 4px' },
  sectionDesc:  { fontSize: 12, color: '#888780', margin: '0 0 18px', lineHeight: 1.5 },
  label:        { display: 'block', fontSize: 11, fontWeight: 600, color: '#888780', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  input:        { width: '100%', padding: '7px 10px', border: '1px solid #d4d3ce', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a18', backgroundColor: '#fff' },
  fieldBox:     { marginBottom: 10 },
  btn: (color = '#173557', disabled = false) => ({
    padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: disabled ? '#e8e7e3' : color,
    color: disabled ? '#888780' : '#fff',
    transition: 'all 0.15s',
  }),
  btnOutline: { padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #d4d3ce', backgroundColor: '#fff', color: '#888780', cursor: 'pointer' },
}

// ── Helper: mês anterior no formato YYYY-MM ────────────────────────────────────
function prevMonthValue() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Card de instância editável ─────────────────────────────────────────────────
function InstanceCard({ inst, onSave, onRemove }) {
  const isNew = !inst.id
  const [form, setForm] = useState({
    label:           inst.label           ?? '',
    contrato_saas_id: inst.contrato_saas_id ?? '',
    url_donc:        inst.url_donc        ?? '',
    app_code:        inst.app_code        ?? '',
    weight:          inst.weight          ?? '1.0',
    active:          inst.active          ?? true,
  })
  const [saving, setSaving]     = useState(false)
  const [removing, setRemoving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.label.trim())           { toast.error('Label obrigatório');           return }
    if (!form.contrato_saas_id)       { toast.error('Contrato SaaS ID obrigatório'); return }
    const w = parseFloat(form.weight)
    if (isNaN(w) || w < 0 || w > 1)  { toast.error('Weight deve ser entre 0 e 1'); return }
    setSaving(true)
    await onSave({ ...inst, ...form, contrato_saas_id: Number(form.contrato_saas_id), weight: w })
    setSaving(false)
  }

  async function handleRemove() {
    if (!window.confirm(`Remover instância "${form.label}"? Esta ação não pode ser desfeita.`)) return
    setRemoving(true)
    await onRemove(inst)
    setRemoving(false)
  }

  return (
    <div style={{ border: '1px solid #e8e7e3', borderRadius: 8, padding: 14, marginBottom: 10, backgroundColor: form.active ? '#fff' : '#fafaf8' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
        <div style={S.fieldBox}>
          <label style={S.label}>Label</label>
          <input style={S.input} value={form.label} onChange={e => set('label', e.target.value)} placeholder="Principal" />
        </div>
        <div style={S.fieldBox}>
          <label style={S.label}>Contrato SaaS ID</label>
          <input style={S.input} type="number" value={form.contrato_saas_id} onChange={e => set('contrato_saas_id', e.target.value)} placeholder="1004" />
        </div>
        <div style={S.fieldBox}>
          <label style={S.label}>URL DONC</label>
          <input style={S.input} value={form.url_donc} onChange={e => set('url_donc', e.target.value)} placeholder="https://..." />
        </div>
        <div style={S.fieldBox}>
          <label style={S.label}>App Code</label>
          <input style={S.input} value={form.app_code} onChange={e => set('app_code', e.target.value)} placeholder="ex: cliente-abc" />
        </div>
        <div style={S.fieldBox}>
          <label style={S.label}>Weight (0.0–1.0)</label>
          <input style={S.input} type="number" step="0.001" min="0" max="1" value={form.weight} onChange={e => set('weight', e.target.value)} />
        </div>
        <div style={{ ...S.fieldBox, display: 'flex', alignItems: 'center', gap: 10, paddingTop: 18 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#1a1a18' }}>
            <div
              onClick={() => set('active', !form.active)}
              style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                backgroundColor: form.active ? '#173557' : '#d4d3ce',
                position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: form.active ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            Ativo
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button style={S.btn('#173557', saving)} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : isNew ? 'Adicionar' : 'Salvar'}
        </button>
        {!isNew && (
          <button style={S.btn('#dc2626', removing)} onClick={handleRemove} disabled={removing}>
            {removing ? 'Removendo...' : 'Remover'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Bloco de um cliente com suas instâncias ────────────────────────────────────
function ClientBlock({ client, instances, onSave, onRemove }) {
  const [adding, setAdding] = useState(false)

  const totalWeight = instances.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0)
  const weightWarn  = instances.length > 1 && Math.abs(totalWeight - 1.0) > 0.001

  async function handleSave(inst) {
    await onSave(client.id, inst)
    setAdding(false)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a18' }}>{client.fantasy_name || client.name}</span>
        {client.fantasy_name && client.name && (
          <span style={{ fontSize: 11, color: '#888780' }}>{client.name}</span>
        )}
        {weightWarn && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', backgroundColor: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>
            ⚠ Soma dos weights = {totalWeight.toFixed(3)} (esperado 1.000)
          </span>
        )}
      </div>

      {instances.map(inst => (
        <InstanceCard
          key={inst.id}
          inst={inst}
          onSave={(updated) => onSave(client.id, updated)}
          onRemove={onRemove}
        />
      ))}

      {adding && (
        <InstanceCard
          inst={{ client_id: client.id }}
          onSave={handleSave}
          onRemove={() => setAdding(false)}
        />
      )}

      {!adding && (
        <button style={S.btnOutline} onClick={() => setAdding(true)}>
          + Adicionar instância
        </button>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export function SettingsDoncAPI() {
  const APIIcon = SettingsMenuIcons['donc-api']
  const LogsIcon = SettingsMenuIcons['logs']
  const navigate = useNavigate()

  // ── Instâncias ─────────────────────────────────────────────────────────────
  const [clients,   setClients]   = useState([])    // todos os clientes ativos
  const [instMap,   setInstMap]   = useState({})    // client_id → instâncias[]
  const [loading,   setLoading]   = useState(true)

  // ── Sync manual ────────────────────────────────────────────────────────────
  const [syncMonth,     setSyncMonth]    = useState(prevMonthValue)
  const [syncClientId,  setSyncClientId] = useState('')   // '' = todos
  const [syncing,       setSyncing]      = useState(false)
  const [syncResult,    setSyncResult]   = useState(null)
  const [pendingCount,  setPendingCount] = useState(0)

  const loadPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from('client_usage')
      .select('id', { count: 'exact', head: true })
      .eq('pending', true)
      .not('instance_id', 'is', null)
    setPendingCount(count ?? 0)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: clientRows }, { data: instRows }] = await Promise.all([
      supabase.from('clients').select('id, name, fantasy_name').eq('contract_active', true).order('fantasy_name'),
      supabase.from('client_donc_instances').select('*').order('id'),
    ])
    setClients(clientRows || [])
    const map = {}
    ;(instRows || []).forEach(inst => {
      if (!map[inst.client_id]) map[inst.client_id] = []
      map[inst.client_id].push(inst)
    })
    setInstMap(map)
    setLoading(false)
  }, [])

  useEffect(() => { loadData(); loadPendingCount() }, [loadData, loadPendingCount])

  // Clientes que têm instâncias (para o dropdown de sync)
  const clientsWithInst = clients.filter(c => (instMap[c.id]?.length ?? 0) > 0)

  async function handleSaveInstance(clientId, inst) {
    const payload = {
      client_id:        clientId,
      contrato_saas_id: inst.contrato_saas_id,
      label:            inst.label,
      url_donc:         inst.url_donc   || null,
      app_code:         inst.app_code   || null,
      weight:           inst.weight,
      active:           inst.active,
    }
    if (inst.id) payload.id = inst.id

    const { data, error } = await supabase
      .from('client_donc_instances')
      .upsert(payload, { onConflict: 'client_id,contrato_saas_id' })
      .select()
      .single()

    if (error) { toast.error(error.message); return }
    toast.success('Instância salva')
    await loadData()
    return data
  }

  async function handleRemoveInstance(inst) {
    if (!inst.id) return
    const { error } = await supabase.from('client_donc_instances').delete().eq('id', inst.id)
    if (error) { toast.error(error.message); return }
    toast.success('Instância removida')
    await loadData()
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')
      const body = { trigger: 'manual', month: syncMonth }
      if (syncClientId) body.client_id = Number(syncClientId)
      console.log('🔄 [DONC API Sync] Request body:', body)

      const authHeaders = {
        Authorization: `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/donc-api-sync`,
        { method: 'POST', headers: authHeaders, body: JSON.stringify(body) },
      )
      const result = await res.json()
      console.log('🔄 [DONC API Sync] Response completo:', result)
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)
      setSyncResult(result)
      toast.success(`Sincronizado: ${result.synced} instância(s)`)
      loadPendingCount()

      // Recalcula health score dos clientes afetados pela sync
      const affectedClientIds = syncClientId ? [Number(syncClientId)] : undefined
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-recalc`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(affectedClientIds ? { client_ids: affectedClientIds } : {}),
        },
      ).catch(e => console.warn('[health-recalc] erro silencioso:', e))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: '#888780', padding: 8 }}>Carregando...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <SettingsSectionHeader
        icon={APIIcon}
        title="API DONC"
        subtitle="Configure instâncias por cliente e sincronize dados operacionais mensais."
      />

      {/* ── Seção Sincronização Manual ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Sincronização Manual</p>
        <p style={S.sectionDesc}>
          Execute a sincronização imediatamente para o período e cliente selecionados.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={S.fieldBox}>
            <label style={S.label}>Mês de referência</label>
            <input
              type="month"
              style={S.input}
              value={syncMonth}
              onChange={e => setSyncMonth(e.target.value)}
            />
          </div>
          <div style={S.fieldBox}>
            <label style={S.label}>Cliente</label>
            <select style={{ ...S.input, cursor: 'pointer' }} value={syncClientId} onChange={e => setSyncClientId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientsWithInst.map(c => (
                <option key={c.id} value={c.id}>{c.fantasy_name || c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button style={S.btn('#59c2ed', syncing)} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={() => navigate('/config/donc-api/pendentes')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid #e8e7e3', cursor: 'pointer',
              backgroundColor: '#fff', color: '#1a1a18',
            }}
          >
            <LogsIcon style={{ width: 14, height: 14 }} /> Ver registros pendentes
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              backgroundColor: pendingCount > 0 ? '#59c2ed' : '#e8e7e3',
              color: pendingCount > 0 ? '#fff' : '#888780',
            }}>
              {pendingCount}
            </span>
          </button>
        </div>

        {syncResult && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 7, backgroundColor: syncResult.failed > 0 ? '#fef3c7' : '#f0fdf4', border: `1px solid ${syncResult.failed > 0 ? '#fde68a' : '#bbf7d0'}` }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18', margin: '0 0 4px' }}>
              ✓ {syncResult.synced} instância(s) sincronizada(s)
              {syncResult.failed > 0 && ` — ${syncResult.failed} falha(s)`}
            </p>
            <p style={{ fontSize: 11, color: '#888780', margin: '0 0 6px' }}>
              Período: {syncResult.dataInicio} → {syncResult.dataFim}
            </p>
            {syncResult.errors?.length > 0 && (
              <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#b45309' }}>
                {syncResult.errors.map((e, i) => (
                  <li key={i}>{e.label} (ID {e.contrato_saas_id}): {e.error}</li>
                ))}
              </ul>
            )}
            {syncResult.synced > 0 && (
              <button
                style={{ marginTop: 8, fontSize: 12, color: '#173557', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}
                onClick={() => navigate('/config/donc-api/pendentes')}
              >
                Ver {syncResult.synced} registro(s) pendente(s) →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Seção Instâncias ── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Instâncias da API DONC</p>
        <p style={S.sectionDesc}>
          Vincule cada cliente às instâncias da plataforma DONC para sincronização automática de dados operacionais.
        </p>

        {clients.length === 0 && (
          <p style={{ fontSize: 13, color: '#888780' }}>Nenhum cliente ativo encontrado.</p>
        )}

        {clients.map(client => (
          <ClientBlock
            key={client.id}
            client={client}
            instances={instMap[client.id] || []}
            onSave={handleSaveInstance}
            onRemove={handleRemoveInstance}
          />
        ))}
      </div>
    </div>
  )
}
