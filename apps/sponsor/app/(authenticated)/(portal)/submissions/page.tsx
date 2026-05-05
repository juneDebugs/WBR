import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { SubmissionsView } from '@/components/SubmissionsView'
import { RegisterTeammate } from '@/components/RegisterTeammate'

function getCachedForms(sponsorId: string) {
  return unstable_cache(
    async () => prisma.submissionForm.findMany({
      where: { sponsorId },
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    ['submissions-forms', sponsorId],
    { revalidate: 60, tags: [`submissions-${sponsorId}`] },
  )()
}

function getCachedTeammates(sponsorId: string, userId: string) {
  return unstable_cache(
    async () => prisma.user.findMany({
      where: { sponsorId, id: { not: userId } },
      select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
      orderBy: { name: 'asc' },
    }),
    ['submissions-teammates', sponsorId, userId],
    { revalidate: 60, tags: [`sponsor-${sponsorId}`] },
  )()
}

export default async function SubmissionsPage() {
  const session = await getSession()
  const user = session!.user as any
  if (!user.sponsorId) redirect('/dashboard')

  const [forms, teammates] = await Promise.all([
    getCachedForms(user.sponsorId),
    getCachedTeammates(user.sponsorId, user.id),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <RegisterTeammate teammates={teammates} />
      <SubmissionsView
        initialForms={forms.map(f => ({
          id: f.id,
          title: f.title,
          type: f.type,
          description: f.description,
          fields: f.fields,
          isOpen: f.isOpen,
          deadline: f.deadline?.toISOString() ?? null,
          createdAt: f.createdAt.toISOString(),
          submissionCount: f._count.submissions,
        }))}
      />
    </div>
  )
}
