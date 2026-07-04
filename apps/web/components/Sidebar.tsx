'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

const nav = [
  {
    title: null,
    items: [
      {
        href: '/dashboard',
        label: 'Overview',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        ),
      },
    ],
  },
  {
    title: 'Program',
    items: [
      {
        href: '/dashboard/calendar',
        label: 'Calendar',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        ),
      },
      {
        href: '/dashboard/sessions',
        label: 'Agenda',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        ),
      },
      {
        href: '/dashboard/speakers',
        label: 'Speakers',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        ),
      },
    ],
  },
  {
    title: 'Meetings',
    items: [
      {
        href: '/dashboard/meetings',
        label: 'Meetings',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        ),
      },
      {
        href: '/dashboard/time-blocks',
        label: 'Time Blocks',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        ),
      },
    ],
  },
  {
    title: 'People',
    items: [
      {
        href: '/dashboard/attendees',
        label: 'Attendees',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        ),
      },
      {
        href: '/dashboard/staff',
        label: 'Staff',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zM10.5 15.75c0-1.036-.84-1.875-1.875-1.875h-1.5c-1.035 0-1.875.84-1.875 1.875V18h5.25v-2.25z" />
        ),
      },
      {
        href: '/dashboard/sponsors',
        label: 'Sponsors',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        ),
      },
    ],
  },
  {
    title: 'Communications',
    items: [
      {
        href: '/dashboard/chat',
        label: 'Chat',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        ),
      },
      {
        href: '/dashboard/email',
        label: 'Email',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        ),
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        href: '/dashboard/integrations',
        label: 'Integrations',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        ),
      },
      {
        href: '/dashboard/app-settings',
        label: 'App Settings',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        ),
      },
      {
        href: '/dashboard/access',
        label: 'Access',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        ),
      },
      {
        href: '/dashboard/export',
        label: 'Export',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        ),
      },
    ],
  },
]

// The blue→pink range is split into one contiguous segment per icon: each icon
// fades vertically through its own slice, so the column reads as one continuous fade
const navHrefs = nav.flatMap((section) => section.items.map((item) => item.href))

function colorAt(t: number) {
  const from = [59, 130, 246] // #3b82f6 blue
  const to = [236, 72, 153] // #ec4899 pink
  const [r, g, b] = from.map((c, i) => Math.round(c + (to[i] - c) * t))
  return `rgb(${r}, ${g}, ${b})`
}

export function Sidebar({ allowedHrefs }: { allowedHrefs?: string[] }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  // When the server passes an allow-list, hide destinations the role can't
  // reach and drop sections left with no visible items. Overview is always in
  // the list. No prop (older callers / tests) => show everything.
  const allow = allowedHrefs ? new Set(allowedHrefs) : null
  const sections = allow
    ? nav
        .map(section => ({ ...section, items: section.items.filter(item => allow.has(item.href)) }))
        .filter(section => section.items.length > 0)
    : nav

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 h-screen sticky top-0 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="WBR" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-gray-900 text-sm">WBR Admin</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href)
                const idx = navHrefs.indexOf(item.href)
                const gradId = `nav-grad-${idx}`
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke={`url(#${gradId})`}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor={colorAt(idx / navHrefs.length)} />
                          <stop offset="100%" stopColor={colorAt((idx + 1) / navHrefs.length)} />
                        </linearGradient>
                      </defs>
                      {item.icon}
                    </svg>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile + sign out */}
      <div className="px-3 py-3 border-t border-gray-200">
        <div className="flex items-center gap-2.5 px-2 py-2">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? ''}
              width={32}
              height={32}
              className="rounded-full flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-sm font-semibold">
                {session?.user?.name?.[0] ?? 'A'}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name ?? 'Admin'}</p>
            <p className="text-[10px] text-gray-400 truncate">{session?.user?.email ?? ''}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
