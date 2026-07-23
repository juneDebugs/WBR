'use client'
import { useEffect, useRef, type ReactNode } from 'react'

// A right-edge side sheet (assign / reschedule) — light scrim, focus-trapped,
// Esc-to-close, focus returns to the trigger. role=dialog per HIG.
export function SideSheet({
  title, subtitle, onClose, children, footer, labelId = 'sheet-title',
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  labelId?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(onClose, panelRef)
  return (
    <div className="sheet-scrim" onMouseDown={onClose} role="presentation">
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-hairline">
          <div className="min-w-0">
            <h2 id={labelId} className="text-title3 text-ink truncate">{title}</h2>
            {subtitle && <p className="text-footnote text-ink-2 mt-0.5">{subtitle}</p>}
          </div>
          <button className="icon-btn icon-btn-sm flex-shrink-0" onClick={onClose} aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-hairline material-bar">{footer}</footer>}
      </div>
    </div>
  )
}

// A centered alert-dialog (cancel) — heavier scrim + blur = stop-and-decide.
export function CenterModal({
  title, describedById, onClose, children, footer, labelId = 'modal-title',
}: {
  title: ReactNode
  describedById?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  labelId?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(onClose, panelRef)
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="card w-full max-w-[480px] p-0 overflow-hidden"
        style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={describedById}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-hairline">
          <h2 id={labelId} className="text-title3 text-ink">{title}</h2>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-4 border-t border-hairline flex gap-2 justify-end">{footer}</footer>}
      </div>
    </div>
  )
}

// Shared dialog behavior: Esc to close, focus trap, restore focus on unmount.
function useDialog(onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null
    // Move focus into the panel (first focusable, else the panel itself).
    const panel = panelRef.current
    const focusable = panel?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable ?? panel)?.focus?.()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'Tab' && panel) {
        const nodes = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(n => n.offsetParent !== null)
        if (nodes.length === 0) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      prevActive?.focus?.()
    }
  }, [onClose, panelRef])
}
