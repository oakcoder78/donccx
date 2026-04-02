function hashColor(name = '') {
  const colors = ['#173557','#59c2ed','#1D9E75','#BA7517','#534AB7','#185FA5','#0091AE','#E24B4A']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

const sizes = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
}

export function Avatar({ name, size = 'md', className = '' }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 ${sizes[size]} ${className}`}
      style={{ backgroundColor: hashColor(name) }}
    >
      {initials(name)}
    </div>
  )
}
