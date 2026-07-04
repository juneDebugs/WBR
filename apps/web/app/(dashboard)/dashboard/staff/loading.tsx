import { AdminHeader } from '@/components/AdminHeader'

export default function StaffLoading() {
  return (
    <>
      <AdminHeader title="Staff" />
      <main className="flex-1 p-6">
        <div className="max-w-5xl space-y-4">
          {/* Toolbar: count + Add Staff */}
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-11 w-28 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Search */}
            <div className="p-4 border-b border-gray-100">
              <div className="h-9 w-full max-w-sm bg-gray-100 rounded-lg animate-pulse" />
            </div>
            {/* Rows */}
            <div className="divide-y divide-gray-100">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-gray-50 rounded animate-pulse" />
                  </div>
                  <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
                  <div className="h-6 w-20 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
