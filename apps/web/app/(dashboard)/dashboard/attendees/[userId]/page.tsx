export const revalidate = 120
import { prisma } from '@conference/db'
import { unstable_cache } from 'next/cache'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'

import { AttendeeProfileEditor } from '@/components/AttendeeProfileEditor'

function getCachedAllUsers(excludeUserId: string) {
  return unstable_cache(
    async () => prisma.user.findMany({
      where: { id: { not: excludeUserId }, role: { in: ['ATTENDEE', 'SPEAKER', 'SPONSOR'] } },
      select: { id: true, name: true, email: true, company: true },
      orderBy: { name: 'asc' },
    }),
    ['attendee-page-all-users', excludeUserId],
    { revalidate: 300, tags: ['attendees'] },
  )()
}

const getCachedTimeBlocks = unstable_cache(
  async () => prisma.timeBlock.findMany({
    select: { id: true, startsAt: true, endsAt: true, location: true },
    orderBy: { startsAt: 'asc' },
  }),
  ['attendee-page-time-blocks'],
  { revalidate: 300, tags: ['time-blocks'] },
)

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

const COMPANY_SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup (1–50)',
  SMB: 'SMB (51–500)',
  MIDMARKET: 'Mid-Market (501–2K)',
  ENTERPRISE: 'Enterprise (2K+)',
}

const REVENUE_LABELS: Record<string, string> = {
  '<1M': 'Under $1M',
  '1M-10M': '$1M – $10M',
  '10M-50M': '$10M – $50M',
  '50M-250M': '$50M – $250M',
  '250M+': '$250M+',
}

async function addBlackout(userId: string, formData: FormData) {
  'use server'
  const startsAt = new Date(formData.get('startsAt') as string)
  const endsAt = new Date(formData.get('endsAt') as string)
  const reason = (formData.get('reason') as string) || null
  await prisma.blackoutTime.create({ data: { userId, startsAt, endsAt, reason } })
  revalidatePath(`/dashboard/attendees/${userId}`)
}

async function deleteBlackout(blackoutId: string) {
  'use server'
  const blackout = await prisma.blackoutTime.findUnique({ where: { id: blackoutId } })
  if (!blackout) return
  await prisma.blackoutTime.delete({ where: { id: blackoutId } })
  revalidatePath(`/dashboard/attendees/${blackout.userId}`)
}

async function addVendorMeeting(userId: string, formData: FormData) {
  'use server'
  const vendorUserId = formData.get('vendorUserId') as string
  const timeBlockId = formData.get('timeBlockId') as string
  const notes = (formData.get('notes') as string) || null

  const timeBlock = await prisma.timeBlock.findUnique({ where: { id: timeBlockId } })
  if (!timeBlock) throw new Error('Time block not found')

  const activeConf = await prisma.conference.findFirst({ where: { active: true } })
  if (!activeConf) throw new Error('No active conference')

  await prisma.meeting.create({
    data: {
      conferenceId: activeConf.id,
      timeBlockId,
      organizerId: userId,
      attendeeAId: userId,
      attendeeBId: vendorUserId,
      status: 'CONFIRMED',
      notes,
    },
  })
  revalidatePath(`/dashboard/attendees/${userId}`)
}

async function deleteMeeting(meetingId: string, userId: string) {
  'use server'
  await prisma.meeting.delete({ where: { id: meetingId } })
  revalidatePath(`/dashboard/attendees/${userId}`)
}

export default async function AttendeeProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params

  const [user, blackouts, meetings, allUsers, timeBlocks] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.blackoutTime.findMany({
      where: { userId },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.meeting.findMany({
      where: { OR: [{ attendeeAId: userId }, { attendeeBId: userId }] },
      include: {
        timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
        attendeeA: { select: { id: true, name: true, company: true } },
        attendeeB: { select: { id: true, name: true, company: true } },
      },
      orderBy: { timeBlock: { startsAt: 'asc' } },
    }),
    getCachedAllUsers(userId),
    getCachedTimeBlocks(),
  ])

  if (!user) notFound()

  const addBlackoutBound = addBlackout.bind(null, userId)
  const addVendorMeetingBound = addVendorMeeting.bind(null, userId)

  const statusColors: Record<string, string> = {
    CONFIRMED: 'bg-green-100 text-green-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    CANCELLED: 'bg-red-100 text-red-500',
  }

  const solutionsOffering = parseArr(user.solutionsOffering)
  const solutionsSeeking = parseArr(user.solutionsSeeking)

  return (
    <>
      <AdminHeader title="Attendee Profile" />
      <main className="flex-1 p-6 max-w-4xl">
        <Link href="/dashboard/attendees" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Attendees
        </Link>

        {/* Profile card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            {user.image ? (
              <img src={user.image} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-gray-500 text-xl font-semibold">{(user.name ?? '?')[0]}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{user.name ?? '—'}</h2>
                <AttendeeProfileEditor user={{
                  id: user.id, name: user.name, email: user.email, image: user.image,
                  bio: user.bio, company: user.company, jobTitle: user.jobTitle, role: user.role,
                  website: user.website, companySize: user.companySize, annualRevenue: user.annualRevenue,
                  solutionsOffering: user.solutionsOffering, solutionsSeeking: user.solutionsSeeking,
                }} />
              </div>
              <p className="text-sm text-gray-500">{user.email ?? '—'}</p>
              {(user.jobTitle || user.company) && (
                <p className="text-sm text-gray-600 mt-1">
                  {[user.jobTitle, user.company].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {user.role}
                </span>
                {user.companySize && (
                  <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                    {COMPANY_SIZE_LABELS[user.companySize] ?? user.companySize}
                  </span>
                )}
                {user.annualRevenue && (
                  <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                    {REVENUE_LABELS[user.annualRevenue] ?? user.annualRevenue}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Bio</p>
              <p className="text-sm text-gray-700">{user.bio}</p>
            </div>
          )}

          {/* Website */}
          {user.website && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Website</p>
              <a href={user.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                {user.website}
              </a>
            </div>
          )}

          {/* Solutions */}
          {(solutionsOffering.length > 0 || solutionsSeeking.length > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid md:grid-cols-2 gap-4">
              {solutionsOffering.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Solutions Offering</p>
                  <div className="flex flex-wrap gap-1.5">
                    {solutionsOffering.map(s => (
                      <span key={s} className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {solutionsSeeking.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Solutions Seeking</p>
                  <div className="flex flex-wrap gap-1.5">
                    {solutionsSeeking.map(s => (
                      <span key={s} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Blackout times */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Blackout Times</h3>
              <span className="text-xs text-gray-400">{blackouts.length} entries</span>
            </div>

            <div className="divide-y divide-gray-50">
              {blackouts.map((b) => {
                const deleteAction = deleteBlackout.bind(null, b.id)
                return (
                  <div key={b.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-800">
                        {format(b.startsAt, 'MMM d, h:mm a')} – {format(b.endsAt, 'h:mm a')}
                      </p>
                      {b.reason && <p className="text-xs text-gray-400 mt-0.5">{b.reason}</p>}
                    </div>
                    <form action={deleteAction}>
                      <button type="submit"
                        className="text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap">
                        Delete
                      </button>
                    </form>
                  </div>
                )
              })}
              {blackouts.length === 0 && (
                <p className="px-4 py-4 text-xs text-gray-400">No blackout times set.</p>
              )}
            </div>

            {/* Add blackout form */}
            <div className="px-4 py-4 border-t border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Blackout</p>
              <form action={addBlackoutBound} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Start *</label>
                    <input type="datetime-local" name="startsAt" required
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">End *</label>
                    <input type="datetime-local" name="endsAt" required
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Reason</label>
                  <input type="text" name="reason" placeholder="Optional reason"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary text-xs">Add Blackout</button>
                </div>
              </form>
            </div>
          </div>

          {/* Vendor meetings */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Vendor Meetings</h3>
              <span className="text-xs text-gray-400">{meetings.length} meetings</span>
            </div>

            <div className="divide-y divide-gray-50">
              {meetings.map((m) => {
                const other = m.attendeeAId === userId ? m.attendeeB : m.attendeeA
                const deleteMeetingAction = deleteMeeting.bind(null, m.id, userId)
                return (
                  <div key={m.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-800">{other.name ?? '—'}</p>
                      {other.company && <p className="text-xs text-gray-400">{other.company}</p>}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(m.timeBlock.startsAt, 'MMM d, h:mm a')} – {format(m.timeBlock.endsAt, 'h:mm a')}
                      </p>
                      {m.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{m.notes}</p>}
                      <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[m.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {m.status}
                      </span>
                    </div>
                    <form action={deleteMeetingAction}>
                      <button type="submit"
                        className="text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap">
                        Delete
                      </button>
                    </form>
                  </div>
                )
              })}
              {meetings.length === 0 && (
                <p className="px-4 py-4 text-xs text-gray-400">No vendor meetings scheduled.</p>
              )}
            </div>

            {/* Add vendor meeting form */}
            <div className="px-4 py-4 border-t border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Schedule Meeting</p>
              <form action={addVendorMeetingBound} className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Vendor / Rep *</label>
                  <select name="vendorUserId" required
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="">— Select person —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.email ?? u.id}{u.company ? ` (${u.company})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Time Block *</label>
                  <select name="timeBlockId" required
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="">— Select time block —</option>
                    {timeBlocks.map(tb => (
                      <option key={tb.id} value={tb.id}>
                        {format(tb.startsAt, 'MMM d, h:mm a')} – {format(tb.endsAt, 'h:mm a')}
                        {tb.location ? ` · ${tb.location}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notes</label>
                  <textarea name="notes" rows={2} placeholder="Optional notes"
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary text-xs">Schedule</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
