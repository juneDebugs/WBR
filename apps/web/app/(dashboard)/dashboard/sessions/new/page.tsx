export const revalidate = 0
import { prisma, detectSpeakerConflicts } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createSession(formData: FormData) {
  'use server'
  const speakerId = formData.get('speakerId') as string | null

  await prisma.confSession.create({
    data: {
      conferenceId: formData.get('conferenceId') as string,
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || null,
      speakerId: speakerId || null,
      room: (formData.get('room') as string) || null,
      startsAt: new Date(formData.get('startsAt') as string),
      endsAt: new Date(formData.get('endsAt') as string),
      track: (formData.get('track') as string) || null,
      type: formData.get('type') as string,
    },
  })
  await detectSpeakerConflicts(prisma)
  revalidateTag('sessions')
  revalidateTag('conflicts')
  redirect('/dashboard/sessions')
}

export default async function NewSessionPage() {
  const [conferences, speakers] = await Promise.all([
    prisma.conference.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.speaker.findMany({ orderBy: { name: 'asc' } }),
  ])
  const activeConf = conferences.find(c => c.active) ?? conferences[0]

  return (
    <>
      <AdminHeader title="New Session" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/sessions" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Sessions
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={createSession} className="space-y-4">
            <input type="hidden" name="conferenceId" value={activeConf?.id ?? ''} />

            <div>
              <label className="form-label">Title *</label>
              <input name="title" required className="form-input" placeholder="Session title" />
            </div>

            <div>
              <label className="form-label">Description</label>
              <textarea name="description" rows={3} className="form-input" placeholder="Session description" />
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Room</label>
                <input name="room" className="form-input" placeholder="e.g. Main Hall" />
              </div>
              <div>
                <label className="form-label">Track</label>
                <input name="track" className="form-input" placeholder="e.g. AI/ML" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Type *</label>
                <select name="type" required className="form-input">
                  {['TALK', 'KEYNOTE', 'WORKSHOP', 'PANEL', 'BREAK'].map(t => (
                    <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Speaker</label>
                <select name="speakerId" className="form-input">
                  <option value="">— None —</option>
                  {speakers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard/sessions" className="btn-secondary text-sm">Cancel</Link>
              <button type="submit" className="btn-primary text-sm">Create Session</button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
