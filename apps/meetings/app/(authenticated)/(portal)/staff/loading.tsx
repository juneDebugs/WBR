export default function StaffLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="skeleton h-7 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="skeleton w-10 h-10 rounded-xl" />
            <div className="skeleton h-6 w-12" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="card p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="skeleton h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
