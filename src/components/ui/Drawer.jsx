import { useEffect, useState } from 'react'

export function Drawer({ isOpen, onClose, title, children, width = 'max-w-lg', noBackdrop = false }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [isOpen])

  if (!isOpen && !visible) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {!noBackdrop && (
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 pointer-events-auto ${visible ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
      )}
      <div
        className={`absolute top-[60px] bottom-4 right-4 ${width} bg-bg-primary rounded-lg shadow-xl pointer-events-auto transition-all duration-200 flex flex-col overflow-hidden ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-tertiary shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-tertiary"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 px-4 py-3 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
