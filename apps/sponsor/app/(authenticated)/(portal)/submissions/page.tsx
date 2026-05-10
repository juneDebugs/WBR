import { SubmissionsView } from '@/components/SubmissionsView'
import { RegisterTeammate } from '@/components/RegisterTeammate'

// Data is fetched client-side via hooks (useSubmissionForms, useTeammates).
// Do NOT add blocking server-side fetches here — it causes white screen delays.
export default function SubmissionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <RegisterTeammate />
      <SubmissionsView />
    </div>
  )
}
