import { SpeakersClient } from '@/components/speakers/SpeakersClient'
import { fetchSpeakersData } from '@/lib/speakers-data'

export default async function SpeakersPage() {
  const { speakers } = await fetchSpeakersData()
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8f8fc 40%)' }}>
      <SpeakersClient speakers={speakers} />
    </div>
  )
}
