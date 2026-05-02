export const revalidate = 30
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { SubmissionsView } from '@/components/SubmissionsView'
import { RegisterTeammate } from '@/components/RegisterTeammate'

export default async function SubmissionsPage() {
  const session = await getSession()
  const user = session!.user as any
  if (!user.sponsorId) redirect('/dashboard')

  const [forms, teammates] = await Promise.all([
    prisma.submissionForm.findMany({
      where: { sponsorId: user.sponsorId },
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { sponsorId: user.sponsorId, id: { not: user.id } },
      select: { id: true, name: true, email: true, image: true, jobTitle: true, role: true },
      orderBy: { name: 'asc' },
    }),
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
