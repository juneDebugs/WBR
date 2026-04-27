import { prisma, checkBlackoutConflicts } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createMeeting(formData: FormData) {
  'use server'
  const attendeeAId = formData.get('attendeeAId') as string
  const attendeeBId = formData.get('attendeeBId') as string
  const timeBlockId = formData.get('timeBlockId') as string

  const timeBlock = await prisma.timeBlock.findUnique({ where: { id: timeBlockId } })
  if (!timeBlock) throw new Error('Time block not found')

  const activeConf = await prisma.conference.findFirst({ where: { active: true } })
  if (!activeConf) throw new Error('No active conference')

  await prisma.meeting.create({
    data: {
      conferenceId: activeConf.id,
      timeBlockId,
      organizerId: attendeeAId,
      attendeeAId,
      attendeeBId,
      status: 'CONFIRMED',
      notes: (formData.get('notes') as string) || null,
    },
  })
  redirect('/dashboard/meetings')
}

export default async function NewMeetingPage({ searchParams }: { searchParams: { timeBlockId?: string; attendeeAId?: string; attendeeBId?: string } }) {
  const [users, timeBlocks] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    prisma.timeBlock.findMany({ orderBy: { startsAt: 'asc' } }),
  ])

  // Pre-check conflicts if attendees and timeBlock are selected
  let conflicts: { userId: string; reason: string | null }[] = []
  let selectedBlock: typeof timeBlocks[0] | undefined

  if (searchParams.timeBlockId && (searchParams.attendeeAId || searchParams.attendeeBId)) {
    selectedBlock = timeBlocks.find(tb => tb.id === searchParams.timeBlockId)
    const userIds = [searchParams.attendeeAId, searchParams.attendeeBId].filter(Boolean) as string[]
    if (selectedBlock && userIds.length > 0) {
      conflicts = await checkBlackoutConflicts(prisma, userIds, selectedBlock.startsAt, selectedBlock.endsAt)
    }
  }

  const conflictingUserIds = new Set(conflicts.map(c => c.userId))
  const conflictingUsers = users.filter(u => conflictingUserIds.has(u.id))

  return (
    <>
      <AdminHeader title="New Meeting" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/meetings" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Meetings
        </Link>

        {conflictingUsers.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-yellow-800 mb-1">Blackout conflict warning</p>
            <p className="text-sm text-yellow-700">
              {conflictingUsers.map(u => u.name).join(', ')} {conflictingUsers.length === 1 ? 'has' : 'have'} marked
              this time as unavailable. You can still schedule the meeting if needed.
            </p>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={createMeeting} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Attendee A *</label>
                <select name="attendeeAId" required className="form-input"
                  defaultValue={searchParams.attendeeAId ?? ''}>
                  <option value="">— Select attendee —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email ?? u.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Attendee B *</label>
                <select name="attendeeBId" required className="form-input"
                  defaultValue={searchParams.attendeeBId ?? ''}>
                  <option value="">— Select attendee —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email ?? u.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Time Block *</label>
              <select name="timeBlockId" required className="form-input"
                defaultValue={searchParams.timeBlockId ?? ''}>
                <option value="">— Select time block —</option>
                {timeBlocks.map(tb => (
                  <option key={tb.id} value={tb.id}>
                    {format(tb.startsAt, 'MMM d, h:mm a')} – {format(tb.endsAt, 'h:mm a')}
                    {tb.location ? ` · ${tb.location}` : ''}
                    {conflictingUserIds.size > 0 ? ' ⚠️' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea name="notes" rows={3} className="form-input"
                placeholder="Optional notes for this meeting" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard/meetings" className="btn-secondary text-sm">Cancel</Link>
              <button type="submit" className="btn-primary text-sm">Schedule Meeting</button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
