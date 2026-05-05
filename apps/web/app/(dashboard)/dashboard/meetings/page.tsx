import { AdminHeader } from '@/components/AdminHeader'
import MeetingsPageClient from '@/components/MeetingsPageClient'
import { Suspense } from 'react'

export default function MeetingsPage() {
  return (
    <>
      <AdminHeader title="Meetings" />
      <main className="flex-1 p-6 max-w-6xl">
        <Suspense>
          <MeetingsPageClient />
        </Suspense>
      </main>
    </>
  )
}
