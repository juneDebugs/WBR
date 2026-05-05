import { AdminHeader } from '@/components/AdminHeader'
import SpeakersClient from '@/components/SpeakersClient'

export default function SpeakersPage() {
  return (
    <>
      <AdminHeader title="Speakers" />
      <main className="flex-1 p-6">
        <SpeakersClient />
      </main>
    </>
  )
}
