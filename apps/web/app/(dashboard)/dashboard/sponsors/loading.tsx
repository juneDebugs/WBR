export default function SponsorsLoading() {
  return (
    <>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
      <main className="flex-1 p-6 space-y-10">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-xl animate-pulse" />
        </div>
        {/* Profile Onboarding section */}
        <section>
          <div className="mb-4">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-72 bg-gray-100 rounded animate-pulse mt-1.5" />
          </div>
          {[1, 2].map(tier => (
            <div key={tier} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="h-1.5 w-24 bg-gray-100 rounded-full animate-pulse" />
                    <div className="flex gap-1">
                      <div className="h-5 w-14 bg-gray-100 rounded animate-pulse" />
                      <div className="h-5 w-14 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </>
  )
}
