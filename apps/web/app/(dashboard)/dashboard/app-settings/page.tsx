import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { AppSettingsPageClient } from '@/components/AppSettingsPageClient'
import { permissionDenied } from '@/lib/require-permission'

const getCachedConference = unstable_cache(
  async () => {
    const conference = await prisma.conference.findFirst({ where: { active: true } })
    if (!conference) return null
    return {
      id: conference.id, name: conference.name,
      venue: conference.venue ?? '', venueLat: conference.venueLat?.toString() ?? '', venueLon: conference.venueLon?.toString() ?? '',
      venueTimezone: conference.venueTimezone ?? '',
      startDate: conference.startDate.toISOString().slice(0, 10), endDate: conference.endDate.toISOString().slice(0, 10),
      heroImageUrl: conference.heroImageUrl ?? '', wifiName: conference.wifiName ?? '', wifiPassword: conference.wifiPassword ?? '',
      loginTitle: (conference as any).loginTitle ?? '', loginSubtitle: (conference as any).loginSubtitle ?? '', loginButtonText: (conference as any).loginButtonText ?? '',
    }
  },
  ['web-app-settings'],
  { revalidate: 60, tags: ['app-settings'] },
)

export default async function AppSettingsPage() {
  const denied = await permissionDenied('appSettings', 'App Settings')
  if (denied) return denied
  const data = await getCachedConference()
  return (
    <>
      <AdminHeader title="App Settings" />
      <main className="flex-1 p-6 max-w-3xl">
        <AppSettingsPageClient initialData={data} />
      </main>
    </>
  )
}
