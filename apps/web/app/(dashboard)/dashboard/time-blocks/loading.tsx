import { AdminHeader } from '@/components/AdminHeader'

export default function TimeBlocksLoading() {
  return (
    <>
      <AdminHeader title="Time Blocks" />
      <main className="flex-1 p-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-64 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-36 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-gray-50 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
