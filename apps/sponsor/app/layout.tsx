import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from './session-provider'
import { QueryProvider } from '@/lib/query-client'
import { getSession } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Sponsor Portal',
  description: 'Manage your sponsor presence at WBR 2027',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#6366f1',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/api/attendees" as="fetch" crossOrigin="anonymous" />
      </head>
      <body>
        <SessionProvider session={session}>
          <QueryProvider>{children}</QueryProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
