export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { SubmissionsView } from '@/components/SubmissionsView'

export default async function SubmissionsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any
  if (!user.sponsorId) redirect('/dashboard')

  const forms = await prisma.submissionForm.findMany({
    where: { sponsorId: user.sponsorId },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
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
