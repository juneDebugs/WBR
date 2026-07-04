export default function MyScheduleLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="h-7 w-36 bg-fill-2 rounded mb-2" />
      <div className="h-4 w-56 bg-fill-2 rounded mb-6" />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-20 bg-fill-2 rounded-2xl mb-3" />
      ))}
    </div>
  )
}
