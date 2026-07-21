import { AdminHeader } from '@/components/AdminHeader'

export default function ChatLoading() {
  return (
    <>
      <AdminHeader title="Chat" />
      <main className="flex-1 p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
