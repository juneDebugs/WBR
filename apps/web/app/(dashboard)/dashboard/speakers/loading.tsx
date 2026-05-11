import { AdminHeader } from '@/components/AdminHeader'

export default function SpeakersLoading() {
  return (
    <>
      <AdminHeader title="Speakers" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-64 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="w-16 h-16 bg-gray-100 rounded-full animate-pulse mx-auto" />
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mx-auto" />
              <div className="h-3 w-24 bg-gray-50 rounded animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
