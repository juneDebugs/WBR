import { BottomNav } from '@/components/BottomNav'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <PushNotificationSetup />
      <main className="pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
