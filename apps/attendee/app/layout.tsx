import type { Metadata, Viewport } from 'next'
import { SessionProvider } from './session-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mobile App',
  description: 'Your conference companion — schedule, speakers, and 1-1 meetings.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mobile App',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6366f1',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased flex justify-center min-h-screen">
        <div className="w-full max-w-[430px] min-h-screen shadow-2xl bg-gray-50 relative">
          <SessionProvider>{children}</SessionProvider>
        </div>
      </body>
    </html>
  )
}
