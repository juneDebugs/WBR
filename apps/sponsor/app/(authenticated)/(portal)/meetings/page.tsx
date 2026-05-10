import { SponsorMeetingsView } from '@/components/SponsorMeetingsView'

// Data is fetched client-side via useMeetingsData hook.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// BackgroundPrefetch in the layout pre-warms the cache.
export default function MeetingsPage() {
  return <SponsorMeetingsView />
}
