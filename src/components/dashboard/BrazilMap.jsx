import { useState, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as d3 from 'd3'

const GEO_URL =
  'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson'

const LEGEND = [
  { color: '#e8edf2',              label: 'Sem clientes'  },
  { color: 'rgba(89,194,237,0.4)', label: '1 cliente'     },
  { color: 'rgba(89,194,237,0.7)', label: '2–3 clientes'  },
  { color: '#173557',              label: '4+ clientes'   },
]

function stateColor(count) {
  if (!count)    return '#e8edf2'
  if (count === 1) return 'rgba(89,194,237,0.4)'
  if (count <= 3)  return 'rgba(89,194,237,0.7)'
  return '#173557'
}

const W = 400
const H = 370

export function BrazilMap({ clients, onSelectUF }) {
  const [tooltip, setTooltip] = useState(null)
  const containerRef = useRef()

  const { data: geoData, isError } = useQuery({
    queryKey: ['brazil_geojson'],
    queryFn: async () => {
      const res = await fetch(GEO_URL)
      if (!res.ok) throw new Error(`geojson ${res.status}`)
      return res.json()
    },
    staleTime: Infinity,
    gcTime:    Infinity,
    retry: 1,
  })

  // Group active clients by state
  const stateMap = useMemo(() => {
    const m = {}
    clients.forEach(c => {
      const st = c.address_state?.trim().toUpperCase()
      if (st) {
        if (!m[st]) m[st] = []
        m[st].push(c.fantasy_name || c.name)
      }
    })
    return m
  }, [clients])

  const topStates = useMemo(
    () => Object.entries(stateMap)
      .map(([uf, list]) => ({ uf, count: list.length }))
      .sort((a, b) => b.count - a.count),
    [stateMap],
  )

  function handleMouseMove(e, feature) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      x:       e.clientX - rect.left,
      y:       e.clientY - rect.top,
      sigla:   feature.properties.sigla,
      nome:    feature.properties.nome || feature.properties.name || feature.properties.sigla,
      clients: stateMap[feature.properties.sigla] || [],
    })
  }

  // Graceful degrade — external GeoJSON blocked/offline: show the ranked list, not a blank box.
  if (isError || (!geoData && topStates.length === 0)) {
    return (
      <div style={{ padding: '8px 0' }}>
        {isError && (
          <p style={{ fontSize: 12, color: '#888780', marginBottom: 10 }}>
            Mapa indisponível — exibindo a distribuição por estado.
          </p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {topStates.map(({ uf, count }) => (
            <li key={uf}>
              <button
                type="button"
                onClick={() => onSelectUF?.(uf)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(15,34,58,0.12)',
                  background: 'transparent', cursor: onSelectUF ? 'pointer' : 'default', font: 'inherit',
                }}
              >
                <span style={{ fontWeight: 600, color: '#0e223a', fontSize: 13 }}>{uf}</span>
                <span style={{ color: '#3b4a5e', fontSize: 13 }}>{count} cliente{count !== 1 ? 's' : ''}</span>
              </button>
            </li>
          ))}
          {topStates.length === 0 && (
            <li style={{ fontSize: 13, color: '#888780' }}>Sem clientes com estado informado.</li>
          )}
        </ul>
      </div>
    )
  }

  if (!geoData) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888780', fontSize: 13 }}>
        Carregando mapa…
      </div>
    )
  }

  const projection = d3.geoMercator().fitSize([W, H], geoData)
  const pathGen    = d3.geoPath().projection(projection)

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', height: H }}
        role="img"
        aria-label="Mapa do Brasil com a distribuição de clientes por estado"
      >
        {geoData.features.map((feat, i) => {
          const sigla = feat.properties.sigla
          const count = stateMap[sigla]?.length || 0
          const clickable = count > 0 && !!onSelectUF
          return (
            <path
              key={sigla || i}
              d={pathGen(feat) || ''}
              fill={stateColor(count)}
              stroke="#fff"
              strokeWidth={0.8}
              onMouseMove={e => handleMouseMove(e, feat)}
              onMouseLeave={() => setTooltip(null)}
              onClick={clickable ? () => onSelectUF(sigla) : undefined}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
            />
          )
        })}
      </svg>

      {tooltip && (
        <div
          style={{
            position:      'absolute',
            left:          tooltip.x + (tooltip.x > 260 ? -170 : 14),
            top:           Math.max(tooltip.y - 10, 0),
            backgroundColor: '#1a1a18',
            color:          '#fff',
            fontSize:       12,
            padding:        '6px 10px',
            borderRadius:   6,
            pointerEvents:  'none',
            zIndex:         10,
            maxWidth:       180,
            lineHeight:     1.6,
            boxShadow:      '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontWeight: 600 }}>{tooltip.nome} ({tooltip.sigla})</div>
          {tooltip.clients.length > 0 ? (
            <div style={{ color: '#59c2ed', marginTop: 3 }}>
              {tooltip.clients.slice(0, 5).map((n, i) => <div key={i}>• {n}</div>)}
              {tooltip.clients.length > 5 && (
                <div style={{ color: '#8393A5' }}>+{tooltip.clients.length - 5} mais</div>
              )}
            </div>
          ) : (
            <div style={{ color: '#8393A5', marginTop: 2 }}>Sem clientes</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: '#3b4a5e', alignItems: 'center' }}>
        {LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, backgroundColor: color, border: '0.5px solid #d4d3ce' }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
