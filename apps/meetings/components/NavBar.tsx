'use client'
import { memo } from 'react'
import { signOut } from 'next-auth/react'
import { usePortalNav } from '@/lib/portal-nav'

interface Props { role: string }

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', exact: true },
  { href: '/browse', label: 'Browse', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { href: '/requests', label: 'My Requests', icon: 'M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20' },
  { href: '/meetings', label: 'Meetings', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { href: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

const STAFF_NAV = { href: '/staff', label: 'Finalize', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }

export const NavBar = memo(function NavBar({ role }: Props) {
  const { currentPath, navigate } = usePortalNav()
  const active = (href: string, exact?: boolean) =>
    exact ? currentPath === href : currentPath === href || currentPath.startsWith(href + '/')

  const items = role === 'STAFF' ? [...NAV.slice(0, -1), STAFF_NAV, NAV[NAV.length - 1]] : NAV

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/icons/logo.svg" alt="WBR" className="w-7 h-7 rounded-lg" />
          <span className="font-bold text-gray-900 text-sm hidden sm:block">
            WBR <span className="text-gray-400 font-normal">· Meeting Portal</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5">
          {items.map(({ href, label, icon, exact }: any) => (
            <button key={href} onClick={() => navigate(href)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active(href, exact) ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
              <span className="hidden md:block">{label}</span>
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {role === 'STAFF' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 hidden sm:flex">Staff</span>
          )}
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
})
