export default function SpeakerDetailLoading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: '#f0ece4' }}>
      {/* Hero */}
      <div className="relative px-4 pt-14 pb-8 bg-gray-300">
        <div className="flex flex-col items-center mt-6">
          <div className="w-24 h-24 rounded-3xl bg-white/30" />
          <div className="h-6 w-40 bg-white/30 rounded mt-4" />
          <div className="h-4 w-28 bg-white/20 rounded mt-2" />
          <div className="h-5 w-24 bg-white/20 rounded-full mt-2" />
        </div>
      </div>
      {/* Body */}
      <div className="px-4 -mt-4 pb-28">
        <div className="bg-white rounded-2xl p-5 mb-4 mt-8">
          <div className="h-3 w-12 bg-gray-200 rounded mb-3" />
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-5/6" />
            <div className="h-3 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 h-20" />
          ))}
        </div>
      </div>
    </div>
  )
}
