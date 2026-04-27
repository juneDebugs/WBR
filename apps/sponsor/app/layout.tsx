import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from './session-provider'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Sponsor Portal',
  description: 'Manage your sponsor presence at WBR 2027',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#6366f1',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  )
}
