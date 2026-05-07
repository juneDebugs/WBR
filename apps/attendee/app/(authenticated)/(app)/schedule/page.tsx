import { ScheduleView } from '@/components/schedule/ScheduleView'
import { getSession } from '@/lib/session'
import { fetchScheduleData } from '@/lib/schedule-data'

export default async function SchedulePage() {
  const session = await getSession()
  const user = session?.user as any
  if (!user?.id) {
    return (
      <div className="page-container">
        <ScheduleView days={[]} savedIds={new Set()} conflictedIds={new Set()} />
      </div>
    )
  }

  const data = await fetchScheduleData(user.id)
  return (
    <div className="page-container">
      <ScheduleView
        days={data.days}
        savedIds={new Set(data.savedIds)}
        conflictedIds={new Set(data.conflictedIds)}
      />
    </div>
  )
}
