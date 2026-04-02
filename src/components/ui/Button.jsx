const variants = {
  primary:   'bg-donc-navy text-white hover:bg-donc-navy/90',
  secondary: 'bg-bg-tertiary text-text-primary border border-border-tertiary hover:bg-bg-tertiary/70',
  green:     'bg-donc-verde text-white hover:bg-donc-verde/90',
  danger:    'bg-donc-red text-white hover:bg-donc-red/90',
  ghost:     'text-text-secondary hover:bg-bg-tertiary',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-2 font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
