import { SponsorBrowseView } from '@/components/SponsorBrowseView'

// Data is fetched client-side via hooks (useAttendees, useSponsorData).
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// BackgroundPrefetch in the layout pre-warms the cache.
export default function BrowsePage() {
  return <SponsorBrowseView />
}
