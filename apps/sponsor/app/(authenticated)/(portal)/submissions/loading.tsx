export default function SubmissionsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72 mt-2" />
        </div>
        <div className="skeleton h-11 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton w-10 h-10 rounded-xl mb-3" />
            <div className="skeleton h-7 w-12" />
            <div className="skeleton h-3 w-20 mt-2" />
          </div>
        ))}
      </div>
      <div className="card p-0 overflow-hidden divide-y divide-hairline">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="skeleton h-8 w-28 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
