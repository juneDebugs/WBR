export const revalidate = 60
import { prisma, detectSpeakerConflicts } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { DeleteSessionButton } from './DeleteSessionButton'
import { revalidateTag } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

async function updateSession(id: string, formData: FormData) {
  'use server'
  const startsAt = new Date(formData.get('startsAt') as string)
  const endsAt = new Date(formData.get('endsAt') as string)

  if (endsAt <= startsAt) {
    redirect(`/dashboard/sessions/${id}?error=end-before-start`)
  }

  await prisma.confSession.update({
    where: { id },
    data: {
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || null,
      speakerId: (formData.get('speakerId') as string) || null,
      room: (formData.get('room') as string) || null,
      startsAt,
      endsAt,
      track: (formData.get('track') as string) || null,
      type: formData.get('type') as string,
    },
  })
  await detectSpeakerConflicts(prisma)
  revalidateTag('sessions')
  revalidateTag('conflicts')
  redirect('/dashboard/sessions')
}

async function deleteSession(id: string) {
  'use server'
  await prisma.confSession.delete({ where: { id } })
  await detectSpeakerConflicts(prisma)
  revalidateTag('sessions')
  revalidateTag('conflicts')
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default async function EditSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  const [session, speakers] = await Promise.all([
    prisma.confSession.findUnique({ where: { id }, include: { speaker: true } }),
    prisma.speaker.findMany({ orderBy: { name: 'asc' } }),
  ])

  if (!session) notFound()

  const conference = await prisma.conference.findFirst({ where: { active: true } }) ??
    await prisma.conference.findFirst({ orderBy: { startDate: 'desc' } })
  const confMin = conference ? toLocalDatetimeString(conference.startDate) : undefined
  const confMax = conference ? toLocalDatetimeString(conference.endDate) : undefined

  const update = updateSession.bind(null, id)
  const del = deleteSession.bind(null, id)

  return (
    <>
      <AdminHeader title="Edit Session" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/sessions" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Sessions
        </Link>

        {error === 'end-before-start' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            End time must be after start time.
          </div>
        )}

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
                <input name="startsAt" type="datetime-local" required min={confMin} max={confMax}
                  defaultValue={toLocalDatetimeString(session.startsAt)} className="form-input" />
              </div>
              <div>
                <label className="form-label">End Time *</label>
                <input name="endsAt" type="datetime-local" required min={confMin} max={confMax}
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
              <DeleteSessionButton action={del} sessionId={id} />
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
