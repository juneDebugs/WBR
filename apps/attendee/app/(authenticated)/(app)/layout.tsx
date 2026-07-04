import { BottomNav } from '@/components/BottomNav'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'
import { BackgroundPrefetch } from '@/components/BackgroundPrefetch'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh]">
      <PushNotificationSetup />
      <BackgroundPrefetch />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
