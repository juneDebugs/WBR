import { redirect } from 'next/navigation'
import { getUserFromHeaders } from '@/lib/user'
import { SubmissionsView } from '@/components/SubmissionsView'
import { RegisterTeammate } from '@/components/RegisterTeammate'

export default async function SubmissionsPage() {
  const user = await getUserFromHeaders()
  if (!user.sponsorId) redirect('/dashboard')

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <RegisterTeammate />
      <SubmissionsView />
    </div>
  )
}
