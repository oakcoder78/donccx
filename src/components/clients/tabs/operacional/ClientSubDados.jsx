import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { usePermissions } from '@/hooks/usePermissions'
import { useCatalog } from '@/hooks/useCatalog'
import { supabase } from '@/lib/supabaseClient'
import { Icons } from '@/lib/icons'
import toast from 'react-hot-toast'

function shortUrl(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    const path = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : ''
    return u.host + path
  } catch {
    return url
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('App code copiado')
  } catch {
    toast.error('Não foi possível copiar')
  }
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-white/50 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  )
}

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const STATUS_META = {
  implantado:      { icon: '✓', label: 'Implantado' },
  em_implantacao:  { icon: '🔄', label: 'Em implantação' },
  pausado:         { icon: '⚠', label: 'Pausado' },
  abandonado:      { icon: '⛔', label: 'Abandonado' },
  descontinuado:   { icon: null, label: 'Descontinuado' },
}

// ── Modal inline para editar/criar instância DONC ─────────────────────────────
const INP = { width: '100%', padding: '7px 10px', border: '1px solid #d4d3ce', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a18', backgroundColor: '#fff' }
const LBL = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888780', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }

function InstanceModal({ clientId, inst, onSave, onClose }) {
  const isNew = !inst?.id
  const [form, setForm] = useState({
    label:            inst?.label            ?? '',
    contrato_saas_id: inst?.contrato_saas_id ?? '',
    url_donc:         inst?.url_donc         ?? '',
    app_code:         inst?.app_code         ?? '',
    weight:           inst?.weight           ?? '1.0',
    active:           inst?.active           ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.label.trim())     { toast.error('Label obrigatório'); return }
    const contratoSaasId = Number(form.contrato_saas_id)
    if (!Number.isInteger(contratoSaasId) || contratoSaasId <= 0) {
      toast.error('Contrato SaaS ID deve ser um número inteiro positivo')
      return
    }
    const w = parseFloat(form.weight)
    if (isNaN(w) || w < 0 || w > 1) { toast.error('Weight deve ser entre 0 e 1'); return }
    setSaving(true)
    const payload = {
      client_id: clientId, contrato_saas_id: contratoSaasId,
      label: form.label, url_donc: form.url_donc || null, app_code: form.app_code || null,
      weight: w, active: form.active,
    }
    if (inst?.id) payload.id = inst.id
    const { error } = await supabase
      .from('client_donc_instances')
      .upsert(payload, { onConflict: 'client_id,contrato_saas_id' })
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(isNew ? 'Instância criada' : 'Instância salva')
    await onSave()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 10, padding: 24, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a18', margin: '0 0 16px' }}>
          {isNew ? 'Nova instância DONC' : 'Editar instância DONC'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: 14 }}>
          <div><label style={LBL}>Label</label><input style={INP} value={form.label} onChange={e => set('label', e.target.value)} placeholder="Principal" /></div>
          <div><label style={LBL}>Contrato SaaS ID</label><input style={INP} type="number" value={form.contrato_saas_id} onChange={e => set('contrato_saas_id', e.target.value)} /></div>
          <div><label style={LBL}>URL DONC</label><input style={INP} value={form.url_donc} onChange={e => set('url_donc', e.target.value)} placeholder="https://..." /></div>
          <div><label style={LBL}>App Code</label><input style={INP} value={form.app_code} onChange={e => set('app_code', e.target.value)} /></div>
          <div><label style={LBL}>Weight (0–1)</label><input style={INP} type="number" step="0.001" min="0" max="1" value={form.weight} onChange={e => set('weight', e.target.value)} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#1a1a18' }}>
              <div onClick={() => set('active', !form.active)} style={{ width: 34, height: 18, borderRadius: 9, backgroundColor: form.active ? '#173557' : '#d4d3ce', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 1, left: form.active ? 17 : 1, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s' }} />
              </div>
              Ativo
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 13, border: '1px solid #d4d3ce', backgroundColor: '#fff', color: '#888780', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '7px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', backgroundColor: saving ? '#e8e7e3' : '#173557', color: saving ? '#888780' : '#fff' }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Seção Instâncias DONC dentro do painel do cliente ─────────────────────────
function DoncInstancesSection({ clientId }) {
  const [instances, setInstances] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalInst, setModalInst] = useState(null)   // null = fechado, {} = novo, obj = editar

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('client_donc_instances')
      .select('*')
      .eq('client_id', clientId)
      .order('id')
    setInstances(data || [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  if (loading) return null

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className="text-xs text-text-tertiary font-semibold uppercase tracking-wider">Instâncias DONC</p>
        <button
          onClick={() => setModalInst({})}
          style={{ fontSize: 11, fontWeight: 600, color: '#173557', background: 'none', border: '1px solid #d4d3ce', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}
        >
          + Nova instância
        </button>
      </div>

      {instances.length === 0 && (
        <p style={{ fontSize: 12, color: '#888780' }}>Nenhuma instância cadastrada.</p>
      )}

      {instances.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#888780', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0ec', fontWeight: 600 }}>Label</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0ec', fontWeight: 600 }}>SaaS ID</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0ec', fontWeight: 600 }}>URL Donc</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0ec', fontWeight: 600 }}>App Code</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0ec', fontWeight: 600, textAlign: 'right' }}>Weight</th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0ec', fontWeight: 600, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {instances.map(inst => (
                <tr key={inst.id} style={{ borderTop: '1px solid #f0f0ec' }}>
                  <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                    <span style={{ fontWeight: 600, color: '#1a1a18' }}>{inst.label}</span>
                    {!inst.active && (
                      <span style={{ fontSize: 10, color: '#b45309', backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>
                        inativo
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px', color: '#1a1a18', whiteSpace: 'nowrap' }}>{inst.contrato_saas_id}</td>
                  <td style={{ padding: '8px', maxWidth: 260 }}>
                    {inst.url_donc ? (
                      <a
                        href={inst.url_donc}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={inst.url_donc}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#173557', textDecoration: 'none', maxWidth: '100%' }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {shortUrl(inst.url_donc)}
                        </span>
                        <Icons.Globe size={12} style={{ flexShrink: 0, color: '#888780' }} />
                      </a>
                    ) : (
                      <span style={{ color: '#c4c3be' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '8px', maxWidth: 200 }}>
                    {inst.app_code ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: '#1a1a18', backgroundColor: '#f5f4f0', padding: '2px 6px', borderRadius: 4, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inst.app_code}
                        </code>
                        <button
                          onClick={() => copyText(inst.app_code)}
                          title="Copiar app code"
                          style={{ background: 'none', border: '1px solid #d4d3ce', borderRadius: 4, padding: '2px 4px', cursor: 'pointer', color: '#173557', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Icons.Copy size={11} />
                        </button>
                      </span>
                    ) : (
                      <span style={{ color: '#c4c3be' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '8px', color: '#888780', textAlign: 'right', whiteSpace: 'nowrap' }}>{inst.weight}</td>
                  <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setModalInst(inst)}
                      style={{ fontSize: 11, color: '#173557', background: 'none', border: '1px solid #d4d3ce', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalInst !== null && (
        <InstanceModal
          clientId={clientId}
          inst={Object.keys(modalInst).length === 0 ? null : modalInst}
          onSave={load}
          onClose={() => setModalInst(null)}
        />
      )}
    </Card>
  )
}

export function ClientSubDados({ client }) {
  const { canViewFinancial } = usePermissions()
  const { data: catalog = [] } = useCatalog()

  const servicos = client.client_catalog
    ?.filter(cc => cc.catalog_items?.type === 'servico')
    .map(cc => cc.catalog_items) || []

  const allSolucoes = catalog.filter(c => c.type === 'solucao')

  // map catalog_item_id → client_catalog entry (inclui status)
  const catalogMap = {}
  client.client_catalog?.forEach(cc => { catalogMap[cc.catalog_item_id] = cc })

  return (
    <div className="space-y-4">
      {/* Navy card with main info */}
      <div className="bg-donc-navy rounded-lg p-5 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="Início Contrato" value={formatDate(client.contract_start)} />
          <InfoRow label="Renovação" value={formatDate(client.contract_renewal)} />
          <InfoRow label="Início Onboarding" value={formatDate(client.onb_start)} />
          <InfoRow label="Go Live" value={formatDate(client.golive)} />
          {canViewFinancial && (
            <>
              <InfoRow label="MRR" value={client.mrr ? `R$ ${Number(client.mrr).toLocaleString('pt-BR')}` : null} />
              <InfoRow
                label="Licenças"
                value={client.billing_floor ? `${client.billing_floor} × R$ ${Number(client.billing_base_value || 0).toLocaleString('pt-BR')}` : null}
              />
            </>
          )}
          <InfoRow
            label="Unidades na Donc"
            value={client.unidades_donc > 0 ? String(client.unidades_donc) : null}
          />
          {client.delay_days > 0 && (
            <InfoRow label="Dias em Atraso" value={`${client.delay_days} dias`} />
          )}
        </div>
      </div>

      {/* Instâncias DONC */}
      <DoncInstancesSection clientId={client.id} />

      {/* Catálogo */}
      {(servicos.length > 0 || allSolucoes.length > 0) && (
        <Card>
          {servicos.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-text-tertiary mb-2">Serviços</p>
              <div className="flex flex-wrap gap-1.5">
                {servicos.map(s => (
                  <span
                    key={s.id}
                    className="px-2.5 py-1 rounded-full text-xs font-medium text-white select-none"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {allSolucoes.length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary mb-2">Soluções</p>
              <div className="flex flex-wrap gap-1.5">
                {allSolucoes.map(sol => {
                  const entry = catalogMap[sol.id]

                  if (!entry) {
                    return (
                      <span
                        key={sol.id}
                        className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary border border-border-secondary select-none"
                        title="Não contratado"
                      >
                        {sol.name}
                      </span>
                    )
                  }

                  const status = entry.status || 'implantado'

                  if (status === 'descontinuado') {
                    return (
                      <span
                        key={sol.id}
                        className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary border border-border-secondary line-through select-none"
                        title={STATUS_META.descontinuado.label}
                      >
                        {sol.name}
                      </span>
                    )
                  }

                  const meta = STATUS_META[status] || STATUS_META.implantado
                  return (
                    <span
                      key={sol.id}
                      className="px-2.5 py-1 rounded-full text-xs font-medium text-white select-none flex items-center gap-1"
                      style={{ backgroundColor: sol.color }}
                      title={meta.label}
                    >
                      <span>{meta.icon}</span>
                      {sol.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
