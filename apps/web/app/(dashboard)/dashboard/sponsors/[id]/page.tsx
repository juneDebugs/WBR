export const revalidate = 60
import { prisma, assertBlockOpen, commitOrConflict, EngineError } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { SponsorLogo } from '@/components/SponsorLogo'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

import { format } from 'date-fns'
import { revalidatePath, unstable_cache } from 'next/cache'
import { permissionDenied, assertPermission } from '@/lib/require-permission'

// Slim, cached roster for the "schedule a meeting" dropdown. The render only
// uses id/name/email/company, so select just those (avoids pulling every User
// column — password hashes, JSON blobs, images — over the HTTP data layer on
// each request). No role filter: keep the current behavior of listing all roles.
function getCachedAllUsers() {
  return unstable_cache(
    async () => prisma.user.findMany({
      select: { id: true, name: true, email: true, company: true },
      orderBy: { name: 'asc' },
    }),
    ['sponsor-page-all-users'],
    { revalidate: 300, tags: ['attendees'] },
  )()
}

const TIER_STYLES: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700 border border-slate-300',
  GOLD:     'bg-amber-100 text-amber-700 border border-amber-300',
  SILVER:   'bg-gray-100 text-gray-600 border border-gray-300',
  BRONZE:   'bg-orange-100 text-orange-700 border border-orange-300',
}

function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

// ATTENDEE → "Attendee". Reps who aren't plain attendees (sponsor/speaker/
// organizer) get a brand-tinted chip so their standing reads at a glance.
function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}
const ROLE_BADGE: Record<string, string> = {
  ATTENDEE: 'badge-neutral',
}

async function updateSponsor(sponsorId: string, formData: FormData) {
  'use server'
  await assertPermission('sponsors')
  await prisma.sponsor.update({
    where: { id: sponsorId },
    data: {
      name: formData.get('name') as string,
      tier: formData.get('tier') as string,
      logoUrl: (formData.get('logoUrl') as string) || null,
      website: (formData.get('website') as string) || null,
      contactName: (formData.get('contactName') as string) || null,
      contactEmail: (formData.get('contactEmail') as string) || null,
      description: (formData.get('description') as string) || null,
    },
  })
  revalidatePath('/dashboard/sponsors')
  redirect('/dashboard/sponsors')
}

async function deleteSponsor(sponsorId: string) {
  'use server'
  await assertPermission('sponsors')
  await prisma.sponsor.delete({ where: { id: sponsorId } })
  redirect('/dashboard/sponsors')
}

async function scheduleMeeting(sponsorId: string, formData: FormData) {
  'use server'
  await assertPermission('sponsors')
  const userId = formData.get('userId') as string
  const timeBlockId = formData.get('timeBlockId') as string
  const notes = (formData.get('notes') as string) || null

  // Exclusive slots: one confirmed meeting per pair, and the block must be
  // open for this sponsor and free for the attendee (same engine rules as the
  // Companies scheduler). Conflicts bounce back to the form with a banner
  // instead of writing a double booking.
  const pairExisting = await prisma.sponsorMeeting.findFirst({
    where: { sponsorId, userId, status: 'CONFIRMED' },
    select: { id: true },
  })
  if (pairExisting) redirect(`/dashboard/sponsors/${sponsorId}?conflict=ALREADY_SCHEDULED`)
  try {
    await assertBlockOpen(prisma, sponsorId, userId, timeBlockId)
    // commitOrConflict maps the DB exclusive-slot index (the backstop for a
    // true concurrent write that slips past assertBlockOpen) to a typed error.
    await commitOrConflict(() => prisma.sponsorMeeting.create({
      data: { sponsorId, userId, timeBlockId, notes, status: 'CONFIRMED' },
    }))
  } catch (e) {
    if (e instanceof EngineError) redirect(`/dashboard/sponsors/${sponsorId}?conflict=${e.code}`)
    throw e
  }
  revalidatePath(`/dashboard/sponsors/${sponsorId}`)
  redirect(`/dashboard/sponsors/${sponsorId}`)
}

async function cancelMeeting(meetingId: string, sponsorId: string) {
  'use server'
  await assertPermission('sponsors')
  await prisma.sponsorMeeting.delete({ where: { id: meetingId } })
  revalidatePath(`/dashboard/sponsors/${sponsorId}`)
}

const CONFLICT_MESSAGES: Record<string, string> = {
  CANDIDATE_BUSY: 'That attendee is already booked or unavailable in that time slot.',
  SPONSOR_FULL: 'This company already has a meeting in that time slot.',
  ALREADY_SCHEDULED: 'That attendee already has a confirmed meeting with this company.',
}

export default async function SponsorDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ conflict?: string }>
}) {
  const denied = await permissionDenied('sponsors', 'Sponsor')
  if (denied) return denied

  const { id } = await params
  const { conflict } = await searchParams
  const conflictMessage = conflict
    ? CONFLICT_MESSAGES[conflict] ?? 'That slot could not be booked — it is no longer open.'
    : null
  const [sponsor, users, timeBlocks, team] = await Promise.all([
    prisma.sponsor.findUnique({
      where: { id },
      include: {
        // Only live bookings: engine cancels keep the row with status
        // CANCELLED, and a cancelled meeting must not read as "(taken)".
        meetings: {
          where: { status: 'CONFIRMED' },
          include: { user: true, timeBlock: true },
          orderBy: { timeBlock: { startsAt: 'asc' } },
        },
      },
    }),
    getCachedAllUsers(),
    prisma.timeBlock.findMany({
      select: { id: true, startsAt: true, endsAt: true, location: true },
      orderBy: { startsAt: 'asc' },
    }),
    // The sponsor's own people (User.sponsorId === this company). These are the
    // reps/staff shown in the Team roster card below.
    prisma.user.findMany({
      where: { sponsorId: id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
    }),
  ])

  if (!sponsor) notFound()

  const bookedUserIds = new Set(sponsor.meetings.map(m => m.userId))
  const bookedTimeBlockIds = new Set(sponsor.meetings.map(m => m.timeBlockId))

  const doUpdate = updateSponsor.bind(null, id)
  const doDelete = deleteSponsor.bind(null, id)
  const doSchedule = scheduleMeeting.bind(null, id)

  return (
    <>
      <AdminHeader title={sponsor.name} />
      <main className="flex-1 p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/sponsors" className="text-sm text-primary hover:underline">
            ← Sponsors
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600">{sponsor.name}</span>
          <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${TIER_STYLES[sponsor.tier]}`}>
            {sponsor.tier}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left: Edit form */}
          <div className="col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Sponsor Details</h2>

              {sponsor.logoUrl && (
                <div className="w-full h-20 bg-gray-50 rounded-lg flex items-center justify-center mb-4 border border-gray-100">
                  <SponsorLogo
                    name={sponsor.name}
                    logoUrl={sponsor.logoUrl}
                    className="max-h-14 max-w-full object-contain"
                  />
                </div>
              )}

              <form action={doUpdate} className="space-y-3">
                <div>
                  <label className="form-label">Name *</label>
                  <input name="name" required defaultValue={sponsor.name} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Tier</label>
                  <select name="tier" defaultValue={sponsor.tier} className="form-input">
                    <option value="PLATINUM">Platinum</option>
                    <option value="GOLD">Gold</option>
                    <option value="SILVER">Silver</option>
                    <option value="BRONZE">Bronze</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Logo URL</label>
                  <input name="logoUrl" defaultValue={sponsor.logoUrl ?? ''} className="form-input" placeholder="https://..." />
                </div>
                <div>
                  <label className="form-label">Website</label>
                  <input name="website" defaultValue={sponsor.website ?? ''} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Contact Name</label>
                  <input name="contactName" defaultValue={sponsor.contactName ?? ''} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Contact Email</label>
                  <input name="contactEmail" type="email" defaultValue={sponsor.contactEmail ?? ''} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <textarea name="description" rows={3} defaultValue={sponsor.description ?? ''} className="form-input" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="btn-primary text-sm flex-1">Save</button>
                  <form action={doDelete} className="inline">
                    <button type="submit" className="btn-danger text-sm px-3">
                      Delete
                    </button>
                  </form>
                </div>
              </form>
            </div>
          </div>

          {/* Right: Team + Meetings */}
          <div className="col-span-2 space-y-5">
            {/* Team roster — the sponsor's own people (User.sponsorId === sponsor) */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  Team at {sponsor.name}
                </h2>
                <span className="text-xs text-ink-2 tabular-nums">
                  {team.length} {team.length === 1 ? 'member' : 'members'}
                </span>
              </div>

              {team.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-gray-500">No team members linked to this company yet.</p>
                  <p className="text-xs text-ink-2 mt-1">
                    People are added here when their account is linked to {sponsor.name}.
                  </p>
                </div>
              ) : (
                <ul className="p-4 grid grid-cols-2 gap-3">
                  {team.map(member => {
                    const isPrimary =
                      !!sponsor.contactEmail &&
                      member.email?.toLowerCase() === sponsor.contactEmail.toLowerCase()
                    return (
                      <li
                        key={member.id}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-primary/40 hover:bg-gray-50"
                      >
                        <div className="rounded-full bg-gradient-to-b from-[#a5b4fc] to-[#4f46e5] p-[2px] flex-shrink-0 shadow-sm">
                          {member.image ? (
                            <img
                              src={member.image}
                              alt=""
                              className="w-11 h-11 rounded-full object-cover block"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base">
                              {initial(member.name)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-gray-900 text-sm truncate">
                              {member.name ?? '—'}
                            </p>
                            {isPrimary && (
                              <span className="badge badge-brand flex-shrink-0 text-[10px] px-1.5 py-0 uppercase tracking-wide font-semibold">Primary</span>
                            )}
                          </div>
                          <p className="text-xs text-ink-2 truncate">
                            {member.jobTitle ?? 'Team member'}
                          </p>
                          <div className="mt-1">
                            <span className={`badge ${ROLE_BADGE[member.role] ?? 'badge-brand'} text-[10px] px-1.5 py-0 uppercase tracking-wide font-semibold`}>
                              {roleLabel(member.role)}
                            </span>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Schedule new meeting */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Schedule a 1-1 Meeting</h2>
              {conflictMessage && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2" role="alert">
                  {conflictMessage}
                </div>
              )}
              <form action={doSchedule} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Attendee / Speaker *</label>
                    <select name="userId" required className="form-input">
                      <option value="">— Select person —</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id} disabled={bookedUserIds.has(u.id)}>
                          {u.name ?? u.email}
                          {u.company ? ` · ${u.company}` : ''}
                          {bookedUserIds.has(u.id) ? ' (booked)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Time Slot *</label>
                    <select name="timeBlockId" required className="form-input">
                      <option value="">— Select slot —</option>
                      {timeBlocks.map(tb => (
                        <option key={tb.id} value={tb.id} disabled={bookedTimeBlockIds.has(tb.id)}>
                          {format(tb.startsAt, 'MMM d, h:mm a')} – {format(tb.endsAt, 'h:mm a')}
                          {tb.location ? ` · ${tb.location}` : ''}
                          {bookedTimeBlockIds.has(tb.id) ? ' (taken)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input name="notes" className="form-input" placeholder="Optional talking points or instructions" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary text-sm">Schedule Meeting</button>
                </div>
              </form>
            </div>

            {/* Scheduled meetings */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Scheduled Meetings</h2>
                <span className="text-xs text-ink-2">{sponsor.meetings.length} total</span>
              </div>

              {sponsor.meetings.length === 0 ? (
                <p className="text-center text-ink-2 text-sm py-10">No meetings scheduled yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sponsor.meetings.map(meeting => {
                      const doCancel = cancelMeeting.bind(null, meeting.id, id)
                      return (
                        <tr key={meeting.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                {meeting.user.image ? (
                                  <img src={meeting.user.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
                                    {(meeting.user.name ?? '?')[0]}
                                  </span>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{meeting.user.name ?? '—'}</p>
                                {meeting.user.company && <p className="text-xs text-ink-2">{meeting.user.company}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {format(meeting.timeBlock.startsAt, 'MMM d, h:mm a')}
                            <span className="text-ink-2"> – {format(meeting.timeBlock.endsAt, 'h:mm a')}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{meeting.timeBlock.location ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              meeting.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                            }`}>
                              {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <form action={doCancel} className="inline">
                              <button type="submit" className="text-red-500 hover:underline text-xs font-medium">
                                Remove
                              </button>
                            </form>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
