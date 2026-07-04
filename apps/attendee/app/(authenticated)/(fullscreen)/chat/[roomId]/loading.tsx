export default function ChatRoomLoading() {
  return (
    <div className="flex flex-col h-[100dvh] animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
        <div className="w-8 h-8 bg-fill-2 rounded-full" />
        <div className="h-5 w-28 bg-fill-2 rounded" />
      </div>
      {/* Messages area */}
      <div className="flex-1 px-4 py-4 space-y-4">
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-fill-2 rounded-full flex-shrink-0" />
          <div className="h-12 w-48 bg-fill-2 rounded-2xl" />
        </div>
        <div className="flex gap-2 justify-end">
          <div className="h-10 w-40 bg-fill-2 rounded-2xl" />
        </div>
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-fill-2 rounded-full flex-shrink-0" />
          <div className="h-16 w-56 bg-fill-2 rounded-2xl" />
        </div>
      </div>
      {/* Input area */}
      <div className="px-4 py-3 border-t border-hairline">
        <div className="h-10 bg-fill-2 rounded-full" />
      </div>
    </div>
  )
}
