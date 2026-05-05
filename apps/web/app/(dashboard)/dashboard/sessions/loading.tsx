export default function SessionsLoading() {
  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-16 h-4 bg-gray-100 rounded animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-32 bg-gray-50 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
