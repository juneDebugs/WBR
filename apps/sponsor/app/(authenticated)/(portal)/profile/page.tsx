import { ProfilePageClient } from '@/components/ProfilePageClient'

// Data is fetched client-side via useSponsorProfile hook.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
export default function ProfilePage() {
  return <ProfilePageClient />
}
