export function StagePill({ name, color = '#59c2ed', className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  )
}
