'use client'
import { useState } from 'react'
import { CompanyDirectory } from './CompanyDirectory'
import { ScheduleMatrix } from './ScheduleMatrix'

// Top-level STAFF meeting-engine console. Two modes: the company directory, and
// a per-company schedule matrix. Selecting a company opens its schedule.
export function MeetingEngineConsole() {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)

  if (selected) {
    return (
      <ScheduleMatrix
        sponsorId={selected.id}
        sponsorName={selected.name}
        onBack={() => setSelected(null)}
      />
    )
  }
  return <CompanyDirectory onOpen={setSelected} />
}
