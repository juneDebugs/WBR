'use client'

import { useState } from 'react'
import Image from 'next/image'

interface TeamMember {
  id: string
  name: string | null
  image: string | null
  jobTitle: string | null
  email: string | null
  role: string | null
}

export function TeamMembers({ members }: { members: TeamMember[] }) {
  const [selected, setSelected] = useState<TeamMember | null>(null)

  if (members.length === 0) return null

  return (
    <>
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Your Team at WBR 2027</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {members.map(u => (
            <button
              key={u.id}
              onClick={() => setSelected(u)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left w-full"
            >
              {u.image ? (
                <Image src={u.image} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{u.name?.[0] ?? '?'}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{u.name}</p>
                <p className="text-xs text-gray-500 truncate">{u.jobTitle}</p>
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
            className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Avatar */}
            <div className="flex flex-col items-center">
              {selected.image ? (
                <Image src={selected.image} alt="" width={80} height={80} className="w-20 h-20 rounded-full object-cover ring-4 ring-gray-100" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-gray-100">
                  <span className="text-2xl font-bold text-primary">{selected.name?.[0] ?? '?'}</span>
                </div>
              )}
              <h3 className="text-lg font-bold text-gray-900 mt-3">{selected.name}</h3>
              {selected.jobTitle && (
                <p className="text-sm text-gray-500">{selected.jobTitle}</p>
              )}
            </div>

            {/* Details */}
            <div className="space-y-3 pt-2">
              {selected.role && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Role</p>
                    <p className="text-sm font-medium text-gray-900">{selected.role}</p>
                  </div>
                </div>
              )}
              {selected.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">Email</p>
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
