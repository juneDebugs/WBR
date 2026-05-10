export const revalidate = 0
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

const inputClass = 'w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none'

export default function NewSpeakerPage() {
  return (
    <>
      <AdminHeader title="New Speaker" />
      <main className="flex-1 p-6 max-w-lg">
        <Link href="/dashboard/speakers" className="inline-flex items-center gap-1 text-[15px] text-[#007AFF] hover:opacity-70 transition-opacity mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Speakers
        </Link>

        <form action={createSpeaker} className="space-y-6">
          {/* Info section */}
          <div>
            <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Info</p>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Name</label>
                <input name="name" required placeholder="Required" className={inputClass} />
              </div>
              <div className="ml-24 border-b border-gray-100" />
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Company</label>
                <input name="company" placeholder="Optional" className={inputClass} />
              </div>
              <div className="ml-24 border-b border-gray-100" />
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Title</label>
                <input name="jobTitle" placeholder="Optional" className={inputClass} />
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
                <input name="photoUrl" type="url" placeholder="https://..." className={inputClass} />
              </div>
            </div>
          </div>

          {/* Social section */}
          <div>
            <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Social</p>
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">X / Twitter</label>
                <input name="twitterHandle" placeholder="@handle" className={inputClass} />
              </div>
              <div className="ml-24 border-b border-gray-100" />
              <div className="flex items-center px-4 py-2.5">
                <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">LinkedIn</label>
                <input name="linkedinUrl" type="url" placeholder="https://linkedin.com/in/..." className={inputClass} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
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
              Create Speaker
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
