export const revalidate = 30
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { SponsorLogo } from '@/components/SponsorLogo'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { revalidatePath } from 'next/cache'

const TIER_STYLES: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700 border border-slate-300',
  GOLD:     'bg-amber-100 text-amber-700 border border-amber-300',
  SILVER:   'bg-gray-100 text-gray-600 border border-gray-300',
  BRONZE:   'bg-orange-100 text-orange-700 border border-orange-300',
}

async function updateSponsor(sponsorId: string, formData: FormData) {
  'use server'
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
  await prisma.sponsor.delete({ where: { id: sponsorId } })
  redirect('/dashboard/sponsors')
}

async function scheduleMeeting(sponsorId: string, formData: FormData) {
  'use server'
  const userId = formData.get('userId') as string
  const timeBlockId = formData.get('timeBlockId') as string
  const notes = (formData.get('notes') as string) || null

  await prisma.sponsorMeeting.create({
    data: { sponsorId, userId, timeBlockId, notes, status: 'CONFIRMED' },
  })
  revalidatePath(`/dashboard/sponsors/${sponsorId}`)
}

async function cancelMeeting(meetingId: string, sponsorId: string) {
  'use server'
  await prisma.sponsorMeeting.delete({ where: { id: meetingId } })
  revalidatePath(`/dashboard/sponsors/${sponsorId}`)
}

export default async function SponsorDetailPage({ params }: { params: { id: string } }) {
  const [sponsor, users, timeBlocks] = await Promise.all([
    prisma.sponsor.findUnique({
      where: { id: params.id },
      include: {
        meetings: {
          include: { user: true, timeBlock: true },
          orderBy: { timeBlock: { startsAt: 'asc' } },
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.timeBlock.findMany({ orderBy: { startsAt: 'asc' } }),
  ])

  if (!sponsor) notFound()

  const bookedUserIds = new Set(sponsor.meetings.map(m => m.userId))
  const bookedTimeBlockIds = new Set(sponsor.meetings.map(m => m.timeBlockId))

  const doUpdate = updateSponsor.bind(null, params.id)
  const doDelete = deleteSponsor.bind(null, params.id)
  const doSchedule = scheduleMeeting.bind(null, params.id)

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

          {/* Right: Meetings */}
          <div className="col-span-2 space-y-5">
            {/* Schedule new meeting */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Schedule a 1-1 Meeting</h2>
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
                <span className="text-xs text-gray-400">{sponsor.meetings.length} total</span>
              </div>

              {sponsor.meetings.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">No meetings scheduled yet.</p>
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
                      const doCancel = cancelMeeting.bind(null, meeting.id, params.id)
                      return (
                        <tr key={meeting.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                {meeting.user.image ? (
                                  <Image src={meeting.user.image} alt="" width={32} height={32} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
                                    {(meeting.user.name ?? '?')[0]}
                                  </span>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{meeting.user.name ?? '—'}</p>
                                {meeting.user.company && <p className="text-xs text-gray-400">{meeting.user.company}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {format(meeting.timeBlock.startsAt, 'MMM d, h:mm a')}
                            <span className="text-gray-400"> – {format(meeting.timeBlock.endsAt, 'h:mm a')}</span>
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
