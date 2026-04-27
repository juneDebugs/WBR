export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { AppSettingsForm } from '@/components/AppSettingsForm'

export default async function AppSettingsPage() {
  const conference = await prisma.conference.findFirst({ where: { active: true } })

  if (!conference) {
    return (
      <>
        <AdminHeader title="App Settings" />
        <main className="flex-1 p-6">
          <p className="text-gray-500">No active conference found.</p>
        </main>
      </>
    )
  }

  return (
    <>
      <AdminHeader title="App Settings" />
      <main className="flex-1 p-6 max-w-3xl">
        <AppSettingsForm
          conference={{
            id: conference.id,
            name: conference.name,
            venue: conference.venue ?? '',
            venueLat: conference.venueLat?.toString() ?? '',
            venueLon: conference.venueLon?.toString() ?? '',
            venueTimezone: conference.venueTimezone ?? '',
            startDate: conference.startDate.toISOString().slice(0, 10),
            endDate: conference.endDate.toISOString().slice(0, 10),
            heroImageUrl: conference.heroImageUrl ?? '',
            wifiName: conference.wifiName ?? '',
            wifiPassword: conference.wifiPassword ?? '',
          }}
        />
      </main>
    </>
  )
}
