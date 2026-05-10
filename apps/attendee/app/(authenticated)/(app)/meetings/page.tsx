import { Suspense } from 'react'
import MeetingsClient from './MeetingsClient'
import MeetingsLoading from './loading'

export default function MeetingsPage() {
  return (
    <Suspense fallback={<MeetingsLoading />}>
      <MeetingsClient />
    </Suspense>
  )
}
