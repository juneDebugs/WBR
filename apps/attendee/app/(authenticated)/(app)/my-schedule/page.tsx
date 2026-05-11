import { MyScheduleClient } from '@/components/my-schedule/MyScheduleClient'

// Data is fetched client-side via useMyScheduleData() hook in MyScheduleClient.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function MySchedulePage() {
  return <MyScheduleClient />
}
