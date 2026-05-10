import { Suspense } from 'react'
import MeetingsClient from './MeetingsClient'
import MeetingsLoading from './loading'

// Data is fetched client-side via useMeetingsData() hook in MeetingsClient.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function MeetingsPage() {
  return (
    <Suspense fallback={<MeetingsLoading />}>
      <MeetingsClient />
    </Suspense>
  )
}
