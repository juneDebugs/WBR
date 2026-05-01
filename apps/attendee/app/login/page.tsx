export const revalidate = 3600

import { prisma } from '@conference/db'
import { LoginClient } from './LoginClient'

export default async function LoginPage() {
  let loginTitle = 'eTail Palm Springs'
  let loginSubtitle = 'Your all-in-one conference companion'
  let loginButtonText = 'Enter Conference'

  try {
    const conference = await prisma.conference.findFirst({
      where: { active: true },
    })
    if (conference) {
      loginTitle = (conference as any).loginTitle || loginTitle
      loginSubtitle = (conference as any).loginSubtitle || loginSubtitle
      loginButtonText = (conference as any).loginButtonText || loginButtonText
    }
  } catch {
    // DB query failed — use defaults
  }

  return (
    <LoginClient
      loginTitle={loginTitle}
      loginSubtitle={loginSubtitle}
      loginButtonText={loginButtonText}
    />
  )
}
