import { prisma } from '@conference/db'
import { LoginClient } from './LoginClient'

export default async function LoginPage() {
  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { loginTitle: true, loginSubtitle: true, loginButtonText: true },
  }).catch(() => null)

  return (
    <LoginClient
      loginTitle={(conference as any)?.loginTitle ?? 'eTail Palm Springs'}
      loginSubtitle={(conference as any)?.loginSubtitle ?? 'Your all-in-one conference companion'}
      loginButtonText={(conference as any)?.loginButtonText ?? 'Enter Conference'}
    />
  )
}
