import { useState, useRef } from 'react'
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

export function BrazilMap({ clients }) {
  const [tooltip, setTooltip] = useState(null)
  const containerRef = useRef()

  const { data: geoData } = useQuery({
    queryKey: ['brazil_geojson'],
    queryFn: async () => {
      const res = await fetch(GEO_URL)
      return res.json()
    },
    staleTime: Infinity,
    gcTime:    Infinity,
  })

  // Group active clients by state
  const stateMap = {}
  clients.forEach(c => {
    const st = c.address_state?.trim().toUpperCase()
    if (st) {
      if (!stateMap[st]) stateMap[st] = []
      stateMap[st].push(c.fantasy_name || c.name)
    }
  })

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
        aria-label="Mapa do Brasil"
      >
        {geoData.features.map((feat, i) => {
          const sigla = feat.properties.sigla
          const count = stateMap[sigla]?.length || 0
          return (
            <path
              key={sigla || i}
              d={pathGen(feat) || ''}
              fill={stateColor(count)}
              stroke="#fff"
              strokeWidth={0.8}
              onMouseMove={e => handleMouseMove(e, feat)}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: count > 0 ? 'pointer' : 'default' }}
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
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: '#888780', alignItems: 'center' }}>
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
