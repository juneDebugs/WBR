import type { Metadata } from 'next'
import { SessionProvider } from './session-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conference Admin',
  description: 'Conference organizer dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
