export const revalidate = 15
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

async function updateMeeting(id: string, formData: FormData) {
  'use server'
  await prisma.meeting.update({
    where: { id },
    data: {
      status: formData.get('status') as string,
      notes: (formData.get('notes') as string) || null,
    },
  })
  redirect('/dashboard/meetings')
}

async function cancelMeeting(id: string) {
  'use server'
  await prisma.meeting.update({
    where: { id },
    data: { status: 'CANCELLED' },
  })
  redirect('/dashboard/meetings')
}

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { timeBlock: true, attendeeA: true, attendeeB: true },
  })
  if (!meeting) notFound()

  const update = updateMeeting.bind(null, id)
  const cancel = cancelMeeting.bind(null, id)

  return (
    <>
      <AdminHeader title="Edit Meeting" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/meetings" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Meetings
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Meeting Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Attendee A</p>
              <p className="font-medium text-gray-900">{meeting.attendeeA.name ?? meeting.attendeeA.email}</p>
              {meeting.attendeeA.company && <p className="text-gray-500">{meeting.attendeeA.company}</p>}
            </div>
            <div>
              <p className="text-gray-500">Attendee B</p>
              <p className="font-medium text-gray-900">{meeting.attendeeB.name ?? meeting.attendeeB.email}</p>
              {meeting.attendeeB.company && <p className="text-gray-500">{meeting.attendeeB.company}</p>}
            </div>
            <div>
              <p className="text-gray-500">Date & Time</p>
              <p className="font-medium text-gray-900">
                {format(meeting.timeBlock.startsAt, 'EEEE, MMM d')}
              </p>
              <p className="text-gray-600">
                {format(meeting.timeBlock.startsAt, 'h:mm a')} – {format(meeting.timeBlock.endsAt, 'h:mm a')}
              </p>
            </div>
            {meeting.timeBlock.location && (
              <div>
                <p className="text-gray-500">Location</p>
                <p className="font-medium text-gray-900">{meeting.timeBlock.location}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={update} className="space-y-4">
            <div>
              <label className="form-label">Status</label>
              <select name="status" defaultValue={meeting.status} className="form-input">
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea name="notes" rows={3} defaultValue={meeting.notes ?? ''} className="form-input"
                placeholder="Optional notes" />
            </div>

            <div className="flex items-center justify-between pt-2">
              {meeting.status !== 'CANCELLED' && (
                <form action={cancel}>
                  <button type="submit"
                    onClick={(e) => { if (!confirm('Cancel this meeting?')) e.preventDefault() }}
                    className="btn-danger text-sm">
                    Cancel Meeting
                  </button>
                </form>
              )}
              <div className="flex gap-3 ml-auto">
                <Link href="/dashboard/meetings" className="btn-secondary text-sm">Back</Link>
                <button type="submit" className="btn-primary text-sm">Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
