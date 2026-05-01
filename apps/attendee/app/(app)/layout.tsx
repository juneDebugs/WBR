import { BottomNav } from '@/components/BottomNav'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh]" style={{ background: '#f0ece4' }}>
      <PushNotificationSetup />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
