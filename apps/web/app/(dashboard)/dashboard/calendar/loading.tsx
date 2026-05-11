import { AdminHeader } from '@/components/AdminHeader'

export default function CalendarLoading() {
  return (
    <>
      <AdminHeader title="Calendar" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 h-[600px] animate-pulse bg-gray-50" />
      </main>
    </>
  )
}
