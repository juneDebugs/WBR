import { AdminHeader } from '@/components/AdminHeader'
import MeetingsPageClient from '@/components/MeetingsPageClient'

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; type?: string }> }) {
  const params = await searchParams
  return (
    <>
      <AdminHeader title="Meetings" />
      <main className="flex-1 p-6 max-w-6xl">
        <MeetingsPageClient tab={params.tab} status={params.status} type={params.type} />
      </main>
    </>
  )
}
