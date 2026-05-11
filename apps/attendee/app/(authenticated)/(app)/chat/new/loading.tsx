export default function NewMessageLoading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: '#f0ece4' }}>
      <div className="px-4 pt-12 pb-3 flex items-center gap-4 border-b border-[#e5e1d9]">
        <div className="w-6 h-6 bg-gray-200 rounded" />
        <div className="h-5 w-28 bg-gray-200 rounded" />
      </div>
      <div className="px-4 pt-4">
        <div className="h-10 bg-gray-200 rounded-xl mb-4" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-gray-200" />
            <div className="flex-1">
              <div className="h-4 w-28 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
