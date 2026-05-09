export default function DashboardLoading() {
  return (
    <>
      {/* Header skeleton */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 flex-shrink-0">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="ml-auto h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
      </header>

      {/* Content skeleton */}
      <main className="flex-1 p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-28 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-50 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
