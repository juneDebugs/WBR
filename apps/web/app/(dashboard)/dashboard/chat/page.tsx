import { AdminHeader } from '@/components/AdminHeader'
import { ChatPageClient } from '@/components/ChatPageClient'

export default function ChatPage() {
  return (
    <>
      <AdminHeader title="Chat" />
      <main className="flex-1 p-6">
        <ChatPageClient />
      </main>
    </>
  )
}
