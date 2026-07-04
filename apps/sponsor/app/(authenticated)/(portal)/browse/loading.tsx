export default function BrowseLoading() {
  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar skeleton */}
      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 border-r border-hairline bg-surface">
        <div className="p-5 space-y-5">
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-10 rounded-xl" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-3.5 w-24" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 3 + (i % 3) }).map((_, j) => (
                  <div key={j} className="skeleton h-7 w-20 rounded-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">
          <div className="mb-4">
            <div className="skeleton h-5 w-56" />
            <div className="skeleton h-3 w-20 mt-1.5" />
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="card flex flex-col gap-3 border-t-4 border-hairline">
                <div className="flex items-start gap-3">
                  <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-28" />
                    <div className="skeleton h-3 w-36" />
                    <div className="skeleton h-3 w-20" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <div className="skeleton h-5 w-20 rounded-full" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-14 rounded-full" />
                </div>
                <div className="skeleton h-8" />
                <div className="skeleton h-10 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
