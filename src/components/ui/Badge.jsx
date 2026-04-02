const variants = {
  green:  'bg-donc-verde/10 text-donc-verde',
  amber:  'bg-donc-amber/10 text-donc-amber',
  red:    'bg-donc-red/10 text-donc-red',
  sky:    'bg-donc-sky/10 text-donc-sky',
  slate:  'bg-bg-tertiary text-text-secondary',
  purple: 'bg-donc-purple/10 text-donc-purple',
  navy:   'bg-donc-navy/10 text-donc-navy',
  blue:   'bg-donc-blue/10 text-donc-blue',
  lime:   'bg-donc-lime/20 text-donc-navy',
}

export function Badge({ variant = 'slate', children, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant] || variants.slate} ${className}`}>
      {children}
    </span>
  )
}
