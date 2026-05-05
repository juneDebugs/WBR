export default function SubmissionsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
        <div className="h-10 w-28 bg-gray-200 rounded-xl animate-pulse" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl px-5 py-4 border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
              <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="h-8 w-28 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
