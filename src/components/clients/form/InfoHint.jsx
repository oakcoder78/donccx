import { useEffect, useRef, useState } from 'react'
import { Icons } from '@/lib/icons'

/**
 * Discreet "?" affordance. The only place a form section carries an explanation
 * or a worked example — keeps section headers clean and jargon-free.
 *
 * Usage: <InfoHint>Texto curto em linguagem de negócio. Ex: R$ 4.000 = 2.500 + 1.500.</InfoHint>
 */
export function InfoHint({ children, label = 'Ajuda', align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="inline-flex text-text-tertiary hover:text-text-primary transition-colors"
      >
        <Icons.HelpCircle size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-6 z-50 w-64 max-w-xs rounded-md border border-border-tertiary bg-bg-primary p-3 text-xs font-normal leading-relaxed text-text-secondary shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </span>
      )}
    </span>
  )
}
