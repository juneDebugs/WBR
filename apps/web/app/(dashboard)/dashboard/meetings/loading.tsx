export default function MeetingsLoading() {
  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6 max-w-6xl">
        {/* Tabs skeleton */}
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-36 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-9 w-32 bg-gray-100 rounded-xl animate-pulse" />
          <div className="ml-auto h-9 w-32 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="h-2 w-16 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-7 w-10 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Filter row skeleton */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex gap-4">
            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
              <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
              <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
