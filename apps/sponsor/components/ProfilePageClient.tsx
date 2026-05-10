'use client'

import { useUser, useSponsorProfile } from '@/lib/hooks'
import { ProfileEditor } from './ProfileEditor'
import ProfileLoading from '@/app/(authenticated)/(portal)/profile/loading'

export function ProfilePageClient() {
  const { sponsorId, id: currentUserId } = useUser()
  const { data, isLoading } = useSponsorProfile()

  if (!sponsorId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">No sponsor company linked to your account.</p>
      </div>
    )
  }

  if (isLoading || !data?.sponsor) return <ProfileLoading />

  return (
    <ProfileEditor
      sponsor={data.sponsor}
      currentUserId={currentUserId}
      availableUsers={data.availableUsers}
    />
  )
}
