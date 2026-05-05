export default function BrowseLoading() {
  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar skeleton */}
      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 border-r border-gray-100 bg-white">
        <div className="p-5 space-y-5">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3.5 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 3 + (i % 3) }).map((_, j) => (
                  <div key={j} className="h-7 w-20 bg-gray-100 rounded-full animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">
          {/* Tab bar skeleton */}
          <div className="flex gap-2 mb-4">
            <div className="h-9 w-24 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-9 w-24 bg-gray-100 rounded-xl animate-pulse" />
          </div>
          <div className="mb-4">
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mt-1.5" />
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="card flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-8 bg-gray-100 rounded animate-pulse" />
                <div className="h-10 bg-gray-200 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
