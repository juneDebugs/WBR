export const revalidate = 0
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createTimeBlock(formData: FormData) {
  'use server'
  const conference = await prisma.conference.findFirst({ where: { active: true } })
  if (!conference) throw new Error('No active conference')

  await prisma.timeBlock.create({
    data: {
      conferenceId: conference.id,
      startsAt: new Date(formData.get('startsAt') as string),
      endsAt: new Date(formData.get('endsAt') as string),
      location: (formData.get('location') as string) || null,
      capacity: parseInt(formData.get('capacity') as string) || 1,
    },
  })
  redirect('/dashboard/time-blocks')
}

export default function NewTimeBlockPage() {
  return (
    <>
      <AdminHeader title="New Time Block" />
      <main className="flex-1 p-6 max-w-lg">
        <Link href="/dashboard/time-blocks" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Time Blocks
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={createTimeBlock} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Start Time *</label>
                <input name="startsAt" type="datetime-local" required className="form-input" />
              </div>
              <div>
                <label className="form-label">End Time *</label>
                <input name="endsAt" type="datetime-local" required className="form-input" />
              </div>
            </div>

            <div>
              <label className="form-label">Location</label>
              <input name="location" className="form-input" placeholder="e.g. Networking Lounge, Table 1" />
            </div>

            <div>
              <label className="form-label">Capacity</label>
              <input name="capacity" type="number" min="1" defaultValue="1" className="form-input w-24" />
              <p className="text-xs text-gray-400 mt-1">Max number of meetings for this time slot</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard/time-blocks" className="btn-secondary text-sm">Cancel</Link>
              <button type="submit" className="btn-primary text-sm">Create Time Block</button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
