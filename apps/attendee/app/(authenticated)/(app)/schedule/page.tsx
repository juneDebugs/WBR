import { ScheduleView } from '@/components/schedule/ScheduleView'

// Data is fetched client-side via useScheduleData() hook in ScheduleView.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function SchedulePage() {
  return (
    <div className="page-container">
      <ScheduleView days={[]} savedIds={new Set()} conflictedIds={new Set()} />
    </div>
  )
}
