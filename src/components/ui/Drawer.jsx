import { useEffect, useState } from 'react'

export function Drawer({ isOpen, onClose, title, children }) {
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
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-lg bg-bg-primary shadow-xl transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-tertiary">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-tertiary"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto" style={{ height: 'calc(100vh - 60px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
