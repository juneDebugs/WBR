import { SpeakersClient } from '@/components/speakers/SpeakersClient'

// Data is fetched client-side via useSpeakersData() hook in SpeakersClient.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function SpeakersPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8f8fc 40%)' }}>
      <SpeakersClient speakers={[]} />
    </div>
  )
}
