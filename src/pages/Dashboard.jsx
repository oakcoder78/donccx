import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { useHealthConfig } from '../hooks/useHealthConfig'
import { useRecalculateHealth } from '../hooks/useHealthScore'
import { PageSpinner } from '../components/ui/Spinner'
import { TemperaturaCSM } from '../components/clients/TemperaturaCSM'
import { calcGravidade } from '../lib/gravidade'

// ─── Constants ───────────────────────────────────────────────────────────────

const DIMS = [
  { key: 'health_uso',            label: 'Uso',            color: '#59c2ed' },
  { key: 'health_suporte',        label: 'Suporte',        color: '#1D9E75' },
  { key: 'health_relacionamento', label: 'Relacionamento', color: '#534AB7' },
  { key: 'health_financeiro',     label: 'Financeiro',     color: '#BA7517' },
  { key: 'health_projeto',        label: 'Projeto',        color: '#185FA5' },
]

const TEMPS = [
  { value: 5,  label: 'Quente',  emoji: '🔥', color: '#1D9E75' },
  { value: 2,  label: 'Morno',   emoji: '☀️', color: '#BA7517' },
  { value: 0,  label: 'Neutro',  emoji: '➖', color: '#888780' },
  { value: -3, label: 'Frio',    emoji: '❄️', color: '#185FA5' },
  { value: -7, label: 'Crítico', emoji: '🚨', color: '#E24B4A' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function healthColor(score) {
  if (score >= 75) return '#1D9E75'
  if (score >= 50) return '#BA7517'
  return '#E24B4A'
}

function healthLabel(score) {
  if (score >= 75) return 'Saudável'
  if (score >= 50) return 'Atenção'
  return 'Em Risco'
}

function dimColor(val, baseColor) {
  if (val >= 15) return baseColor
  if (val >= 10) return '#BA7517'
  return '#E24B4A'
}

function getTemp(client) {
  const updated = client.temperature_updated_at
  if (updated) {
    const days = (Date.now() - new Date(updated).getTime()) / (1000 * 60 * 60 * 24)
    if (days > 30) return null
  }
  const val = client.csm_temperature ?? 0
  return TEMPS.find(t => t.value === val) ?? TEMPS[2]
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ─── ClientCard ───────────────────────────────────────────────────────────────

function ClientCard({ client, onClick }) {
  const score = client.health_total ?? 0
  const color = healthColor(score)
  const temp  = getTemp(client)

  return (
    <div
      onClick={() => onClick(client)}
      style={{
        backgroundColor: '#fff',
        border: `1px solid #e8e7e3`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'box-shadow 0.15s, transform 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.09)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {client.fantasy_name || client.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            {client.stage?.name && (
              <span style={{ fontSize: 10, color: '#888780', backgroundColor: '#f0efed', padding: '1px 6px', borderRadius: 4 }}>
                {client.stage.name}
              </span>
            )}
            {client.abc_class && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                backgroundColor: client.abc_class === 'A' ? '#1D9E7520' : client.abc_class === 'B' ? '#BA751720' : '#E24B4A18',
                color: client.abc_class === 'A' ? '#1D9E75' : client.abc_class === 'B' ? '#BA7517' : '#E24B4A',
              }}>
                {client.abc_class}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 600 }}>{healthLabel(score)}</div>
        </div>
      </div>

      {/* Dimension bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {DIMS.map(d => {
          const val = client[d.key] ?? 0
          const dc  = dimColor(val, d.color)
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: '#aaa9a4', width: 54, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {d.label}
              </span>
              <div style={{ flex: 1, height: 3, backgroundColor: '#f0efed', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(val / 20) * 100}%`, backgroundColor: dc, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: dc, width: 14, textAlign: 'right', flexShrink: 0 }}>
                {val}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #f5f4f0' }}>
        {temp ? (
          <span style={{ fontSize: 11, color: temp.color, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <span style={{ fontSize: 12 }}>{temp.emoji}</span>
            {temp.label}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: '#aaa9a4', fontStyle: 'italic' }}>Temp. expirada</span>
        )}
        {(client.delay_days ?? 0) > 0 && (
          <span style={{ fontSize: 10, color: '#E24B4A', fontWeight: 700, backgroundColor: '#E24B4A12', padding: '1px 6px', borderRadius: 4 }}>
            Atraso {client.delay_days}d
          </span>
        )}
      </div>
    </div>
  )
}

// ─── ClientDrawer ─────────────────────────────────────────────────────────────

function ClientDrawer({ client, rules, onClose }) {
  const navigate    = useNavigate()
  const recalculate = useRecalculateHealth()
  const score       = client.health_total ?? 0
  const color       = healthColor(score)

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(23,53,87,0.22)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 201,
        width: 390, backgroundColor: '#fff',
        boxShadow: '-6px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f0efed', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a18', lineHeight: 1.25 }}>
              {client.fantasy_name || client.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              {client.stage?.name && (
                <span style={{ fontSize: 11, color: '#888780', backgroundColor: '#f0efed', padding: '2px 8px', borderRadius: 5 }}>
                  {client.stage.name}
                </span>
              )}
              {client.abc_class && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                  backgroundColor: client.abc_class === 'A' ? '#1D9E7520' : client.abc_class === 'B' ? '#BA751720' : '#E24B4A18',
                  color: client.abc_class === 'A' ? '#1D9E75' : client.abc_class === 'B' ? '#BA7517' : '#E24B4A',
                }}>
                  {client.abc_class}
                </span>
              )}
              {(client.delay_days ?? 0) > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#E24B4A', backgroundColor: '#E24B4A12', padding: '2px 8px', borderRadius: 5 }}>
                  Atraso {client.delay_days}d
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%', border: 'none',
              backgroundColor: '#f0efed', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: '#888780', flexShrink: 0, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Health Score hero */}
        <div style={{ padding: '20px', background: `linear-gradient(135deg, ${color}12, ${color}04)`, borderBottom: '1px solid #f0efed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 3 }}>{healthLabel(score)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 8, backgroundColor: '#e8e7e3', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, score)}%`, backgroundColor: color, borderRadius: 4, transition: 'width 0.5s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: 10, color: '#aaa9a4' }}>0</span>
                <span style={{ fontSize: 10, color: '#BA7517' }}>50</span>
                <span style={{ fontSize: 10, color: '#1D9E75' }}>75</span>
                <span style={{ fontSize: 10, color: '#aaa9a4' }}>100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0efed' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa9a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Dimensões
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DIMS.map(d => {
              const val = client[d.key] ?? 0
              const dc  = dimColor(val, d.color)
              return (
                <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dc, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#4a4a46', width: 106, flexShrink: 0 }}>{d.label}</span>
                  <div style={{ flex: 1, height: 5, backgroundColor: '#f0efed', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(val / 20) * 100}%`, backgroundColor: dc, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: dc, width: 20, textAlign: 'right', flexShrink: 0 }}>{val}</span>
                  <span style={{ fontSize: 10, color: '#aaa9a4', flexShrink: 0 }}>/20</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Temperature */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0efed' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa9a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Temperatura CSM
          </div>
          <TemperaturaCSM client={client} />
        </div>

        {/* Quick actions */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa9a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Ações Rápidas
          </div>

          <button
            onClick={() => recalculate.mutate({ client, rules })}
            disabled={recalculate.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: '1px solid #e8e7e3', backgroundColor: '#fff',
              cursor: recalculate.isPending ? 'not-allowed' : 'pointer',
              opacity: recalculate.isPending ? 0.6 : 1,
              fontSize: 13, color: '#1a1a18', fontWeight: 500, textAlign: 'left', width: '100%',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { if (!recalculate.isPending) e.currentTarget.style.backgroundColor = '#f7f7f5' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff' }}
          >
            <span style={{ fontSize: 15 }}>🔁</span>
            {recalculate.isPending ? 'Calculando...' : 'Recalcular Health Score'}
          </button>

          <button
            onClick={() => { onClose(); navigate(`/empresas/${client.id}`) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: '1px solid #e8e7e3', backgroundColor: '#fff',
              cursor: 'pointer', fontSize: 13, color: '#1a1a18', fontWeight: 500, textAlign: 'left', width: '100%',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f7f7f5' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff' }}
          >
            <span style={{ fontSize: 15 }}>🏢</span>
            Ver ficha completa
          </button>

          <button
            onClick={() => { onClose(); navigate(`/empresas/${client.id}?tab=atividades`) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: '1px solid #e8e7e3', backgroundColor: '#fff',
              cursor: 'pointer', fontSize: 13, color: '#1a1a18', fontWeight: 500, textAlign: 'left', width: '100%',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f7f7f5' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff' }}
          >
            <span style={{ fontSize: 15 }}>📋</span>
            Ver atividades
          </button>

          <button
            onClick={() => { onClose(); navigate(`/empresas/${client.id}?tab=health`) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: '1px solid #e8e7e3', backgroundColor: '#fff',
              cursor: 'pointer', fontSize: 13, color: '#1a1a18', fontWeight: 500, textAlign: 'left', width: '100%',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f7f7f5' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff' }}
          >
            <span style={{ fontSize: 15 }}>🩺</span>
            Ver diagnóstico de saúde
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile } = useAuth()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  const [selectedCsm,    setSelectedCsm]    = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [search,         setSearch]         = useState('')
  const [filterStatus,   setFilterStatus]   = useState('all')

  const { data: profiles = [] }   = useProfiles()
  const { data: healthData }      = useHealthConfig()
  const rules                     = healthData?.rules || []

  const csmFilter = isAdminOrManager
    ? (selectedCsm ? { csm_id: selectedCsm } : {})
    : { csm_id: profile?.id }

  const { data: clients = [], isLoading } = useClients(csmFilter, { enabled: !!profile })

  // Sync selectedClient with refreshed data after recalculation
  useEffect(() => {
    if (!selectedClient) return
    const updated = clients.find(c => c.id === selectedClient.id)
    if (updated && updated !== selectedClient) setSelectedClient(updated)
  }, [clients]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAndSorted = useMemo(() => {
    let list = [...clients]

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => (c.fantasy_name || c.name || '').toLowerCase().includes(q))
    }

    if (filterStatus === 'risco')    list = list.filter(c => (c.health_total ?? 0) < 50)
    else if (filterStatus === 'atencao')  list = list.filter(c => { const s = c.health_total ?? 0; return s >= 50 && s < 75 })
    else if (filterStatus === 'saudavel') list = list.filter(c => (c.health_total ?? 0) >= 75)

    list.sort((a, b) => calcGravidade(b) - calcGravidade(a))
    return list
  }, [clients, search, filterStatus])

  const emRisco   = clients.filter(c => (c.health_total ?? 0) < 50).length
  const emAtencao = clients.filter(c => { const s = c.health_total ?? 0; return s >= 50 && s < 75 }).length
  const saudaveis = clients.filter(c => (c.health_total ?? 0) >= 75).length

  const csmList = profiles
    .filter(p => (p.role === 'csm' || p.role === 'manager') && p.status === 'active')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const dateStr = (() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  if (isLoading && !clients.length) return <PageSpinner />

  const KPI_PILLS = [
    { label: 'Em Risco',   value: emRisco,          color: '#f09595', filter: 'risco' },
    { label: 'Em Atenção', value: emAtencao,         color: '#FAC775', filter: 'atencao' },
    { label: 'Saudáveis',  value: saudaveis,         color: '#7fd47f', filter: 'saudavel' },
    { label: 'Total',      value: clients.length,    color: '#d3da47', filter: 'all' },
  ]

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#173557', borderRadius: 14, padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20, flexWrap: 'wrap',
      }}>

        {/* Avatar + saudação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.name}
              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              backgroundColor: '#0d2340', color: '#59c2ed', fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid rgba(255,255,255,0.10)',
            }}>
              {initials(profile?.name)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: '#8393A5' }}>{greeting()} · {dateStr}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginTop: 2 }}>
              {profile?.name}
            </div>
          </div>
        </div>

        {/* KPI pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {KPI_PILLS.map(pill => (
            <button
              key={pill.filter}
              onClick={() => setFilterStatus(f => f === pill.filter ? 'all' : pill.filter)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20,
                backgroundColor: filterStatus === pill.filter ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
                border: filterStatus === pill.filter ? `1.5px solid ${pill.color}` : '1px solid rgba(255,255,255,0.10)',
                cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.65)',
                transition: 'all 0.15s',
              }}
            >
              <strong style={{ color: pill.color, fontWeight: 800, fontSize: 16 }}>{pill.value}</strong>
              {pill.label}
            </button>
          ))}
        </div>

        {/* CSM filter — admin/manager only */}
        {isAdminOrManager && (
          <select
            value={selectedCsm}
            onChange={e => setSelectedCsm(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: '#fff', fontSize: 13, cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="" style={{ color: '#1a1a18', backgroundColor: '#fff' }}>Todos os CSMs</option>
            {csmList.map(p => (
              <option key={p.id} value={p.id} style={{ color: '#1a1a18', backgroundColor: '#fff' }}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── SEARCH BAR ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#aaa9a4', fontSize: 14, pointerEvents: 'none' }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Buscar empresa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px 8px 32px', borderRadius: 8,
              border: '1px solid #e8e7e3', fontSize: 13, color: '#1a1a18',
              outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box',
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: '#aaa9a4' }}>
          {filteredAndSorted.length} empresa{filteredAndSorted.length !== 1 ? 's' : ''}
          {filterStatus !== 'all' || search ? ' · filtrado' : ''}
        </span>
      </div>

      {/* ── CLIENT CARDS GRID ────────────────────────────────────────────── */}
      {filteredAndSorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa9a4', fontSize: 14 }}>
          Nenhuma empresa encontrada.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 12 }}>
          {filteredAndSorted.map(client => (
            <ClientCard key={client.id} client={client} onClick={setSelectedClient} />
          ))}
        </div>
      )}

      {/* ── DRAWER ───────────────────────────────────────────────────────── */}
      {selectedClient && (
        <ClientDrawer
          client={selectedClient}
          rules={rules}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  )
}
