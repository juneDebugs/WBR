export default function MeetingsLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="h-7 w-28 bg-fill-2 rounded mb-2" />
      <div className="h-4 w-40 bg-fill-2 rounded mb-6" />
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 bg-fill-2 rounded-2xl mb-3" />
      ))}
    </div>
  )
}
