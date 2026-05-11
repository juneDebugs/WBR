export default function SessionDetailLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="w-8 h-8 bg-gray-200 rounded-full" />
      </div>
      <div className="card">
        <div className="flex gap-2 mb-3">
          <div className="h-5 w-16 bg-gray-200 rounded-full" />
          <div className="h-5 w-20 bg-gray-200 rounded-full" />
        </div>
        <div className="h-6 w-3/4 bg-gray-200 rounded mb-3" />
        <div className="flex gap-4 mb-4">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-5/6" />
          <div className="h-3 bg-gray-200 rounded w-4/6" />
        </div>
      </div>
      <div className="card mt-4">
        <div className="h-3 w-16 bg-gray-200 rounded mb-3" />
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-200" />
          <div>
            <div className="h-4 w-28 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-36 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
