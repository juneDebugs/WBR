import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { SubmissionsView } from '@/components/SubmissionsView'
import { RegisterTeammate } from '@/components/RegisterTeammate'

export default async function SubmissionsPage() {
  const session = await getSession()
  const user = session!.user as any
  if (!user.sponsorId) redirect('/dashboard')

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <RegisterTeammate />
      <SubmissionsView />
    </div>
  )
}
