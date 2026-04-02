export function Card({ children, className = '', onClick }) {
  return (
    <div
      className={`bg-bg-primary border border-border-tertiary rounded-lg p-4 ${onClick ? 'cursor-pointer hover:border-border-secondary transition-colors' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
