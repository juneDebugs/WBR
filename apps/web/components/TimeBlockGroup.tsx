'use client'

import { useState } from 'react'

interface Props {
  label: string
  count: number
  badgeClass: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function TimeBlockGroup({ label, count, badgeClass, children, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 mb-3 w-full group px-4 py-2.5 bg-pink-500 hover:bg-pink-600 rounded-xl transition-colors"
      >
        <span className="text-sm font-bold text-white">{label}</span>
        <span className="text-xs text-pink-200 font-medium">{count} {label.toLowerCase()}</span>
        <svg
          className={`w-4 h-4 text-white ml-auto transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
  )
}
