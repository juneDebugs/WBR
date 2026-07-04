export default function ScheduleLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="skeleton h-7 w-36" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton h-5 w-48 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="card p-5 flex items-center gap-4">
                  <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
