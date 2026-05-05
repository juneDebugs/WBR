export default function ProfileLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        ))}
        <div className="h-10 w-full bg-gray-200 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}
