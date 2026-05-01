export default function SpeakersLoading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8f8fc 40%)' }}>
      <div className="px-4 pt-4 pb-3">
        <div className="h-7 w-32 bg-gray-200 rounded" />
        <div className="h-4 w-20 bg-gray-200 rounded mt-1" />
      </div>
      <div className="px-4 grid grid-cols-2 gap-3 mt-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="aspect-[3/4] bg-gray-200 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
