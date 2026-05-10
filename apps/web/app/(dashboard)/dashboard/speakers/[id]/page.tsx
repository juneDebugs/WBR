export const revalidate = 60
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { ConfirmButton } from '@/components/ConfirmButton'
import { redirect, notFound } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import Link from 'next/link'

async function revalidateAttendeeSpeakers(speakerId?: string) {
  const tags = ['speakers']
  if (speakerId) tags.push(`speaker-${speakerId}`)
  try {
    await fetch('http://localhost:3001/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, tags }),
    })
  } catch {
    // Attendee app may not be running; ignore
  }
}

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
  revalidateTag('speakers')
  await revalidateAttendeeSpeakers(id)
  redirect('/dashboard/speakers')
}

async function deleteSpeaker(id: string) {
  'use server'
  await prisma.speaker.delete({ where: { id } })
  revalidateTag('speakers')
  await revalidateAttendeeSpeakers(id)
  redirect('/dashboard/speakers')
}

const inputClass = 'w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none'

export default async function EditSpeakerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const speaker = await prisma.speaker.findUnique({ where: { id } })
  if (!speaker) notFound()

  const update = updateSpeaker.bind(null, id)
  const del = deleteSpeaker.bind(null, id)

  return (
    <>
      <AdminHeader title="Edit Speaker" />
      <main className="flex-1 p-6 max-w-lg">
        <Link href="/dashboard/speakers" className="inline-flex items-center gap-1 text-[15px] text-[#007AFF] hover:opacity-70 transition-opacity mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Speakers
        </Link>

        <form action={update} className="space-y-6">
          {/* Info section */}
          <div>
            <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Info</p>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Name</label>
                <input name="name" required defaultValue={speaker.name} placeholder="Required" className={inputClass} />
              </div>
              <div className="ml-24 border-b border-gray-100" />
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Company</label>
                <input name="company" defaultValue={speaker.company ?? ''} placeholder="Optional" className={inputClass} />
              </div>
              <div className="ml-24 border-b border-gray-100" />
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Title</label>
                <input name="jobTitle" defaultValue={speaker.jobTitle ?? ''} placeholder="Optional" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Bio section */}
          <div>
            <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Bio</p>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
              <textarea
                name="bio"
                rows={4}
                defaultValue={speaker.bio ?? ''}
                placeholder="Write a short bio..."
                className="w-full px-4 py-3 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none resize-none"
              />
            </div>
          </div>

          {/* Photo section */}
          <div>
            <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Photo</p>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">URL</label>
                <input name="photoUrl" type="url" defaultValue={speaker.photoUrl ?? ''} placeholder="https://..." className={inputClass} />
              </div>
            </div>
          </div>

          {/* Social section */}
          <div>
            <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Social</p>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">X / Twitter</label>
                <input name="twitterHandle" defaultValue={speaker.twitterHandle ?? ''} placeholder="@handle" className={inputClass} />
              </div>
              <div className="ml-24 border-b border-gray-100" />
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">LinkedIn</label>
                <input name="linkedinUrl" type="url" defaultValue={speaker.linkedinUrl ?? ''} placeholder="https://linkedin.com/in/..." className={inputClass} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <form action={del}>
              <ConfirmButton message="Delete this speaker? This cannot be undone." className="px-4 py-2 text-[15px] font-normal text-[#FF3B30] rounded-xl hover:bg-red-50 transition-colors">
                Delete Speaker
              </ConfirmButton>
            </form>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/speakers"
                className="px-5 py-2 text-[15px] font-normal text-[#007AFF] rounded-xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-5 py-2 text-[15px] font-semibold text-white bg-[#007AFF] rounded-xl hover:bg-[#0066d6] active:bg-[#004dad] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </main>
    </>
  )
}
