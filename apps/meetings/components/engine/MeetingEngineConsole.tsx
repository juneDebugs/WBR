'use client'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { WorkflowStepper } from './WorkflowStepper'
import { CompaniesTable } from './CompaniesTable'
import { ScheduleScreen } from './ScheduleScreen'

const NAV = ['Get Started', 'Configure', 'Reports', 'Activities', 'Presentations', 'Meetings', 'Messaging', 'Companies', 'Attendees']

// eTail Connect meeting engine — faithful replica of the workflow PDF.
export function MeetingEngineConsole({ eventName = 'WBR CONNECT 2027' }: { eventName?: string }) {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/staff/companies').then(r => r.ok ? r.json() : { companies: [] }).then(d => setCompanies((d.companies ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {})
  }, [])

  function switchCompany(id: string) {
    const c = companies.find(x => x.id === id)
    if (c) setSelected({ id: c.id, name: c.name })
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* eTail navy top nav */}
      <header style={{ backgroundColor: '#22406a' }} className="text-white">
        <div className="flex items-center h-14 px-4 gap-4">
          <div className="leading-tight">
            <div className="font-bold text-[15px] tracking-wide">{eventName}</div>
            <div className="text-[10px] text-white/70">April 6th to 7th, 2027</div>
          </div>
          <nav className="hidden lg:flex items-center gap-3 ml-4 text-[13px]">
            {NAV.map(n => (
              <span key={n} className={`cursor-default hover:text-white ${n === 'Companies' ? 'text-white font-semibold' : 'text-white/80'}`}>
                {n} <span className="text-[8px] text-white/50">▾</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <span className="text-white/80">WBR Staff</span>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-white/80 hover:text-white">Logout</button>
          </div>
        </div>
      </header>

      {/* Workflow stepper */}
      <div className="px-4 py-3 bg-[#f5f5f7] border-b border-[#ddd]">
        <WorkflowStepper />
      </div>

      {/* Body */}
      {selected
        ? <ScheduleScreen sponsorId={selected.id} sponsorName={selected.name} companies={companies} onSwitchCompany={switchCompany} onBack={() => setSelected(null)} />
        : <CompaniesTable onMeetingTimes={setSelected} />}
    </div>
  )
}
