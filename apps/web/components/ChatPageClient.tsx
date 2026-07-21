'use client'

import { useChatData } from '@/lib/hooks'
import { GlobalChatAdmin } from '@/components/GlobalChatAdmin'

export function ChatPageClient({ initialData }: { initialData?: any }) {
  const { data, isLoading } = useChatData(initialData)

  if (isLoading || !data) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 w-full bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <GlobalChatAdmin
      memberCount={data.memberCount}
      totalUsers={data.totalUsers}
      messageCount={data.messageCount}
      recentMessages={data.recentMessages}
    />
  )
}
