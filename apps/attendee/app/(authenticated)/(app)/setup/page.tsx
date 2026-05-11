import { SetupClientWrapper } from '@/components/setup/SetupClientWrapper'

// Data is fetched client-side via useSetupData() hook in SetupClientWrapper.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function SetupPage() {
  return <SetupClientWrapper />
}
