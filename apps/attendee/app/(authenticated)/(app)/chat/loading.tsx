export default function ChatLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="px-4 pt-3 pb-3 flex items-center justify-between border-b border-hairline">
        <div className="h-6 w-24 bg-fill-2 rounded" />
        <div className="w-8 h-8 bg-fill-2 rounded" />
      </div>
      <div className="pb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-14 h-14 rounded-full bg-fill-2" />
            <div className="flex-1">
              <div className="h-4 w-28 bg-fill-2 rounded mb-2" />
              <div className="h-3 w-48 bg-fill-2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
