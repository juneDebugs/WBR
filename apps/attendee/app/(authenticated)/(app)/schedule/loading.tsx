export default function ScheduleLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="h-7 w-48 bg-fill-2 rounded mb-2" />
      <div className="h-4 w-32 bg-fill-2 rounded mb-6" />
      {/* Day tabs */}
      <div className="flex gap-2 mb-4">
        <div className="h-9 w-20 bg-fill-2 rounded-full" />
        <div className="h-9 w-20 bg-fill-2 rounded-full" />
      </div>
      {/* Session cards */}
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-24 bg-fill-2 rounded-2xl mb-3" />
      ))}
    </div>
  )
}
