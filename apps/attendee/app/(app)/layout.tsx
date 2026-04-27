import { BottomNav } from '@/components/BottomNav'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#f0ece4' }}>
      <PushNotificationSetup />
      <main style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
