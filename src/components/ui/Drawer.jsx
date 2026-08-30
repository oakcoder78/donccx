import { useEffect } from 'react'

// Shared right-side drawer shell. Extracted from the copies in
// HealthDashboardPage.jsx and DashboardPage.jsx (SDD §5.1). Overlay + fixed
// <aside> + ESC + click-outside. Defines the project's drawer z-index scale
// (previously ad-hoc 40/50 here, 99/100 in Donkie, 300/1000 in modals).
//
// The drawer is `position: fixed` and does NOT push page content — wrap the
// page body in `drawerPushStyle(open)` if you want the "content slides left"
// effect (as /health and the v3 dashboard do).

export const DRAWER_Z = { overlay: 40, aside: 50 }

/** Inline style for the page-body wrapper so content makes room for the drawer. */
export function drawerPushStyle(open, width = 380) {
  return { paddingRight: open ? width : 0, transition: 'padding-right 0.3s ease' }
}

export function Drawer({ open, onClose, children, width = 380, ariaLabel = 'Painel de detalhes' }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(14,34,58,0.18)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease', zIndex: DRAWER_Z.overlay,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-hidden={open ? undefined : 'true'}
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width,
          maxWidth: '100vw',
          background: '#ffffff', borderLeft: '0.5px solid rgba(15,34,58,0.09)',
          zIndex: DRAWER_Z.aside, display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(.3,.7,.3,1)',
          boxShadow: '-1px 0 0 rgba(15,34,58,0.04), -24px 0 48px -24px rgba(15,34,58,0.16)',
        }}
      >
        {open && children}
      </aside>
    </>
  )
}
