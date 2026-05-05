export default function DashboardLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6">
        {/* Conference banner skeleton */}
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse mb-6" />
        {/* Stats grid skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 bg-gray-100 rounded-lg animate-pulse mb-3" />
              <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Widget skeleton */}
        <div className="mt-6 h-48 bg-gray-100 rounded-xl animate-pulse" />
      </main>
    </>
  )
}
