export default function AttendeesLoading() {
  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Search bar skeleton */}
          <div className="p-4 border-b border-gray-100">
            <div className="h-10 w-72 bg-gray-100 rounded-xl animate-pulse" />
          </div>
          {/* Table header */}
          <div className="flex gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-44 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
