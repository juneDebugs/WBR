export default function StaffLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
            <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="card p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
