import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

async function updateSpeaker(id: string, formData: FormData) {
  'use server'
  await prisma.speaker.update({
    where: { id },
    data: {
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

async function deleteSpeaker(id: string) {
  'use server'
  await prisma.speaker.delete({ where: { id } })
  redirect('/dashboard/speakers')
}

export default async function EditSpeakerPage({ params }: { params: { id: string } }) {
  const speaker = await prisma.speaker.findUnique({ where: { id: params.id } })
  if (!speaker) notFound()

  const update = updateSpeaker.bind(null, params.id)
  const del = deleteSpeaker.bind(null, params.id)

  return (
    <>
      <AdminHeader title="Edit Speaker" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/speakers" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Speakers
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={update} className="space-y-4">
            <div>
              <label className="form-label">Name *</label>
              <input name="name" required defaultValue={speaker.name} className="form-input" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Company</label>
                <input name="company" defaultValue={speaker.company ?? ''} className="form-input" />
              </div>
              <div>
                <label className="form-label">Job Title</label>
                <input name="jobTitle" defaultValue={speaker.jobTitle ?? ''} className="form-input" />
              </div>
            </div>

            <div>
              <label className="form-label">Bio</label>
              <textarea name="bio" rows={4} defaultValue={speaker.bio ?? ''} className="form-input" />
            </div>

            <div>
              <label className="form-label">Photo URL</label>
              <input name="photoUrl" type="url" defaultValue={speaker.photoUrl ?? ''} className="form-input" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Twitter / X Handle</label>
                <input name="twitterHandle" defaultValue={speaker.twitterHandle ?? ''} className="form-input" />
              </div>
              <div>
                <label className="form-label">LinkedIn URL</label>
                <input name="linkedinUrl" type="url" defaultValue={speaker.linkedinUrl ?? ''} className="form-input" />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <form action={del}>
                <button type="submit"
                  onClick={(e) => { if (!confirm('Delete this speaker?')) e.preventDefault() }}
                  className="btn-danger text-sm">
                  Delete
                </button>
              </form>
              <div className="flex gap-3">
                <Link href="/dashboard/speakers" className="btn-secondary text-sm">Cancel</Link>
                <button type="submit" className="btn-primary text-sm">Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
