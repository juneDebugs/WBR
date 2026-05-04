import { SpeakersClient } from '@/components/speakers/SpeakersClient'

export default function SpeakersPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8f8fc 40%)' }}>
      <SpeakersClient speakers={[]} />
    </div>
  )
}
