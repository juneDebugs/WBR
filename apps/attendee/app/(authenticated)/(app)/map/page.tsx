import { FloorPlanClient } from '@/components/map/FloorPlanClient'

// Data is fetched client-side via useFloorPlanData() in FloorPlanClient.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
//
// This page sits inside the (app) route group on purpose, so the onboarding
// gate in that group's layout applies to it exactly as it does to every other
// section. The venue map is ordinary participant content, not an exception.
export default function MapPage() {
  return (
    <div className="min-h-screen">
      <FloorPlanClient />
    </div>
  )
}
