import { AdminHeader } from '@/components/AdminHeader'

export default function IntegrationsLoading() {
  return (
    <>
      <AdminHeader title="Integrations" />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
