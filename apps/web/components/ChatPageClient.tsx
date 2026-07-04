'use client'

import { useChatData } from '@/lib/hooks'
import { GlobalChatAdmin } from '@/components/GlobalChatAdmin'
import { DMRoomsClient } from '@/components/DMRoomsClient'

export function ChatPageClient({ initialData }: { initialData?: any }) {
  const { data, isLoading } = useChatData(initialData)

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-48 bg-gray-50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <GlobalChatAdmin
        memberCount={data.memberCount}
        totalUsers={data.totalUsers}
        messageCount={data.messageCount}
        recentMessages={data.recentMessages}
      />

      <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-3">
        Direct Messages — {data.rooms.length} conversation{data.rooms.length !== 1 ? 's' : ''}
      </p>
      <DMRoomsClient rooms={data.rooms} />
    </>
  )
}
