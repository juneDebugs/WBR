import { getUserFromHeaders } from '@/lib/user'
import { RequestsList } from '@/components/RequestsList'

export default async function RequestsPage() {
  const user = await getUserFromHeaders()
  return <RequestsList currentUserId={user.id} />
}
