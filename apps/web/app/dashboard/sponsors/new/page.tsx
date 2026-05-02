export const revalidate = 0
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createSponsor(formData: FormData) {
  'use server'
  const conference = await prisma.conference.findFirst({ where: { active: true } })
  if (!conference) throw new Error('No active conference')

  await prisma.sponsor.create({
    data: {
      conferenceId: conference.id,
      name: formData.get('name') as string,
      tier: formData.get('tier') as string,
      logoUrl: (formData.get('logoUrl') as string) || null,
      website: (formData.get('website') as string) || null,
      contactName: (formData.get('contactName') as string) || null,
      contactEmail: (formData.get('contactEmail') as string) || null,
      description: (formData.get('description') as string) || null,
    },
  })
  redirect('/dashboard/sponsors')
}

export default function NewSponsorPage() {
  return (
    <>
      <AdminHeader title="New Sponsor" />
      <main className="flex-1 p-6 max-w-2xl">
        <Link href="/dashboard/sponsors" className="text-sm text-primary hover:underline mb-6 block">
          ← Back to Sponsors
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <form action={createSponsor} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Company Name *</label>
                <input name="name" required className="form-input" placeholder="Acme Corp" />
              </div>

              <div>
                <label className="form-label">Sponsorship Tier</label>
                <select name="tier" className="form-input" defaultValue="GOLD">
                  <option value="PLATINUM">Platinum</option>
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="BRONZE">Bronze</option>
                </select>
              </div>

              <div>
                <label className="form-label">Logo URL</label>
                <input name="logoUrl" className="form-input" placeholder="https://..." />
              </div>

              <div className="col-span-2">
                <label className="form-label">Website</label>
                <input name="website" className="form-input" placeholder="https://acmecorp.com" />
              </div>

              <div>
                <label className="form-label">Contact Name</label>
                <input name="contactName" className="form-input" placeholder="Jane Smith" />
              </div>

              <div>
                <label className="form-label">Contact Email</label>
                <input name="contactEmail" type="email" className="form-input" placeholder="jane@acmecorp.com" />
              </div>

              <div className="col-span-2">
                <label className="form-label">Description</label>
                <textarea name="description" rows={3} className="form-input"
                  placeholder="Brief description of the sponsor and their products/services" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Link href="/dashboard/sponsors" className="btn-secondary text-sm">Cancel</Link>
              <button type="submit" className="btn-primary text-sm">Create Sponsor</button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
