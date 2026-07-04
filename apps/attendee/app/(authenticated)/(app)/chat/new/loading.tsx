export default function NewMessageLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="px-4 pt-3 pb-3 flex items-center gap-4 border-b border-hairline">
        <div className="w-6 h-6 bg-fill-2 rounded" />
        <div className="h-5 w-28 bg-fill-2 rounded" />
      </div>
      <div className="px-4 pt-4">
        <div className="h-10 bg-fill-2 rounded-xl mb-4" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-fill-2" />
            <div className="flex-1">
              <div className="h-4 w-28 bg-fill-2 rounded mb-1" />
              <div className="h-3 w-20 bg-fill-2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
