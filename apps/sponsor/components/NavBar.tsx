'use client'
import { memo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useUser, useSponsorData } from '@/lib/hooks'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/browse', label: 'Browse', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { href: '/meetings', label: 'Meetings', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { href: '/schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/submissions', label: 'Submissions', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/profile', label: 'Profile', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
]

export const NavBar = memo(function NavBar() {
  const { sponsorName, role } = useUser()
  const pathname = usePathname()
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const { data: sponsorData } = useSponsorData()
  const logoUrl = sponsorData?.sponsor?.logoUrl

  return (
    <header className="material-bar border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={sponsorName ?? 'Sponsor'} width={28} height={28} className="w-7 h-7 rounded-lg object-contain bg-white border border-hairline" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          )}
          <span className="font-bold text-ink text-sm hidden sm:block">
            {sponsorName ?? 'WBR'} <span className="text-ink-3 font-normal">· Sponsor Portal</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5">
          {NAV.map(({ href, label, icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                active(href) ? 'bg-primary/10 text-primary' : 'text-ink-2 hover:bg-fill hover:text-ink'
              }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
              <span className="hidden md:block">{label}</span>
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {role === 'STAFF' && (
            <span className="badge badge-brand hidden sm:flex">Staff</span>
          )}
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-ink-2 hover:text-ink px-2 py-1.5 rounded-lg hover:bg-fill transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
})
