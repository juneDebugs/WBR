export const revalidate = 0
import { prisma, detectSpeakerConflicts } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

async function updateSession(id: string, formData: FormData) {
  'use server'
  await prisma.confSession.update({
    where: { id },
    data: {
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || null,
      speakerId: (formData.get('speakerId') as string) || null,
      room: (formData.get('room') as string) || null,
      startsAt: new Date(formData.get('startsAt') as string),
      endsAt: new Date(formData.get('endsAt') as string),
      track: (formData.get('track') as string) || null,
      type: formData.get('type') as string,
    },
  })
  await detectSpeakerConflicts(prisma)
  redirect('/dashboard/sessions')
}

async function deleteSession(id: string) {
  'use server'
  await prisma.confSession.delete({ where: { id } })
  await detectSpeakerConflicts(prisma)
  redirect('/dashboard/sessions')
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default async function EditSessionPage({ params }: { params: { id: string } }) {
  const [session, speakers] = await Promise.all([
    prisma.confSession.findUnique({ where: { id: params.id }, include: { speaker: true } }),
    prisma.speaker.findMany({ orderBy: { name: 'asc' } }),
  ])

  if (!session) notFound()

  const update = updateSession.bind(null, params.id)
  const del = deleteSession.bind(null, params.id)

  return (
    <>
      <AdminHeader title="Edit Session" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/sessions" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Sessions
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={update} className="space-y-4">
            <div>
              <label className="form-label">Title *</label>
              <input name="title" required defaultValue={session.title} className="form-input" />
            </div>

            <div>
              <label className="form-label">Description</label>
              <textarea name="description" rows={3} defaultValue={session.description ?? ''} className="form-input" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Start Time *</label>
                <input name="startsAt" type="datetime-local" required
                  defaultValue={toLocalDatetimeString(session.startsAt)} className="form-input" />
              </div>
              <div>
                <label className="form-label">End Time *</label>
                <input name="endsAt" type="datetime-local" required
                  defaultValue={toLocalDatetimeString(session.endsAt)} className="form-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Room</label>
                <input name="room" defaultValue={session.room ?? ''} className="form-input" />
              </div>
              <div>
                <label className="form-label">Track</label>
                <input name="track" defaultValue={session.track ?? ''} className="form-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Type *</label>
                <select name="type" required defaultValue={session.type} className="form-input">
                  {['TALK', 'KEYNOTE', 'WORKSHOP', 'PANEL', 'BREAK'].map(t => (
                    <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Speaker</label>
                <select name="speakerId" defaultValue={session.speakerId ?? ''} className="form-input">
                  <option value="">— None —</option>
                  {speakers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <form action={del}>
                <button type="submit"
                  onClick={(e) => { if (!confirm('Delete this session?')) e.preventDefault() }}
                  className="btn-danger text-sm">
                  Delete
                </button>
              </form>
              <div className="flex gap-3">
                <Link href="/dashboard/sessions" className="btn-secondary text-sm">Cancel</Link>
                <button type="submit" className="btn-primary text-sm">Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
