export default function SpeakersLoading() {
  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="w-16 h-16 bg-gray-100 rounded-full animate-pulse mx-auto" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mx-auto" />
              <div className="h-3 w-32 bg-gray-50 rounded animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
