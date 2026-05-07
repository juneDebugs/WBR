import { HomeScreen } from '@/components/HomeScreen'
import { getSession } from '@/lib/session'
import { fetchHomeData } from '@/lib/home-data'

export default async function HomePage() {
  const session = await getSession()
  const user = session?.user as any
  if (!user?.id) {
    return (
      <HomeScreen
        conference={null}
        user={{ name: null, image: null, company: null, jobTitle: null }}
        meetingCount={0}
        sessionCount={0}
        profilePct={0}
        missingFields={[]}
        scheduleItems={[]}
        speakers={[]}
        sponsors={[]}
      />
    )
  }

  const data = await fetchHomeData(user.id, user.sponsorId ?? null)
  return <HomeScreen {...data} />
}
