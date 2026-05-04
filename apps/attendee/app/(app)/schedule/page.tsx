import { ScheduleView } from '@/components/schedule/ScheduleView'

export default function SchedulePage() {
  return (
    <div className="page-container">
      <ScheduleView days={[]} savedIds={new Set()} conflictedIds={new Set()} />
    </div>
  )
}
