export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mt-2" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card p-5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse mb-3" />
            <div className="h-7 w-12 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mt-2" />
          </div>
        ))}
      </div>

      {/* Recommendations skeleton */}
      <div>
        <div className="h-5 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-52 bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
              </div>
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mx-auto" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mx-auto" />
              <div className="h-8 bg-gray-200 rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Two-column skeleton */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-40 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
