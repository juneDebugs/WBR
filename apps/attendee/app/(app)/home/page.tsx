import { HomeScreen } from '@/components/HomeScreen'

export default function HomePage() {
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
