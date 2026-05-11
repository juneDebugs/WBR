export default function PersonProfileLoading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: '#f0ece4' }}>
      {/* Nav bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="h-4 w-16 bg-gray-200 rounded" />
      </div>
      {/* Avatar + name */}
      <div className="flex flex-col items-center pt-4 pb-5 px-4">
        <div className="w-[100px] h-[100px] rounded-full bg-gray-200" />
        <div className="h-6 w-36 bg-gray-200 rounded mt-3" />
        <div className="h-4 w-48 bg-gray-200 rounded mt-2" />
      </div>
      {/* Action buttons */}
      <div className="flex justify-center gap-4 px-6 pb-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-[42px] h-[42px] rounded-full bg-gray-200" />
            <div className="h-2 w-10 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      {/* Info sections */}
      <div className="px-4 pb-28 space-y-5">
        <div>
          <div className="h-3 w-12 bg-gray-200 rounded px-3 mb-1.5" />
          <div className="bg-white rounded-[14px] px-4 py-3.5">
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-4/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
