import { DashboardView } from '@/components/DashboardView'

// Data is fetched client-side via hooks (useSponsorData, useMeetingsData, useAttendees).
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// BackgroundPrefetch in the layout pre-warms the cache.
export default function DashboardPage() {
  return <DashboardView />
}
