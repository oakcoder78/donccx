import { useEffect } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

// Keeps Tab/Shift+Tab inside `ref` while `active`, moves focus in on open and
// returns it to the element that had it before, on close (WCAG 2.4.3).
export function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return undefined
    const previous = document.activeElement
    const root = ref.current

    const first = root.querySelector(FOCUSABLE)
    ;(first || root).focus()

    const onKey = e => {
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) { e.preventDefault(); return }
      const head = items[0]
      const tail = items[items.length - 1]
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
    }

    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('keydown', onKey)
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [ref, active])
}
