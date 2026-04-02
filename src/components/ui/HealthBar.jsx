export function HealthBar({ value = 0, max = 20, color, className = '' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const bg = color || (pct >= 75 ? '#1D9E75' : pct >= 50 ? '#BA7517' : '#E24B4A')
  return (
    <div className={`h-1.5 bg-bg-tertiary rounded-full overflow-hidden ${className}`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: bg }} />
    </div>
  )
}

export function HealthScore({ score = 0, showLabel = true }) {
  const color = score >= 75 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'
  const label = score >= 75 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Em Risco'
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold" style={{ color }}>{score}</span>
      {showLabel && (
        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}15`, color }}>
          {label}
        </span>
      )}
    </div>
  )
}
