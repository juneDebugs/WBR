import { PeopleClient } from '@/components/people/PeopleClient'

// Data is fetched client-side via usePeopleData() hook in PeopleClient.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function PeoplePage() {
  return (
    <PeopleClient
      currentUserId=""
      allUsers={[]}
      totalCount={0}
      friends={[]}
      friendStatuses={{}}
      incomingRequests={[]}
      conversations={[]}
    />
  )
}
