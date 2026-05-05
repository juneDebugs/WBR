export default function ChatLoading() {
  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6">
        <div className="flex gap-4 h-[calc(100vh-180px)]">
          <div className="w-72 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                  <div className="h-2 w-32 bg-gray-50 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-white border border-gray-200 rounded-xl animate-pulse" />
        </div>
      </main>
    </>
  )
}
