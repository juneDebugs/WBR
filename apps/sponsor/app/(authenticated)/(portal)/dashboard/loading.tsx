export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header skeleton */}
      <div>
        <div className="skeleton h-7 w-64" />
        <div className="skeleton h-4 w-40 mt-2" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card p-5">
            <div className="skeleton w-10 h-10 rounded-xl mb-3" />
            <div className="skeleton h-7 w-12" />
            <div className="skeleton h-3 w-20 mt-2" />
          </div>
        ))}
      </div>

      {/* Two-column skeleton */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-20" />
          </div>
          <div className="skeleton h-2.5 rounded-full" />
          <div className="skeleton h-4 w-24" />
        </div>
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="skeleton h-5 w-48" />
            <div className="skeleton h-3 w-16" />
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-3 w-40" />
              </div>
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
