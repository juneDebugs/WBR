'use client'
import { useEffect, useRef, type ReactNode } from 'react'

// eTail-style centered modal: dark title bar + X, bordered body, optional footer.
export function EtailModal({
  title, onClose, children, footer, width = 560,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    ;(panel?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? panel)?.focus?.()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'Tab' && panel) {
        const nodes = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(n => n.offsetParent !== null)
        if (!nodes.length) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prevOverflow; prev?.focus?.() }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-6 bg-black/50" onMouseDown={onClose} role="presentation" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onMouseDown={e => e.stopPropagation()}
        className="bg-white shadow-2xl mt-8"
        style={{ width, maxWidth: '100%', border: '1px solid #adb5bd', borderRadius: 4 }}
      >
        <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: '#22406a', borderTopLeftRadius: 3, borderTopRightRadius: 3 }}>
          <h2 className="text-white text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-white/80 hover:text-white text-xl leading-none px-1">×</button>
        </div>
        <div className="px-4 py-3 text-[13px] text-[#333]">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-[#e5e5e5] bg-[#f7f7f7] flex justify-end gap-2" style={{ borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }}>{footer}</div>}
      </div>
    </div>
  )
}

// Small eTail buttons.
export function EtailBtn({ variant = 'default', children, ...rest }: { variant?: 'primary' | 'success' | 'danger' | 'default' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<string, string> = {
    primary: 'bg-[#337ab7] hover:bg-[#286090] text-white border-[#2e6da4]',
    success: 'bg-[#5cb85c] hover:bg-[#449d44] text-white border-[#4cae4c]',
    danger: 'bg-[#d9534f] hover:bg-[#c9302c] text-white border-[#d43f3a]',
    default: 'bg-white hover:bg-[#e6e6e6] text-[#333] border-[#ccc]',
  }
  return (
    <button {...rest} className={`text-[13px] px-3 py-1.5 rounded border disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${rest.className ?? ''}`}>
      {children}
    </button>
  )
}
