'use client'

import { useSetupData } from '@/lib/hooks'
import { SetupClient } from './SetupClient'

function SetupLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-fill-2 mb-3" />
        <div className="h-5 w-32 bg-fill-2 rounded" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i}>
            <div className="h-3 w-16 bg-fill-2 rounded mb-2" />
            <div className="h-10 bg-fill-2 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SetupClientWrapper() {
  const { data, isLoading } = useSetupData()

  if (isLoading || !data) return <SetupLoading />

  return (
    <SetupClient
      userId={data.userId}
      userName={data.userName}
      userImage={data.userImage}
      userBio={data.userBio}
      userJobTitle={data.userJobTitle}
      userCompany={data.userCompany}
      userWebsite={data.userWebsite}
      userCompanySize={data.userCompanySize}
      userAnnualRevenue={data.userAnnualRevenue}
      userSolutionsOffering={data.userSolutionsOffering}
      userSolutionsSeeking={data.userSolutionsSeeking}
      blackouts={data.blackouts}
    />
  )
}
