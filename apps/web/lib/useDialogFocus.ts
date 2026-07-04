import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Minimal dialog focus management (HIG/ARIA dialog pattern): when the dialog
// opens, move focus inside it; keep Tab cycling within it (aria-modal hides
// the page behind from assistive tech, so focus must not escape); when it
// closes, return focus to the element that opened it.
export function useDialogFocus<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    if (!dialog) return

    const trigger = document.activeElement as HTMLElement | null
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? dialog).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    dialog.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('keydown', onKey)
      trigger?.focus()
    }
  }, [open])

  return ref
}
