'use client'

import { useEffect, useState } from 'react'


interface TeamMember {
  id: string
  name: string | null
  image: string | null
  jobTitle: string | null
  company?: string | null
  email: string | null
  role: string | null
}

const ROLE_LABELS: Record<string, string> = {
  STAFF: 'WBR Staff',
  ORGANIZER: 'Organizer',
  ADMIN: 'Admin',
  SPEAKER: 'Speaker',
  ATTENDEE: 'Attendee',
}

function roleLabel(role: string | null): string | null {
  if (!role) return null
  return ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase()
}

export function TeamMembers({ members }: { members: TeamMember[] }) {
  const [selected, setSelected] = useState<TeamMember | null>(null)

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  if (members.length === 0) return null

  return (
    <>
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Your Team at WBR 2027</h2>
          <p className="text-xs text-gray-500 mt-0.5">Your dedicated WBR contacts — select a member to get in touch.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {members.map(u => (
            <button
              key={u.id}
              onClick={() => setSelected(u)}
              aria-haspopup="dialog"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors text-left w-full"
            >
              {u.image ? (
                <img src={u.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <span className="text-xs font-bold text-primary">{u.name?.[0] ?? '?'}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{u.name}</p>
                <p className="text-xs text-gray-500 truncate">{u.jobTitle ?? roleLabel(u.role)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Profile popup modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="fixed inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.name ?? 'Team member'}
            className="relative bg-surface rounded-2xl shadow-elevated max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
            >
              <svg className="w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Avatar */}
            <div className="flex flex-col items-center">
              {selected.image ? (
                <img src={selected.image} alt="" className="w-20 h-20 rounded-full object-cover ring-4 ring-gray-100" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-gray-100" aria-hidden="true">
                  <span className="text-2xl font-bold text-primary">{selected.name?.[0] ?? '?'}</span>
                </div>
              )}
              <h3 className="text-lg font-bold text-gray-900 mt-3">{selected.name}</h3>
              {(selected.jobTitle || selected.company) && (
                <p className="text-sm text-gray-500">{[selected.jobTitle, selected.company].filter(Boolean).join(' · ')}</p>
              )}
            </div>

            {/* Details */}
            <div className="space-y-3 pt-2">
              {selected.role && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-2">Role</p>
                    <p className="text-sm font-medium text-gray-900">{roleLabel(selected.role)}</p>
                  </div>
                </div>
              )}
              {selected.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-2">Email</p>
                    <a href={`mailto:${selected.email}`} className="text-sm font-medium text-primary hover:underline truncate block">
                      {selected.email}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
