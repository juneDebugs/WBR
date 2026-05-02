export default function ProfileLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-gray-100 rounded-xl animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-50 rounded animate-pulse" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}
