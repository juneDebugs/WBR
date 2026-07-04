export default function SpeakersLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="px-4 pt-4 pb-3">
        <div className="h-7 w-32 bg-fill-2 rounded" />
        <div className="h-4 w-20 bg-fill-2 rounded mt-1" />
      </div>
      <div className="px-4 grid grid-cols-2 gap-3 mt-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="aspect-[3/4] bg-fill-2 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
