export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { AccessClient } from '@/components/AccessClient'

export default async function AccessPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      password: true,
      createdAt: true,
    },
  })

  return (
    <>
      <AdminHeader title="Access & Roles" />
      <main className="flex-1 p-6">
        <AccessClient
          users={users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image,
            role: u.role,
            hasPassword: !!u.password,
            createdAt: u.createdAt.toISOString(),
          }))}
        />
      </main>
    </>
  )
}
