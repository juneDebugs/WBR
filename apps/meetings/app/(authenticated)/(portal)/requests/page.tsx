import { getSession } from '@/lib/session'
import { RequestsList } from '@/components/RequestsList'

export default async function RequestsPage() {
  const session = await getSession()
  const user = session!.user as any
  return <RequestsList currentUserId={user.id} />
}
