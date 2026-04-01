import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createSpeaker(formData: FormData) {
  'use server'
  const conference = await prisma.conference.findFirst({ where: { active: true } })
  if (!conference) throw new Error('No active conference')

  await prisma.speaker.create({
    data: {
      conferenceId: conference.id,
      name: formData.get('name') as string,
      bio: (formData.get('bio') as string) || null,
      photoUrl: (formData.get('photoUrl') as string) || null,
      company: (formData.get('company') as string) || null,
      jobTitle: (formData.get('jobTitle') as string) || null,
      twitterHandle: (formData.get('twitterHandle') as string) || null,
      linkedinUrl: (formData.get('linkedinUrl') as string) || null,
    },
  })
  redirect('/dashboard/speakers')
}

export default function NewSpeakerPage() {
  return (
    <>
      <AdminHeader title="New Speaker" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/speakers" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Speakers
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={createSpeaker} className="space-y-4">
            <div>
              <label className="form-label">Name *</label>
              <input name="name" required className="form-input" placeholder="Full name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Company</label>
                <input name="company" className="form-input" placeholder="Company name" />
              </div>
              <div>
                <label className="form-label">Job Title</label>
                <input name="jobTitle" className="form-input" placeholder="e.g. Senior Engineer" />
              </div>
            </div>

            <div>
              <label className="form-label">Bio</label>
              <textarea name="bio" rows={4} className="form-input" placeholder="Speaker biography" />
            </div>

            <div>
              <label className="form-label">Photo URL</label>
              <input name="photoUrl" type="url" className="form-input" placeholder="https://..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Twitter / X Handle</label>
                <input name="twitterHandle" className="form-input" placeholder="@handle" />
              </div>
              <div>
                <label className="form-label">LinkedIn URL</label>
                <input name="linkedinUrl" type="url" className="form-input" placeholder="https://linkedin.com/in/..." />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard/speakers" className="btn-secondary text-sm">Cancel</Link>
              <button type="submit" className="btn-primary text-sm">Create Speaker</button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
