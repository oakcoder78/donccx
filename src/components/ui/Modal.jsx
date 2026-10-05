import { useEffect, useId, useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'

// Centred dialog. Escape closes; a click on the backdrop does NOT (a form the
// user is filling would be lost). Focus is trapped while open and returned on
// close. API unchanged for the existing callers.
export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-2xl' }) {
  const panelRef = useRef(null)
  const titleId = useId()
  useFocusTrap(panelRef, isOpen)

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative mx-auto mt-[60px] mb-8 ${maxWidth} bg-bg-primary rounded-lg shadow-xl`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-tertiary">
          <h2 id={titleId} className="text-base font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-tertiary focus-visible:outline-2 focus-visible:outline-donc-blue"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
