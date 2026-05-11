import { AdminHeader } from '@/components/AdminHeader'

export default function AttendeesLoading() {
  return (
    <>
      <AdminHeader title="Attendees" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-64 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-24 bg-gray-50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
