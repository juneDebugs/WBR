export default function ProfileLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="skeleton h-7 w-32" />
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="skeleton w-20 h-20 rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-10 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
