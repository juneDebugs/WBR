import type { Metadata, Viewport } from 'next'
import { SessionProvider } from './session-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conference App',
  description: 'Your conference companion — schedule, speakers, and 1-1 meetings.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ConferenceApp',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6366f1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
