export default function PeopleLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="h-7 w-24 bg-gray-200 rounded mb-4" />
      {/* Search bar */}
      <div className="h-10 bg-gray-200 rounded-xl mb-4" />
      {/* Tabs */}
      <div className="flex gap-3 mb-4 border-b border-gray-200 pb-2">
        <div className="h-5 w-20 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-200 rounded" />
        <div className="h-5 w-20 bg-gray-200 rounded" />
      </div>
      {/* Person rows */}
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-full bg-gray-200" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-24 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
