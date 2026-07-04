export default function ProfileLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="skeleton h-7 w-32" />
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="skeleton w-16 h-16 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-28" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-10 rounded-xl" />
          </div>
        ))}
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
    </div>
  )
}
