import { HomeScreen } from '@/components/HomeScreen'

// Data is fetched client-side via useHomeData() hook in HomeScreen.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
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
