'use client'
import { memo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { isWbrStaff } from '@conference/db/src/app-access'

interface Props { role: string }

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', exact: true },
  { href: '/browse', label: 'Browse', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { href: '/meetings', label: 'Meetings', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { href: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

const STAFF_NAV = { href: '/staff', label: 'Engine', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }

export const NavBar = memo(function NavBar({ role }: Props) {
  const pathname = usePathname()
  const active = (href: string, exact?: boolean) => {
    if (href === '/meetings') return pathname === '/meetings' || pathname === '/requests' || pathname.startsWith('/meetings/')
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  }

  const staff = isWbrStaff(role)
  const items = staff ? [...NAV.slice(0, -1), STAFF_NAV, NAV[NAV.length - 1]] : NAV

  return (
    <header className="material-bar border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/icons/logo.svg" alt="WBR" className="w-7 h-7 rounded-lg" />
          <span className="font-bold text-ink text-sm hidden sm:block">
            WBR <span className="text-ink-3 font-normal">· Meeting Portal</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5">
          {items.map(({ href, label, icon, exact }: any) => (
            <Link key={href} href={href}
              className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                active(href, exact) ? 'bg-primary/10 text-primary' : 'text-ink-2 hover:bg-fill hover:text-ink'
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
          {staff && (
            <span className="badge badge-brand hidden sm:flex">Staff</span>
          )}
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-ink-2 hover:text-ink px-2 min-h-[44px] inline-flex items-center rounded-lg hover:bg-fill transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
})
